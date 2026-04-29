// ============================================================
// 추출 payload 빌더 훅
// ============================================================
// scope에 맞춰 wa-sqlite에서 필요한 데이터를 SELECT하고 ExportPayload를 만든다.
// 모달의 "내보내기" 버튼 클릭 시점에 한 번 호출 → IPC/Web 어댑터로 전달.
// ============================================================

import { useCallback } from 'react';
import { usePowerSync } from '@powersync/react';
import { useAuthStore } from '../stores/authStore';
import { useWriterId } from './useWriterId';
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
  PlanSnapshot,
  PlotEpisodeLinkSnapshot,
  PlotSnapshot,
  WorkSnapshot,
  WorldNoteSnapshot,
} from '../types/export';

interface PowerSyncDb {
  getAll: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
  getOptional: <T>(sql: string, params?: unknown[]) => Promise<T | null>;
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

export function useExportPayload(): (scope: ExportScope) => Promise<ExportPayload> {
  const db = usePowerSync() as unknown as PowerSyncDb;
  const writerId = useWriterId();
  const writer = useAuthStore((s) => s.writer);

  return useCallback(
    async (scope: ExportScope): Promise<ExportPayload> => {
      const work = await db.getOptional<WorkSnapshot>(
        `SELECT id, title, author_name, description, status FROM work
         WHERE id = ? AND writer_id = ?`,
        [scope.workId, writerId],
      );
      if (!work) {
        throw new Error('작품을 찾을 수 없습니다.');
      }

      const authorName =
        work.author_name?.trim() || writer?.nickname?.trim() || '작가 미상';

      // 항상 episodes는 조회한다(설정집의 plot/foreshadow 라벨 매핑에 사용)
      const episodes = await db.getAll<EpisodeSnapshot>(
        `SELECT id, parent_id, title, status, content, word_count, sort_order
         FROM episode
         WHERE work_id = ? AND writer_id = ? AND status != 'trashed'
         ORDER BY sort_order ASC, created_at ASC`,
        [scope.workId, writerId],
      );

      const payload: ExportPayload = {
        work,
        author: { name: authorName },
        episodes,
      };

      if (scope.kind === 'planSet') {
        const planRow = await db.getOptional<{
          slogan: string | null;
          genres: string | null;
          moods: string | null;
          target_audience: string | null;
        }>(
          `SELECT slogan, genres, moods, target_audience FROM plan
           WHERE work_id = ? AND writer_id = ?`,
          [scope.workId, writerId],
        );
        const plan: PlanSnapshot | null = planRow
          ? {
              slogan: planRow.slogan,
              genres: parseJsonArray(planRow.genres),
              moods: parseJsonArray(planRow.moods),
              target_audience: planRow.target_audience,
            }
          : null;
        payload.plan = plan;

        payload.planNotes = await db.getAll<PlanNoteSnapshot>(
          `SELECT id, title, content, sort_order FROM plan_note
           WHERE work_id = ? AND writer_id = ?
           ORDER BY sort_order ASC, created_at ASC`,
          [scope.workId, writerId],
        );

        payload.characters = await db.getAll<CharacterSnapshot>(
          `SELECT id, name, profile_image_url, gender, age, sort_order FROM character
           WHERE work_id = ? AND writer_id = ?
           ORDER BY sort_order ASC, created_at ASC`,
          [scope.workId, writerId],
        );

        if (payload.characters.length > 0) {
          const charIds = payload.characters.map((c) => c.id);
          const placeholders = charIds.map(() => '?').join(', ');
          payload.characterNotes = await db.getAll<CharacterNoteSnapshot>(
            `SELECT id, character_id, kind, title, content, sort_order
             FROM character_note
             WHERE character_id IN (${placeholders}) AND writer_id = ?
             ORDER BY sort_order ASC, created_at ASC`,
            [...charIds, writerId],
          );
          payload.characterCustomFields = await db.getAll<CharacterCustomFieldSnapshot>(
            `SELECT character_id, field_name, field_value, sort_order
             FROM character_custom_field
             WHERE character_id IN (${placeholders})
             ORDER BY sort_order ASC, created_at ASC`,
            charIds,
          );
        } else {
          payload.characterNotes = [];
          payload.characterCustomFields = [];
        }

        payload.plots = await db.getAll<PlotSnapshot>(
          `SELECT id, parent_id, title, status, content, sort_order FROM plot
           WHERE work_id = ? AND writer_id = ?
           ORDER BY sort_order ASC, created_at ASC`,
          [scope.workId, writerId],
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

        payload.worldNotes = await db.getAll<WorldNoteSnapshot>(
          `SELECT id, parent_id, name, content, sort_order FROM world_note
           WHERE work_id = ? AND writer_id = ?
           ORDER BY sort_order ASC, created_at ASC`,
          [scope.workId, writerId],
        );

        payload.foreshadows = await db.getAll<ForeshadowSnapshot>(
          `SELECT id, title, status, importance, content, sort_order FROM foreshadow
           WHERE work_id = ? AND writer_id = ?
           ORDER BY sort_order ASC, created_at ASC`,
          [scope.workId, writerId],
        );

        if (payload.foreshadows.length > 0) {
          const fIds = payload.foreshadows.map((f) => f.id);
          const placeholders = fIds.map(() => '?').join(', ');
          payload.foreshadowLinks = await db.getAll<ForeshadowLinkSnapshot>(
            `SELECT foreshadow_id, link_type, episode_id, plot_id, context_memo
             FROM foreshadow_link
             WHERE foreshadow_id IN (${placeholders})`,
            fIds,
          );
        } else {
          payload.foreshadowLinks = [];
        }

        payload.ideaArchives = await db.getAll<IdeaArchiveSnapshot>(
          `SELECT id, content, tag, sort_order FROM idea_archive
           WHERE work_id = ? AND writer_id = ?
           ORDER BY sort_order ASC, created_at ASC`,
          [scope.workId, writerId],
        );
      }

      return payload;
    },
    [db, writerId, writer],
  );
}
