import { useEffect, useState } from 'react';
import { decryptString } from '../crypto/cipher';
import { getCurrentKek } from '../crypto/lifecycle';
import { ensureWorkKey } from '../crypto/workKey';
import { useAuthStore } from '../stores/authStore';
import type { DecryptStatus } from './useDecryptedEpisode';

const PREFIX = 'v1:';

export interface DecryptedIdeaArchiveRow {
  id: string;
  work_id: string;
  writer_id: string;
  content: string;
  tag: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
  decryptStatus: DecryptStatus;
}

interface RawIdeaArchiveRow {
  id: string;
  work_id: string;
  writer_id: string;
  content: string | null;
  tag: string | null;
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
  raw: RawIdeaArchiveRow,
  kek: CryptoKey | null,
): Promise<DecryptedIdeaArchiveRow> {
  const base = {
    id: raw.id,
    work_id: raw.work_id,
    writer_id: raw.writer_id,
    sort_order: raw.sort_order,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };

  const anyCipher = isCipher(raw.content);
  if (!anyCipher) {
    return {
      ...base,
      content: raw.content ?? '',
      tag: raw.tag,
      decryptStatus: 'plain',
    };
  }

  if (!kek) {
    return {
      ...base,
      content: raw.content ?? '',
      tag: raw.tag,
      decryptStatus: 'no-kek',
    };
  }

  if (raw.encrypted_dek == null) {
    return {
      ...base,
      content: raw.content ?? '',
      tag: raw.tag,
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
    const [content] = await Promise.all([
      decryptField(raw.content, workKey),
    ]);
    return {
      ...base,
      content: content ?? '',
      tag: raw.tag,
      decryptStatus: 'decrypted',
    };
  } catch {
    return {
      ...base,
      content: raw.content ?? '',
      tag: raw.tag,
      decryptStatus: 'failed',
    };
  }
}

export function useDecryptedIdeaArchiveList(rawRows: RawIdeaArchiveRow[]): {
  data: DecryptedIdeaArchiveRow[];
  isLoading: boolean;
} {
  const kekVersion = useAuthStore((s) => s.kekVersion);
  const [decrypted, setDecrypted] = useState<DecryptedIdeaArchiveRow[] | null>(null);
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
    // kekVersion: KEK 도출/회전 직후 재복호화 (no-kek 굳음 방지).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, kekVersion]);

  if (decrypted == null) return { data: [], isLoading: true };
  return { data: decrypted, isLoading: false };
}

export type { RawIdeaArchiveRow };
