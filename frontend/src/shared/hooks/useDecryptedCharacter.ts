import { useEffect, useState } from 'react';
import { decryptString } from '../crypto/cipher';
import { getCurrentKek } from '../crypto/lifecycle';
import { ensureWorkKey } from '../crypto/workKey';
import type { DecryptStatus } from './useDecryptedEpisode';

const PREFIX = 'v1:';

export interface DecryptedCharacterRow {
  id: string;
  work_id: string;
  writer_id: string;
  name: string;
  gender: string | null;
  age: string | null;
  profile_image_url: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
  decryptStatus: DecryptStatus;
}

interface RawCharacterRow {
  id: string;
  work_id: string;
  writer_id: string;
  name: string | null;
  gender: string | null;
  age: string | null;
  profile_image_url: string | null;
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
  raw: RawCharacterRow,
  kek: CryptoKey | null,
): Promise<DecryptedCharacterRow> {
  const base = {
    id: raw.id,
    work_id: raw.work_id,
    writer_id: raw.writer_id,
    gender: raw.gender,
    profile_image_url: raw.profile_image_url,
    sort_order: raw.sort_order,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };

  const anyCipher = isCipher(raw.name) || isCipher(raw.age);
  if (!anyCipher) {
    return {
      ...base,
      name: raw.name ?? '',
      age: raw.age,
      decryptStatus: 'plain',
    };
  }

  if (!kek) {
    return {
      ...base,
      name: raw.name ?? '',
      age: raw.age,
      decryptStatus: 'no-kek',
    };
  }

  if (raw.encrypted_dek == null) {
    return {
      ...base,
      name: raw.name ?? '',
      age: raw.age,
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
    const [name, age] = await Promise.all([
      decryptField(raw.name, workKey),
      decryptField(raw.age, workKey),
    ]);
    return {
      ...base,
      name: name ?? '',
      age,
      decryptStatus: 'decrypted',
    };
  } catch {
    return {
      ...base,
      name: raw.name ?? '',
      age: raw.age,
      decryptStatus: 'failed',
    };
  }
}

/**
 * Plan C PR3 — character 목록을 batch로 복호화.
 *
 * <p>입력은 character row 자체가 아니라 work의 encrypted_dek가 함께 결합된 형태가
 * 이상적이지만, 호출 측 SQL JOIN 부담을 덜기 위해 character.work_id로 work 행을
 * 별도 조회하는 책임은 호출자에 위임 — 입력 RawCharacterRow에 encrypted_dek 포함.
 */
export function useDecryptedCharacterList(rawRows: RawCharacterRow[]): {
  data: DecryptedCharacterRow[];
  isLoading: boolean;
} {
  const [decrypted, setDecrypted] = useState<DecryptedCharacterRow[] | null>(null);
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

export type { RawCharacterRow };
