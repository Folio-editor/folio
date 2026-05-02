import { useEffect, useState } from 'react';
import { useQuery } from '@powersync/react';
import { decryptString } from '../crypto/cipher';
import { getCurrentKek } from '../crypto/lifecycle';
import { ensureWorkKey } from '../crypto/workKey';

/**
 * Plan C — episode 본문/제목을 KEK + work_key로 복호화하여 반환하는 훅.
 *
 * <p>경로:
 * <ul>
 *   <li>v1: 접두사가 있으면 work_key로 AES-GCM 복호화 → decryptStatus='decrypted'</li>
 *   <li>v1: 접두사가 없으면 평문(레거시 / 게스트가 만든 데이터) → decryptStatus='plain'</li>
 *   <li>KEK 없음 → decryptStatus='no-kek' (에디터는 readonly + 경고 배너)</li>
 *   <li>work_key 풀기 실패 → decryptStatus='no-work-key'</li>
 *   <li>복호화 자체 실패 (tag mismatch 등) → decryptStatus='failed'</li>
 * </ul>
 */
export type DecryptStatus =
  | 'loading'
  | 'plain'
  | 'decrypted'
  | 'no-kek'
  | 'no-work-key'
  | 'failed';

export interface DecryptedEpisodeRow {
  id: string;
  work_id: string;
  title: string;
  status: string;
  word_count: number;
  /** 복호화된 본문(또는 평문). loading/오류 단계에서는 null. */
  content: string | null;
  decryptStatus: DecryptStatus;
}

interface RawEpisodeRow {
  id: string;
  title: string | null;
  status: string;
  word_count: number;
  content: string | null;
  work_id: string;
}

interface WorkDekRow {
  encrypted_dek: string | null;
}

const PREFIX = 'v1:';

function isCipher(v: string | null): v is string {
  return typeof v === 'string' && v.startsWith(PREFIX);
}

async function decryptField(
  value: string | null,
  workKey: CryptoKey,
): Promise<string | null> {
  if (value == null) return null;
  if (!isCipher(value)) return value;
  return decryptString(workKey, value.slice(PREFIX.length));
}

