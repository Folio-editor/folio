import { useEffect, useState } from 'react';
import { decryptString } from '../crypto/cipher';
import { getCurrentKek } from '../crypto/lifecycle';
import { ensureWorkKey } from '../crypto/workKey';
import type { DecryptStatus } from './useDecryptedEpisode';

const PREFIX = 'v1:';

export interface DecryptedForeshadowLinkRow {
  id: string;
  foreshadow_id: string;
  link_type: string;
  episode_id: string | null;
  plot_id: string | null;
  context_memo: string | null;
  created_at: string;
  decryptStatus: DecryptStatus;
}

/**
 * 호출자는 foreshadow JOIN으로 work_id, encrypted_dek를 결합해 넘긴다.
 * (foreshadow_link 자체에는 work_id가 없음)
 */
interface RawForeshadowLinkRow {
  id: string;
  foreshadow_id: string;
  link_type: string;
  episode_id: string | null;
  plot_id: string | null;
  context_memo: string | null;
  created_at: string;
  /** JOIN: foreshadow.work_id */
  work_id: string;
  /** JOIN: work.encrypted_dek */
  encrypted_dek: string | null;
  /** signature 안정성을 위해 호출자가 함께 넘긴다 (link 자체는 updated_at이 없으므로 created_at 사용) */
  updated_at?: string;
}

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

async function decryptRow(
  raw: RawForeshadowLinkRow,
  kek: CryptoKey | null,
): Promise<DecryptedForeshadowLinkRow> {
  const base = {
    id: raw.id,
    foreshadow_id: raw.foreshadow_id,
    link_type: raw.link_type,
    episode_id: raw.episode_id,
    plot_id: raw.plot_id,
    created_at: raw.created_at,
  };

  if (!isCipher(raw.context_memo)) {
    return {
      ...base,
      context_memo: raw.context_memo,
      decryptStatus: 'plain',
    };
  }

  if (!kek) {
    return {
      ...base,
      context_memo: raw.context_memo,
      decryptStatus: 'no-kek',
    };
  }

  if (raw.encrypted_dek == null) {
    return {
      ...base,
      context_memo: raw.context_memo,
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
    const memo = await decryptField(raw.context_memo, workKey);
    return {
      ...base,
      context_memo: memo,
      decryptStatus: 'decrypted',
    };
  } catch {
    return {
      ...base,
      context_memo: raw.context_memo,
      decryptStatus: 'failed',
    };
  }
}

export function useDecryptedForeshadowLinkList(rawRows: RawForeshadowLinkRow[]): {
  data: DecryptedForeshadowLinkRow[];
  isLoading: boolean;
} {
  const [decrypted, setDecrypted] = useState<DecryptedForeshadowLinkRow[] | null>(null);
  const signature = rawRows
    .map((r) => `${r.id}:${r.updated_at ?? r.created_at}:${r.encrypted_dek ?? ''}`)
    .join('|');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const kek = getCurrentKek();
      const result = await Promise.all(rawRows.map((r) => decryptRow(r, kek)));
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

export type { RawForeshadowLinkRow };
