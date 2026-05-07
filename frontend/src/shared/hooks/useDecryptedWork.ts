import { useEffect, useState } from 'react';
import { useQuery } from '@powersync/react';
import { decryptString } from '../crypto/cipher';
import { getCurrentKek } from '../crypto/lifecycle';
import { ensureWorkKey } from '../crypto/workKey';
import type { DecryptStatus } from './useDecryptedEpisode';

const PREFIX = 'v1:';

export interface DecryptedWorkRow {
  id: string;
  writer_id: string;
  title: string;
  author_name: string | null;
  description: string | null;
  status: string;
  sort_order: number | null;
  // 장르·분위기 — 평문 JSON 문자열 (SQLite TEXT). 호출 측에서 JSON.parse.
  genres: string | null;
  moods: string | null;
  created_at: string;
  updated_at: string;
  decryptStatus: DecryptStatus;
}

interface RawWorkRow {
  id: string;
  writer_id: string;
  title: string | null;
  author_name: string | null;
  description: string | null;
  status: string;
  sort_order: number | null;
  genres: string | null;
  moods: string | null;
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
  raw: RawWorkRow,
  kek: CryptoKey | null,
): Promise<DecryptedWorkRow> {
  const base = {
    id: raw.id,
    writer_id: raw.writer_id,
    status: raw.status,
    sort_order: raw.sort_order,
    genres: raw.genres,
    moods: raw.moods,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };

  const anyCipher =
    isCipher(raw.title) || isCipher(raw.author_name) || isCipher(raw.description);
  if (!anyCipher) {
    return {
      ...base,
      title: raw.title ?? '',
      author_name: raw.author_name,
      description: raw.description,
      decryptStatus: 'plain',
    };
  }

  if (!kek) {
    return {
      ...base,
      title: raw.title ?? '',
      author_name: raw.author_name,
      description: raw.description,
      decryptStatus: 'no-kek',
    };
  }

  if (raw.encrypted_dek == null) {
    return {
      ...base,
      title: raw.title ?? '',
      author_name: raw.author_name,
      description: raw.description,
      decryptStatus: 'no-work-key',
    };
  }

  try {
    const workKey = await ensureWorkKey({
      kek,
      workId: raw.id,
      loadEncryptedDek: async () => raw.encrypted_dek,
      saveEncryptedDek: async () => {
        throw new Error('decrypt path must not create new work_key');
      },
    });
    const [title, authorName, description] = await Promise.all([
      decryptField(raw.title, workKey),
      decryptField(raw.author_name, workKey),
      decryptField(raw.description, workKey),
    ]);
    // lazy reconcile 제거 — PowerSync sync down 이 server ciphertext 로 매번 덮어쓰므로
    // SQLite 평문 UPDATE 가 즉시 다음 sync down 에 무력화 + ps_crud trigger 가 발화하면
    // 무한 round-trip 위험. 표시 시점 메모리 복호화로 사용자 경험 평문 유지.
    return {
      ...base,
      title: title ?? '',
      author_name: authorName,
      description: description,
      decryptStatus: 'decrypted',
    };
  } catch {
    return {
      ...base,
      title: raw.title ?? '',
      author_name: raw.author_name,
      description: raw.description,
      decryptStatus: 'failed',
    };
  }
}

/**
 * Plan C — 단일 work의 메타(title/author_name/description)를 KEK + work_key로 복호화.
 *
 * <p>경로:
 * <ul>
 *   <li>v1: 접두사가 한 컬럼이라도 있으면 work_key로 복호화 → 'decrypted'</li>
 *   <li>전부 평문이면 'plain' (게스트/레거시 데이터)</li>
 *   <li>KEK 없음 → 'no-kek' (원본 ciphertext 그대로 노출)</li>
 *   <li>encrypted_dek 없음 → 'no-work-key'</li>
 *   <li>복호화 실패 → 'failed'</li>
 * </ul>
 */
export function useDecryptedWork(workId: string): {
  data: DecryptedWorkRow | null;
  isLoading: boolean;
} {
  const { data: rows = [] } = useQuery<RawWorkRow>(
    `SELECT id, writer_id, title, author_name, description, status,
            sort_order, genres, moods, created_at, updated_at, encrypted_dek
       FROM work WHERE id = ?`,
    [workId],
  );
  const raw = rows[0] ?? null;
  const [decrypted, setDecrypted] = useState<DecryptedWorkRow | null>(null);

  useEffect(() => {
    if (!raw) {
      setDecrypted(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const kek = getCurrentKek();
      const result = await decryptRow(raw, kek);
      if (!cancelled) setDecrypted(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [raw]);

  if (!raw) return { data: null, isLoading: true };
  if (!decrypted) return { data: null, isLoading: true };
  return { data: decrypted, isLoading: false };
}

/**
 * Plan C — writer 소유 work 목록을 batch로 복호화.
 *
 * <p>제목·작가명·설명이 ciphertext인 작품들을 메모리에서 평문으로 풀어 반환한다.
 * 클라이언트 측 정렬·검색이 평문 기준으로 동작하도록 하기 위함.
 *
 * <p>입력 rows의 id/updated_at 셋이 동일하면 재복호화하지 않는다 (단순 메모이제이션).
 * 작품 100개 규모를 가정 — 첫 마운트 100ms 미만, 이후 추가/수정 시에만 재계산.
 */
export function useDecryptedWorkList(rawRows: RawWorkRow[]): {
  data: DecryptedWorkRow[];
  isLoading: boolean;
} {
  const [decrypted, setDecrypted] = useState<DecryptedWorkRow[] | null>(null);
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
    // signature가 같으면 rawRows 배열 인스턴스가 달라도 재실행 안 됨.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  if (decrypted == null) return { data: [], isLoading: true };
  return { data: decrypted, isLoading: false };
}

export type { RawWorkRow };
