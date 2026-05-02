import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@powersync/react';
import type {
  AiCharacterCustomFieldPayload,
  AiCharacterNotePayload,
  AiCharacterPayload,
  AiContextPayload,
  AiForeshadowPayload,
  AiPlotPayload,
  AiRecentEpisodePayload,
  AiWorkMetaPayload,
  AiWorldNotePayload,
} from '../types/aiContextPayload';
import { decryptString } from '../crypto/cipher';
import { getCurrentKek } from '../crypto/lifecycle';
import { ensureWorkKey } from '../crypto/workKey';
import {
  useDecryptedCharacterList,
  type RawCharacterRow,
} from './useDecryptedCharacter';
import {
  useDecryptedCharacterNoteList,
  type RawCharacterNoteRow,
} from './useDecryptedCharacterNote';
import {
  useDecryptedForeshadowList,
  type RawForeshadowRow,
} from './useDecryptedForeshadow';
import {
  useDecryptedPlotList,
  type RawPlotRow,
} from './useDecryptedPlot';
import {
  useDecryptedWorldNoteList,
  type RawWorldNoteRow,
} from './useDecryptedWorldNote';
import { useDecryptedWork } from './useDecryptedWork';

const PREFIX = 'v1:';

// AI 서버 RECENT_RAW_LIMIT(draft_opus=4, draft_sonnet=2, review=1)의 최대값.
// 클라이언트는 mode를 모르므로 최대값을 보내고 서버에서 trim한다.
// 안전마진을 더 두면 페이로드만 커지고 서버 trim에서 버려진다 (에피소드 1개=수 KB).
const RECENT_EPISODES_LIMIT = 4;

function isCipher(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.startsWith(PREFIX);
}

interface RawCharacterCustomFieldRow {
  character_id: string;
  field_name: string | null;
  field_value: string | null;
  sort_order: number | null;
  /** JOIN: character.work_id */
  work_id: string;
  /** JOIN: work.encrypted_dek */
  encrypted_dek: string | null;
}

interface RawEpisodeRow {
  id: string;
  work_id: string;
  sort_order: number;
  title: string | null;
  content: string | null;
  encrypted_dek: string | null;
}

/**
 * PR5 — AI 호출 직전 KEK + work_key로 평문 컨텍스트를 조립하는 훅.
 *
 * <p>AI 서버는 더 이상 암호화 컬럼을 직접 SELECT하지 않는다. 클라이언트가 메모리에서
 * 평문화한 work_meta / characters / world_notes / foreshadows / plots / recent_episodes 를
 * 페이로드로 동봉해 호출하면, AI 서버는 페이로드만으로 RAG 컨텍스트를 조립한다.
 *
 * <p>vector_search / timeline 은 평문 예외 영역(episode_chunk + embedding)이라
 * 페이로드에 포함하지 않고 AI 서버가 DB에서 직접 읽는다.
 *
 * @param workId  대상 작품 id
 * @param currentEpisodeNum  이번 회차 번호(=sort_order + 1). recent_episodes는
 *  이보다 작은 sort_order 중 최신 N개를 조립한다.
 */
