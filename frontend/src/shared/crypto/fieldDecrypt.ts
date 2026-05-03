/**
 * Plan C — 단발성 필드 복호화 유틸.
 *
 * React 훅(useDecryptedXxx) 은 list/뷰어에 적합하지만, 콜백 안에서
 * 한 번 read → 제목 합성 같은 imperative 경로에는 부적절하다.
 * 이 유틸은 단일 row의 ciphertext field를 풀고 평문(또는 폴백)을 돌려준다.
 *
 * 정책: encryptWorkField 와 대칭.
 *   - value가 null/빈문자/non-cipher 면 그대로 반환 (평문 폴백)
 *   - KEK이 없거나 (게스트) encrypted_dek가 없으면 ciphertext 그대로 반환
 *   - 복호화 실패 시 ciphertext 그대로 반환 (UI는 깨지지 않음)
 */

import { decryptString } from './cipher';
import { getCurrentKek } from './lifecycle';
import { ensureWorkKey } from './workKey';

const PREFIX = 'v1:';

export function isCipher(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.startsWith(PREFIX);
}

export interface DecryptFieldArgs {
  workId: string;
  encryptedDek: string | null;
  value: string | null;
}

/**
 * 단일 ciphertext 필드를 복호화. 평문이거나 키 부재면 입력 값을 그대로 돌려준다.
 */
export async function decryptWorkFieldOnce({
  workId,
  encryptedDek,
  value,
}: DecryptFieldArgs): Promise<string | null> {
  if (value == null || value === '') return value;
  if (!isCipher(value)) return value;
  const kek = getCurrentKek();
  if (!kek || !encryptedDek) return value;
  try {
    const workKey = await ensureWorkKey({
      kek,
      workId,
      loadEncryptedDek: async () => encryptedDek,
      saveEncryptedDek: async () => {
        throw new Error('decrypt path must not create new work_key');
      },
    });
    return await decryptString(workKey, value.slice(PREFIX.length));
  } catch {
    return value;
  }
}