export function useDecryptedEpisode(episodeId: string): {
  data: DecryptedEpisodeRow | null;
  isLoading: boolean;
} {
  const { data: rows = [] } = useQuery<RawEpisodeRow>(
    `SELECT id, title, status, word_count, content, work_id
     FROM episode WHERE id = ?`,
    [episodeId],
  );
  const raw = rows[0] ?? null;

  // work.encrypted_dek는 useQuery로 별도 구독 — work_id 바뀌면 다시 fetch
  const { data: workRows = [] } = useQuery<WorkDekRow>(
    `SELECT encrypted_dek FROM work WHERE id = ?`,
    [raw?.work_id ?? ''],
  );
  const encryptedDek = workRows[0]?.encrypted_dek ?? null;

  const [row, setRow] = useState<DecryptedEpisodeRow | null>(null);

  useEffect(() => {
    if (!raw) {
      setRow(null);
      return;
    }

    const base = {
      id: raw.id,
      work_id: raw.work_id,
      status: raw.status,
      word_count: raw.word_count,
    };

    const anyCipher = isCipher(raw.title) || isCipher(raw.content);
    if (!anyCipher) {
      setRow({
        ...base,
        title: raw.title ?? '',
        content: raw.content,
        decryptStatus: 'plain',
      });
      return;
    }

    const kek = getCurrentKek();
    if (!kek) {
      setRow({
        ...base,
        title: raw.title ?? '',
        content: null,
        decryptStatus: 'no-kek',
      });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const workKey = await ensureWorkKey({
          kek,
          workId: raw.work_id,
          loadEncryptedDek: async () => encryptedDek,
          // 읽기 경로는 절대 새 DEK을 만들지 않는다 — 저장된 DEK 없이 ciphertext가 존재하면 모순.
          saveEncryptedDek: async () => {
            throw new Error('decrypt path must not create new work_key');
          },
        });
        const [title, content] = await Promise.all([
          decryptField(raw.title, workKey),
          decryptField(raw.content, workKey),
        ]);
        if (cancelled) return;
        setRow({
          ...base,
          title: title ?? '',
          content,
          decryptStatus: 'decrypted',
        });
      } catch {
        if (cancelled) return;
        const status: DecryptStatus = encryptedDek == null ? 'no-work-key' : 'failed';
        setRow({
          ...base,
          title: raw.title ?? '',
          content: null,
          decryptStatus: status,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [raw, encryptedDek]);

  if (!raw) return { data: null, isLoading: true };
  if (!row) return { data: null, isLoading: true };
  return { data: row, isLoading: false };
}

// ── 배치 복호화 (목록 화면용) ───────────────────────────────────

export interface DecryptedEpisodeListRow {
  id: string;
  work_id: string;
  title: string;
  status: string;
  word_count: number;
  content: string | null;
  sort_order: number | null;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  decryptStatus: DecryptStatus;
}

export interface RawEpisodeListRow {
  id: string;
  work_id: string;
  title: string | null;
  status: string;
  word_count: number;
  /** content를 SELECT하지 않는 호출자도 있다 — 이 경우 undefined로 들어와 null 처리된다. */
  content?: string | null;
  sort_order: number | null;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  encrypted_dek: string | null;
}

async function decryptListRow(
  raw: RawEpisodeListRow,
  kek: CryptoKey | null,
): Promise<DecryptedEpisodeListRow> {
  const base = {
    id: raw.id,
    work_id: raw.work_id,
    status: raw.status,
    word_count: raw.word_count,
    sort_order: raw.sort_order,
    parent_id: raw.parent_id,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };

  const rawContent = raw.content ?? null;
  const anyCipher = isCipher(raw.title) || isCipher(rawContent);
  if (!anyCipher) {
    return {
      ...base,
      title: raw.title ?? '',
      content: rawContent,
      decryptStatus: 'plain',
    };
  }

  if (!kek) {
    return {
      ...base,
      title: raw.title ?? '',
      content: isCipher(rawContent) ? null : rawContent,
      decryptStatus: 'no-kek',
    };
  }

  if (raw.encrypted_dek == null) {
    return {
      ...base,
      title: raw.title ?? '',
      content: isCipher(rawContent) ? null : rawContent,
      decryptStatus: 'no-work-key',
    };
  }

  try {
    const workKey = await ensureWorkKey({
      kek,
      workId: raw.work_id,
      loadEncryptedDek: async () => raw.encrypted_dek,
      saveEncryptedDek: async () => {
        throw new Error('decrypt path must not create new work_key');
      },
    });
    const [title, content] = await Promise.all([
      decryptField(raw.title, workKey),
      decryptField(rawContent, workKey),
    ]);
    return {
      ...base,
      title: title ?? '',
      content,
      decryptStatus: 'decrypted',
    };
  } catch {
    return {
      ...base,
      title: raw.title ?? '',
      content: isCipher(rawContent) ? null : rawContent,
      decryptStatus: 'failed',
    };
  }
}

/**
 * 목록 화면에서 episode.title/content 를 일괄 복호화한다.
 * 호출자는 episode + work.encrypted_dek 를 LEFT JOIN한 결과를 RawEpisodeListRow[]로 넘긴다.
 * content 컬럼은 옵셔널 — SELECT에서 빠진 경우 raw.content는 undefined → null 처리된다.
 */
export function useDecryptedEpisodeList(rawRows: RawEpisodeListRow[]): {
  data: DecryptedEpisodeListRow[];
  isLoading: boolean;
} {
  const [decrypted, setDecrypted] = useState<DecryptedEpisodeListRow[] | null>(null);
  const signature = rawRows
    .map((r) => `${r.id}:${r.updated_at}:${r.encrypted_dek ?? ''}`)
    .join('|');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const kek = getCurrentKek();
      const result = await Promise.all(rawRows.map((r) => decryptListRow(r, kek)));
      if (!cancelled) setDecrypted(result);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  if (decrypted == null) return { data: [], isLoading: true };
  return { data: decrypted, isLoading: false };
}
