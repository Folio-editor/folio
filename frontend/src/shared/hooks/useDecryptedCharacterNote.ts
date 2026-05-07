import { useEffect, useState } from 'react';
import { decryptString } from '../crypto/cipher';
import { getCurrentKek } from '../crypto/lifecycle';
import { ensureWorkKey } from '../crypto/workKey';
import { useAuthStore } from '../stores/authStore';
import type { DecryptStatus } from './useDecryptedEpisode';

const PREFIX = 'v1:';

export interface DecryptedCharacterNoteRow {
  id: string;
  character_id: string;
  writer_id: string;
  kind: string;
  title: string;
  content: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
  decryptStatus: DecryptStatus;
}

/**
 * 호출자는 character → work JOIN으로 work_id, encrypted_dek를 결합해 넘긴다.
 * (character_note 자체에는 work_id가 없어 일반화된 hook이 어렵다)
 */
interface RawCharacterNoteRow {
  id: string;
  character_id: string;
  writer_id: string;
  kind: string;
  title: string | null;
  content: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
  /** JOIN으로 character.work_id를 결합 */
  work_id: string;
  /** JOIN으로 work.encrypted_dek를 결합 */
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
  raw: RawCharacterNoteRow,
  kek: CryptoKey | null,
): Promise<DecryptedCharacterNoteRow> {
  const base = {
    id: raw.id,
    character_id: raw.character_id,
    writer_id: raw.writer_id,
    kind: raw.kind,
    sort_order: raw.sort_order,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };

  const anyCipher = isCipher(raw.title) || isCipher(raw.content);
  if (!anyCipher) {
    return {
      ...base,
      title: raw.title ?? '',
      content: raw.content,
      decryptStatus: 'plain',
    };
  }

  if (!kek) {
    return {
      ...base,
      title: raw.title ?? '',
      content: raw.content,
      decryptStatus: 'no-kek',
    };
  }

  if (raw.encrypted_dek == null) {
    return {
      ...base,
      title: raw.title ?? '',
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
      content,
      decryptStatus: 'decrypted',
    };
  } catch {
    return {
      ...base,
      title: raw.title ?? '',
      content: raw.content,
      decryptStatus: 'failed',
    };
  }
}

export function useDecryptedCharacterNoteList(rawRows: RawCharacterNoteRow[]): {
  data: DecryptedCharacterNoteRow[];
  isLoading: boolean;
} {
  const kekVersion = useAuthStore((s) => s.kekVersion);
  const [decrypted, setDecrypted] = useState<DecryptedCharacterNoteRow[] | null>(null);
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

export type { RawCharacterNoteRow };
