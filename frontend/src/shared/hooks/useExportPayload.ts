// ============================================================
// 추출 payload 빌더 훅
// ============================================================
// scope에 맞춰 wa-sqlite에서 필요한 데이터를 SELECT하고 ExportPayload를 만든다.
// 모달의 "내보내기" 버튼 클릭 시점에 한 번 호출 → IPC/Web 어댑터로 전달.
//
// v1 암호화 정책: 거의 모든 텍스트 필드(work.title/author_name/description, episode.title/content,
// plot.title/content, plan_note.title/content, world_note.name/content, character.name/age,
// character_note.title/content, character_custom_field.field_name/field_value,
// foreshadow.title/content, foreshadow_link.context_memo, idea_archive.content) 가
// "v1:" 접두사 ciphertext 로 저장된다. payload 가 외부 파일로 나가기 전에 반드시 복호화해야
// 한다 — 그렇지 않으면 사용자가 내려받은 TXT/DOCX/PDF 가 base64 가비지로 채워짐.
// ============================================================

import { useCallback } from 'react';
import { usePowerSync } from '@powersync/react';
import { useAuthStore } from '../stores/authStore';
import { useWriterId } from './useWriterId';
import { decryptString } from '../crypto/cipher';
import { getCurrentKek } from '../crypto/lifecycle';
import { ensureWorkKey } from '../crypto/workKey';
import type {
  CharacterCustomFieldSnapshot,
  CharacterNoteSnapshot,
  CharacterSnapshot,
  EpisodeSnapshot,
  ExportPayload,
  ExportScope,
  ForeshadowLinkSnapshot,
  ForeshadowSnapshot,
  IdeaArchiveSnapshot,
  PlanNoteSnapshot,
  PlotEpisodeLinkSnapshot,
  PlotSnapshot,
  WorkSnapshot,
  WorldNoteSnapshot,
} from '../types/export';

interface PowerSyncDb {
  getAll: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
  getOptional: <T>(sql: string, params?: unknown[]) => Promise<T | null>;
}

const PREFIX = 'v1:';

function isCipher(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith(PREFIX);
}

function parseJsonArray(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map((x) => String(x)) : null;
  } catch {
    return null;
  }
}

/**
 * workKey 가 풀렸으면 그 키로, 아니면 그대로 반환하는 batch decryptor.
 * 평문 행이면 입력 그대로, ciphertext 인데 키가 없으면 입력 그대로(폴백) — UI/파일이 깨지지 않게.
 */
function makeDecryptor(workKey: CryptoKey | null) {
  return async <T extends string | null | undefined>(value: T): Promise<T> => {
    if (value == null || value === '') return value;
    if (!isCipher(value)) return value;
    if (!workKey) return value;
    try {
      const plain = await decryptString(workKey, value.slice(PREFIX.length));
      return plain as T;
    } catch {
      return value;
    }
  };
}

