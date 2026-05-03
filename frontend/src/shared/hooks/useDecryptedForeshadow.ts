import { useEffect, useState } from 'react';
import { decryptString } from '../crypto/cipher';
import { getCurrentKek } from '../crypto/lifecycle';
import { ensureWorkKey } from '../crypto/workKey';
import type { DecryptStatus } from './useDecryptedEpisode';

const PREFIX = 'v1:';

export interface DecryptedForeshadowRow {
  id: string;
  work_id: string;
  writer_id: string;
  title: string;
  status: string | null;
  importance: string | null;
  content: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
  decryptStatus: DecryptStatus;
}

interface RawForeshadowRow {
  id: string;
  work_id: string;
  writer_id: string;
  title: string | null;
  status: string | null;
  importance: string | null;
  content: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
  encrypted_dek: string | null;
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
  raw: RawForeshadowRow,
  kek: CryptoKey | null,
): Promise<DecryptedForeshadowRow> {
  const base = {
    id: raw.id,
    work_id: raw.work_id,
    writer_id: raw.writer_id,
    sort_order: raw.sort_order,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };

  const anyCipher = isCipher(raw.title) || isCipher(raw.content);
  if (!anyCipher) {
    return {
      ...base,
      title: raw.title ?? '',
      status: raw.status,
      importance: raw.importance,
      content: raw.content,
      decryptStatus: 'plain',
    };
  }

  if (!kek) {
    return {
      ...base,
      title: raw.title ?? '',
      status: raw.status,
      importance: raw.importance,
      content: raw.content,
      decryptStatus: 'no-kek',
    };
  }

  if (raw.encrypted_dek == null) {
    return {
      ...base,
      title: raw.title ?? '',
      status: raw.status,
      importance: raw.importance,
      content: raw.content,
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
      decryptField(raw.content, workKey),
    ]);
    return {
      ...base,
      title: title ?? '',
      status: raw.status,
      importance: raw.importance,
      content,
      decryptStatus: 'decrypted',
    };
  } catch {
    return {
      ...base,
      title: raw.title ?? '',
      status: raw.status,
      importance: raw.importance,
      content: raw.content,
      decryptStatus: 'failed',
    };
  }
}

export function useDecryptedForeshadowList(rawRows: RawForeshadowRow[]): {
  data: DecryptedForeshadowRow[];
  isLoading: boolean;
} {
  const [decrypted, setDecrypted] = useState<DecryptedForeshadowRow[] | null>(null);
  const signature = rawRows
    .map((r) => `${r.id}:${r.updated_at}:${r.encrypted_dek ?? ''}`)
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

export type { RawForeshadowRow };