export function useAiContextPayload(
  workId: string | null,
  currentEpisodeNum: number,
): {
  payload: AiContextPayload | null;
  isLoading: boolean;
  /**
   * payload에 v1: 잔재가 남았는지. true이면 호출 사이트는 AI 호출을 막아야 한다.
   * (KEK 부재 / work_key 도출 실패 / pepper 불일치 등으로 일부 행이 평문화 못 된 경우)
   * 토큰을 태우고도 LLM이 못 읽는 사고를 방지하기 위한 게이트.
   */
  hasUndecrypted: boolean;
} {
  const enabled = !!workId;

  // work 메타 — encrypted_dek를 work_id로 가져오므로 useDecryptedWork 재사용.
  const { data: work, isLoading: workLoading } = useDecryptedWork(
    enabled ? workId! : '',
  );

  // characters — list 훅은 raw rows + JOIN encrypted_dek를 받는다.
  const { data: characterRows = [] } = useQuery<RawCharacterRow>(
    enabled
      ? `SELECT c.id, c.work_id, c.writer_id, c.name, c.gender, c.age,
                c.profile_image_url, c.sort_order, c.created_at, c.updated_at,
                w.encrypted_dek
           FROM character c
           JOIN work w ON w.id = c.work_id
           WHERE c.work_id = ?
           ORDER BY c.sort_order`
      : `SELECT '' as id, '' as work_id, '' as writer_id, '' as name, null as gender,
                null as age, null as profile_image_url, 0 as sort_order,
                '' as created_at, '' as updated_at, null as encrypted_dek WHERE 0`,
    enabled ? [workId!] : [],
  );
  const { data: characters } = useDecryptedCharacterList(characterRows);

  // character_note — character JOIN으로 work_id, encrypted_dek 결합.
  const { data: characterNoteRows = [] } = useQuery<RawCharacterNoteRow>(
    enabled
      ? `SELECT cn.id, cn.character_id, cn.writer_id, cn.kind, cn.title, cn.content,
                cn.sort_order, cn.created_at, cn.updated_at,
                c.work_id, w.encrypted_dek
           FROM character_note cn
           JOIN character c ON c.id = cn.character_id
           JOIN work w ON w.id = c.work_id
           WHERE c.work_id = ?
           ORDER BY cn.sort_order`
      : `SELECT '' as id, '' as character_id, '' as writer_id, '' as kind,
                null as title, null as content, 0 as sort_order,
                '' as created_at, '' as updated_at,
                '' as work_id, null as encrypted_dek WHERE 0`,
    enabled ? [workId!] : [],
  );
  const { data: characterNotes } = useDecryptedCharacterNoteList(characterNoteRows);

  // character_custom_field — 별도 훅이 없어 빌더에서 직접 평문화.
  const { data: customFieldRows = [] } = useQuery<RawCharacterCustomFieldRow>(
    enabled
      ? `SELECT ccf.character_id, ccf.field_name, ccf.field_value, ccf.sort_order,
                c.work_id, w.encrypted_dek
           FROM character_custom_field ccf
           JOIN character c ON c.id = ccf.character_id
           JOIN work w ON w.id = c.work_id
           WHERE c.work_id = ?
           ORDER BY ccf.sort_order`
      : `SELECT '' as character_id, null as field_name, null as field_value,
                0 as sort_order, '' as work_id, null as encrypted_dek WHERE 0`,
    enabled ? [workId!] : [],
  );

  // world_note — encrypted_dek는 같은 row의 work_id로 JOIN.
  const { data: worldNoteRows = [] } = useQuery<RawWorldNoteRow>(
    enabled
      ? `SELECT wn.id, wn.work_id, wn.writer_id, wn.parent_id, wn.name, wn.content,
                wn.sort_order, wn.created_at, wn.updated_at,
                w.encrypted_dek
           FROM world_note wn
           JOIN work w ON w.id = wn.work_id
           WHERE wn.work_id = ?
           ORDER BY wn.sort_order`
      : `SELECT '' as id, '' as work_id, '' as writer_id, null as parent_id,
                null as name, null as content, 0 as sort_order,
                '' as created_at, '' as updated_at, null as encrypted_dek WHERE 0`,
    enabled ? [workId!] : [],
  );
  const { data: worldNotes } = useDecryptedWorldNoteList(worldNoteRows);

  // foreshadows
  const { data: foreshadowRows = [] } = useQuery<RawForeshadowRow>(
    enabled
      ? `SELECT f.id, f.work_id, f.writer_id, f.title, f.status, f.importance, f.content,
                f.sort_order, f.created_at, f.updated_at,
                w.encrypted_dek
           FROM foreshadow f
           JOIN work w ON w.id = f.work_id
           WHERE f.work_id = ?
           ORDER BY f.sort_order`
      : `SELECT '' as id, '' as work_id, '' as writer_id, null as title,
                null as status, null as importance, null as content,
                0 as sort_order, '' as created_at, '' as updated_at,
                null as encrypted_dek WHERE 0`,
    enabled ? [workId!] : [],
  );
  const { data: foreshadows } = useDecryptedForeshadowList(foreshadowRows);

  // plots
  const { data: plotRows = [] } = useQuery<RawPlotRow>(
    enabled
      ? `SELECT p.id, p.work_id, p.writer_id, p.parent_id, p.title, p.status, p.content,
                p.sort_order, p.created_at, p.updated_at,
                w.encrypted_dek
           FROM plot p
           JOIN work w ON w.id = p.work_id
           WHERE p.work_id = ?
           ORDER BY p.sort_order`
      : `SELECT '' as id, '' as work_id, '' as writer_id, null as parent_id,
                null as title, null as status, null as content, 0 as sort_order,
                '' as created_at, '' as updated_at, null as encrypted_dek WHERE 0`,
    enabled ? [workId!] : [],
  );
  const { data: plots } = useDecryptedPlotList(plotRows);

  // recent episodes — 이번 회차 미만의 sort_order 중 최신 N개.
  // PR5에서 episode.title은 평문이지만 후속 PR에서 암호화될 수 있어 동일 path로 풀 수 있게 work_key 사용.
  const { data: recentEpisodeRows = [] } = useQuery<RawEpisodeRow>(
    enabled
      ? `SELECT e.id, e.work_id, e.sort_order, e.title, e.content,
                w.encrypted_dek
           FROM episode e
           JOIN work w ON w.id = e.work_id
           WHERE e.work_id = ? AND e.sort_order < ?
           ORDER BY e.sort_order DESC
           LIMIT ?`
      : `SELECT '' as id, '' as work_id, 0 as sort_order, null as title,
                null as content, null as encrypted_dek WHERE 0`,
    enabled ? [workId!, currentEpisodeNum, RECENT_EPISODES_LIMIT] : [],
  );

  // custom_field 평문화 — useEffect로 work_key 로드 후 일괄 복호화.
  const customFieldsSig = customFieldRows
    .map((r) => `${r.character_id}:${r.field_name ?? ''}:${r.field_value ?? ''}`)
    .join('|');
  const [decryptedCustomFields, setDecryptedCustomFields] = useState<
    { characterId: string; fieldName: string | null; fieldValue: string | null }[] | null
  >(null);
  useEffect(() => {
    if (!enabled) {
      setDecryptedCustomFields([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const kek = getCurrentKek();
      const result = await Promise.all(
        customFieldRows.map(async (r) => {
          const anyCipher = isCipher(r.field_name) || isCipher(r.field_value);
          if (!anyCipher) {
            return {
              characterId: r.character_id,
              fieldName: r.field_name,
              fieldValue: r.field_value,
            };
          }
          if (!kek || r.encrypted_dek == null) {
            return { characterId: r.character_id, fieldName: null, fieldValue: null };
          }
          try {
            const workKey = await ensureWorkKey({
              kek,
              workId: r.work_id,
              loadEncryptedDek: async () => r.encrypted_dek,
              saveEncryptedDek: async () => {
                throw new Error('decrypt path must not create new work_key');
              },
            });
            const [name, value] = await Promise.all([
              isCipher(r.field_name)
                ? decryptString(workKey, r.field_name.slice(PREFIX.length))
                : Promise.resolve(r.field_name),
              isCipher(r.field_value)
                ? decryptString(workKey, r.field_value.slice(PREFIX.length))
                : Promise.resolve(r.field_value),
            ]);
            return { characterId: r.character_id, fieldName: name, fieldValue: value };
          } catch {
            return { characterId: r.character_id, fieldName: null, fieldValue: null };
          }
        }),
      );
      if (!cancelled) setDecryptedCustomFields(result);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customFieldsSig, enabled]);

  // recent_episodes 평문화 — title은 평문(후속 PR 전), content는 v1: 암호문.
  const recentEpisodesSig = recentEpisodeRows
    .map((r) => `${r.id}:${r.encrypted_dek ?? ''}:${r.content ?? ''}`)
    .join('|');
  const [decryptedRecentEpisodes, setDecryptedRecentEpisodes] = useState<
    AiRecentEpisodePayload[] | null
  >(null);
  useEffect(() => {
    if (!enabled) {
      setDecryptedRecentEpisodes([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const kek = getCurrentKek();
      // RAG _fetch_recent_raw 동작과 일치: 과거→최근 순.
      const ordered = [...recentEpisodeRows].reverse();
      const result = await Promise.all(
        ordered.map(async (r): Promise<AiRecentEpisodePayload> => {
          const titlePlain = isCipher(r.title) ? null : r.title;
          if (!isCipher(r.content)) {
            return { sort_order: r.sort_order, title: titlePlain, content: r.content };
          }
          if (!kek || r.encrypted_dek == null) {
            return { sort_order: r.sort_order, title: titlePlain, content: null };
          }
          try {
            const workKey = await ensureWorkKey({
              kek,
              workId: r.work_id,
              loadEncryptedDek: async () => r.encrypted_dek,
              saveEncryptedDek: async () => {
                throw new Error('decrypt path must not create new work_key');
              },
            });
            const plain = await decryptString(workKey, r.content.slice(PREFIX.length));
            // title도 후속 PR 이후 v1: 가능 — 같은 work_key로 시도.
            const titleResolved = isCipher(r.title)
              ? await decryptString(workKey, r.title.slice(PREFIX.length))
              : titlePlain;
            return { sort_order: r.sort_order, title: titleResolved, content: plain };
          } catch {
            return { sort_order: r.sort_order, title: titlePlain, content: null };
          }
        }),
      );
      if (!cancelled) setDecryptedRecentEpisodes(result);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentEpisodesSig, enabled]);

  const isLoading =
    enabled &&
    (workLoading ||
      decryptedCustomFields == null ||
      decryptedRecentEpisodes == null);

  const payload: AiContextPayload | null = useMemo(() => {
    if (!enabled || isLoading) return null;
    if (!work) return null;

    const workMeta: AiWorkMetaPayload = {
      title: work.title || null,
      author_name: work.author_name,
      description: work.description,
      status: work.status,
    };

    const customByChar = new Map<string, AiCharacterCustomFieldPayload[]>();
    for (const cf of decryptedCustomFields ?? []) {
      const arr = customByChar.get(cf.characterId) ?? [];
      arr.push({ field_name: cf.fieldName, field_value: cf.fieldValue });
      customByChar.set(cf.characterId, arr);
    }

    const notesByChar = new Map<string, AiCharacterNotePayload[]>();
    for (const note of characterNotes) {
      const arr = notesByChar.get(note.character_id) ?? [];
      arr.push({
        kind: note.kind ?? null,
        title: note.title || null,
        content: note.content,
      });
      notesByChar.set(note.character_id, arr);
    }

    const charactersPayload: AiCharacterPayload[] = characters.map((c) => ({
      id: c.id,
      name: c.name || null,
      gender: c.gender,
      age: c.age,
      notes: notesByChar.get(c.id) ?? [],
      custom_fields: customByChar.get(c.id) ?? [],
    }));

    const worldNotesPayload: AiWorldNotePayload[] = worldNotes.map((w) => ({
      name: w.name || null,
      content: w.content,
    }));

    const foreshadowsPayload: AiForeshadowPayload[] = foreshadows.map((f) => ({
      title: f.title || null,
      status: f.status,
      importance: f.importance,
      content: f.content,
    }));

    const plotsPayload: AiPlotPayload[] = plots.map((p) => ({
      title: p.title || null,
      content: p.content,
    }));

    return {
      work_meta: workMeta,
      characters: charactersPayload,
      world_notes: worldNotesPayload,
      foreshadows: foreshadowsPayload,
      plots: plotsPayload,
      recent_episodes: decryptedRecentEpisodes ?? [],
    };
  }, [
    enabled,
    isLoading,
    work,
    characters,
    characterNotes,
    decryptedCustomFields,
    worldNotes,
    foreshadows,
    plots,
    decryptedRecentEpisodes,
  ]);

  // payload 안에 v1: 잔재가 단 하나라도 있으면 호출 자체를 막는다.
  // useDecryptedXxx 훅들은 복호화 실패 시 raw v1: 또는 null을 반환하므로
  // payload 빌더 직후에 한 번만 훑어서 사고 게이트를 박는다.
  const hasUndecrypted = useMemo(() => {
    if (!payload) return false;
    return payloadContainsCipher(payload);
  }, [payload]);

  return { payload, isLoading, hasUndecrypted };
}

function payloadContainsCipher(p: AiContextPayload): boolean {
  const m = p.work_meta;
  if (
    isCipher(m.title) || isCipher(m.author_name) || isCipher(m.description) || isCipher(m.status)
  ) return true;

  for (const c of p.characters) {
    if (isCipher(c.name) || isCipher(c.gender) || isCipher(c.age)) return true;
    for (const n of c.notes) {
      if (isCipher(n.kind) || isCipher(n.title) || isCipher(n.content)) return true;
    }
    for (const cf of c.custom_fields) {
      if (isCipher(cf.field_name) || isCipher(cf.field_value)) return true;
    }
  }
  for (const w of p.world_notes) {
    if (isCipher(w.name) || isCipher(w.content)) return true;
  }
  for (const f of p.foreshadows) {
    if (isCipher(f.title) || isCipher(f.status) || isCipher(f.importance) || isCipher(f.content)) {
      return true;
    }
  }
  for (const pl of p.plots) {
    if (isCipher(pl.title) || isCipher(pl.content)) return true;
  }
  for (const re of p.recent_episodes) {
    if (isCipher(re.title) || isCipher(re.content)) return true;
  }
  return false;
}
