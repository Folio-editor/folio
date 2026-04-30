import { useEffect, useState } from 'react';
import { useQuery } from '@powersync/react';
import { decryptString } from '../crypto/cipher';
import { getCurrentKek } from '../crypto/lifecycle';
import { ensureWorkKey } from '../crypto/workKey';

/**
 * Plan C — episode 본문을 KEK + work_key로 복호화하여 반환하는 훅.
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
  title: string;
  status: string;
  word_count: number;
  /** 복호화된 본문(또는 평문). loading/오류 단계에서는 null. */
  content: string | null;
  decryptStatus: DecryptStatus;
}

interface RawEpisodeRow {
  id: string;
  title: string;
  status: string;
  word_count: number;
  content: string | null;
  work_id: string;
}

interface WorkDekRow {
  encrypted_dek: string | null;
}

const PREFIX = 'v1:';

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
      title: raw.title,
      status: raw.status,
      word_count: raw.word_count,
    };

    const isCipher = typeof raw.content === 'string' && raw.content.startsWith(PREFIX);
    if (!isCipher) {
      setRow({ ...base, content: raw.content, decryptStatus: 'plain' });
      return;
    }

    const kek = getCurrentKek();
    if (!kek) {
      setRow({ ...base, content: null, decryptStatus: 'no-kek' });
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
        const cipher = (raw.content as string).slice(PREFIX.length);
        const plain = await decryptString(workKey, cipher);
        if (cancelled) return;
        setRow({ ...base, content: plain, decryptStatus: 'decrypted' });
      } catch {
        if (cancelled) return;
        const status: DecryptStatus = encryptedDek == null ? 'no-work-key' : 'failed';
        setRow({ ...base, content: null, decryptStatus: status });
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