export function useExportPayload(): (scope: ExportScope) => Promise<ExportPayload> {
  const db = usePowerSync() as unknown as PowerSyncDb;
  const writerId = useWriterId();
  const writer = useAuthStore((s) => s.writer);

  return useCallback(
    async (scope: ExportScope): Promise<ExportPayload> => {
      const workRow = await db.getOptional<{
        id: string;
        title: string;
        author_name: string | null;
        description: string | null;
        status: string;
        genres: string | null;
        moods: string | null;
        encrypted_dek: string | null;
      }>(
        `SELECT id, title, author_name, description, status, genres, moods, encrypted_dek FROM work
         WHERE id = ? AND writer_id = ?`,
        [scope.workId, writerId],
      );
      if (!workRow) {
        throw new Error('작품을 찾을 수 없습니다.');
      }

      // ── work_key 한번만 풀고 모든 행 복호화에 재사용 ──
      const kek = getCurrentKek();
      let workKey: CryptoKey | null = null;
      if (kek && workRow.encrypted_dek) {
        try {
          workKey = await ensureWorkKey({
            kek,
            workId: scope.workId,
            loadEncryptedDek: async () => workRow.encrypted_dek,
            saveEncryptedDek: async () => {
              throw new Error('export must not create new work_key');
            },
          });
        } catch {
          // 키 풀기 실패 — 평문 폴백 시도, ciphertext 컬럼은 ciphertext 그대로 노출
          workKey = null;
        }
      }
      const dec = makeDecryptor(workKey);

      // ── work ──
      const [workTitle, workAuthorName, workDescription] = await Promise.all([
        dec(workRow.title),
        dec(workRow.author_name),
        dec(workRow.description),
      ]);
      const work: WorkSnapshot = {
        id: workRow.id,
        title: workTitle ?? '',
        author_name: workAuthorName ?? null,
        description: workDescription ?? null,
        status: workRow.status,
        genres: parseJsonArray(workRow.genres),
        moods: parseJsonArray(workRow.moods),
      };

      const authorName =
        work.author_name?.trim() || writer?.nickname?.trim() || '작가 미상';

      // ── episodes (모든 scope 에서 사용 — plot/foreshadow 라벨 매핑) ──
      const rawEpisodes = await db.getAll<EpisodeSnapshot>(
        `SELECT id, parent_id, title, status, content, word_count, sort_order
         FROM episode
         WHERE work_id = ? AND writer_id = ? AND status != 'trashed'
         ORDER BY sort_order ASC, created_at ASC`,
        [scope.workId, writerId],
      );
      const episodes: EpisodeSnapshot[] = await Promise.all(
        rawEpisodes.map(async (ep) => ({
          ...ep,
          title: (await dec(ep.title)) ?? '',
          content: await dec(ep.content),
        })),
      );

      const payload: ExportPayload = {
        work,
        author: { name: authorName },
        episodes,
      };

      if (scope.kind === 'planSet') {
        // sections 필터 — 미지정 시 모든 섹션 포함 (back-compat).
        const wants = (s: 'plan' | 'characters' | 'worldNotes' | 'plots' | 'foreshadows' | 'ideas') =>
          !scope.sections || scope.sections.includes(s);

        if (wants('plan')) {
          const rawPlanNotes = await db.getAll<PlanNoteSnapshot>(
            `SELECT id, title, content, sort_order FROM plan_note
             WHERE work_id = ? AND writer_id = ?
             ORDER BY sort_order ASC, created_at ASC`,
            [scope.workId, writerId],
          );
          payload.planNotes = await Promise.all(
            rawPlanNotes.map(async (n) => ({
              ...n,
              title: (await dec(n.title)) ?? '',
              content: await dec(n.content),
            })),
          );
        }

        if (wants('characters')) {
          const rawCharacters = await db.getAll<CharacterSnapshot>(
            `SELECT id, name, profile_image_url, gender, age, sort_order FROM character
             WHERE work_id = ? AND writer_id = ?
             ORDER BY sort_order ASC, created_at ASC`,
            [scope.workId, writerId],
          );
          payload.characters = await Promise.all(
            rawCharacters.map(async (c) => ({
              ...c,
              name: (await dec(c.name)) ?? '',
              age: (await dec(c.age)) ?? '',
            })),
          );

          if (payload.characters.length > 0) {
            const charIds = payload.characters.map((c) => c.id);
            const placeholders = charIds.map(() => '?').join(', ');
            const rawNotes = await db.getAll<CharacterNoteSnapshot>(
              `SELECT id, character_id, kind, title, content, sort_order
               FROM character_note
               WHERE character_id IN (${placeholders}) AND writer_id = ?
               ORDER BY sort_order ASC, created_at ASC`,
              [...charIds, writerId],
            );
            payload.characterNotes = await Promise.all(
              rawNotes.map(async (n) => ({
                ...n,
                title: (await dec(n.title)) ?? '',
                content: await dec(n.content),
              })),
            );
            const rawCustom = await db.getAll<CharacterCustomFieldSnapshot>(
              `SELECT character_id, field_name, field_value, sort_order
               FROM character_custom_field
               WHERE character_id IN (${placeholders})
               ORDER BY sort_order ASC, created_at ASC`,
              charIds,
            );
            payload.characterCustomFields = await Promise.all(
              rawCustom.map(async (f) => ({
                ...f,
                field_name: (await dec(f.field_name)) ?? '',
                field_value: (await dec(f.field_value)) ?? '',
              })),
            );
          } else {
            payload.characterNotes = [];
            payload.characterCustomFields = [];
          }
        }

        if (wants('plots')) {
          const rawPlots = await db.getAll<PlotSnapshot>(
            `SELECT id, parent_id, title, status, content, sort_order FROM plot
             WHERE work_id = ? AND writer_id = ?
             ORDER BY sort_order ASC, created_at ASC`,
            [scope.workId, writerId],
          );
          payload.plots = await Promise.all(
            rawPlots.map(async (p) => ({
              ...p,
              title: (await dec(p.title)) ?? '',
              content: await dec(p.content),
            })),
          );

          if (payload.plots.length > 0) {
            const plotIds = payload.plots.map((p) => p.id);
            const placeholders = plotIds.map(() => '?').join(', ');
            payload.plotEpisodeLinks = await db.getAll<PlotEpisodeLinkSnapshot>(
              `SELECT plot_id, episode_id FROM plot_episode_link
               WHERE plot_id IN (${placeholders})`,
              plotIds,
            );
          } else {
            payload.plotEpisodeLinks = [];
          }
        }

        if (wants('worldNotes')) {
          const rawWorldNotes = await db.getAll<WorldNoteSnapshot>(
            `SELECT id, parent_id, name, content, sort_order FROM world_note
             WHERE work_id = ? AND writer_id = ?
             ORDER BY sort_order ASC, created_at ASC`,
            [scope.workId, writerId],
          );
          payload.worldNotes = await Promise.all(
            rawWorldNotes.map(async (n) => ({
              ...n,
              name: (await dec(n.name)) ?? '',
              content: await dec(n.content),
            })),
          );
        }

        if (wants('foreshadows')) {
          const rawForeshadows = await db.getAll<ForeshadowSnapshot>(
            `SELECT id, title, status, importance, content, sort_order FROM foreshadow
             WHERE work_id = ? AND writer_id = ?
             ORDER BY sort_order ASC, created_at ASC`,
            [scope.workId, writerId],
          );
          payload.foreshadows = await Promise.all(
            rawForeshadows.map(async (f) => ({
              ...f,
              title: (await dec(f.title)) ?? '',
              content: await dec(f.content),
            })),
          );

          if (payload.foreshadows.length > 0) {
            const fIds = payload.foreshadows.map((f) => f.id);
            const placeholders = fIds.map(() => '?').join(', ');
            const rawLinks = await db.getAll<ForeshadowLinkSnapshot>(
              `SELECT foreshadow_id, link_type, episode_id, plot_id, context_memo
               FROM foreshadow_link
               WHERE foreshadow_id IN (${placeholders})`,
              fIds,
            );
            payload.foreshadowLinks = await Promise.all(
              rawLinks.map(async (l) => ({
                ...l,
                context_memo: await dec(l.context_memo),
              })),
            );
          } else {
            payload.foreshadowLinks = [];
          }
        }

        if (wants('ideas')) {
          const rawIdeas = await db.getAll<IdeaArchiveSnapshot>(
            `SELECT id, content, tag, sort_order FROM idea_archive
             WHERE work_id = ? AND writer_id = ?
             ORDER BY sort_order ASC, created_at ASC`,
            [scope.workId, writerId],
          );
          payload.ideaArchives = await Promise.all(
            rawIdeas.map(async (i) => ({
              ...i,
              content: (await dec(i.content)) ?? '',
            })),
          );
        }
      }

      return payload;
    },
    [db, writerId, writer],
  );
}
