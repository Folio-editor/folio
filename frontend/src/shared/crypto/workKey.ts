/**
 * Plan C 결정 21 — work별 DEK(work_key) 생성 / wrap / unwrap.
 *
 * <p>흐름:
 * <ol>
 *   <li>새 work에 첫 episode 본문 저장 시 lazy로 32B 랜덤 work_key 생성</li>
 *   <li>KEK으로 work_key를 AES-GCM wrap → base64(IV||CT||TAG) 60B → DB work.encrypted_dek</li>
 *   <li>이후 같은 work 편집 시 work.encrypted_dek를 KEK으로 unwrap → CryptoKey 메모리 캐시</li>
 * </ol>
 *
 * <p>raw work_key 바이트는 wrap 직후 zeroize. 캐시에는 non-extractable CryptoKey만 둔다.
 *
 * <p>동시성: 같은 workId에 대해 ensureWorkKey가 동시에 호출되더라도 DB에 두 번 INSERT하지 않도록
 * in-flight Promise를 Map으로 dedup한다.
 */

import {
  decryptBytes,
  encryptBytes,
  generateWorkKey,
  importAesGcmKey,
  zeroize,
} from './cipher';
import {
  getWorkKey as getCachedWorkKey,
  setWorkKey as setCachedWorkKey,
} from './keyCache';

export interface WrappedWorkKey {
  encryptedDekB64: string;
  workKey: CryptoKey;
}

/**
 * 새 work_key를 만들어 KEK으로 wrap. 호출자는 반환된 encryptedDekB64를
 * work.encrypted_dek 컬럼에 저장하고 workKey는 메모리 캐시에 둔다.
 *
 * <p>onRawAvailable 콜백: Vault Transit 전환 (curious-wiggling-thacker plan V-5) —
 * 신규 raw work_key 가 생성된 직후 1회 동기 호출. 호출자는 이 안에서 raw 를
 * 서버에 한 번 전송하여 server_encrypted_dek 발급받는다. 콜백 종료 후
 * finally 에서 raw 가 zeroize 되므로 콜백 안에서만 raw 를 사용해야 한다.
 */
export async function createAndWrapWorkKey(
  kek: CryptoKey,
  onRawAvailable?: (raw: Uint8Array) => Promise<void>,
): Promise<WrappedWorkKey> {
  const raw = generateWorkKey();
  try {
    const encryptedDekB64 = await encryptBytes(kek, raw);
    const workKey = await importAesGcmKey(raw, false);
    if (onRawAvailable) {
      await onRawAvailable(raw);
    }
    return { encryptedDekB64, workKey };
  } finally {
    zeroize(raw);
  }
}

/**
 * 저장된 wrapped DEK을 KEK으로 unwrap → CryptoKey 캐시에 등록 후 반환.
 */
export async function unwrapAndCacheWorkKey(
  kek: CryptoKey,
  workId: string,
  encryptedDekB64: string,
): Promise<CryptoKey> {
  const raw = await decryptBytes(kek, encryptedDekB64);
  try {
    const workKey = await importAesGcmKey(raw, false);
    setCachedWorkKey(workId, workKey);
    return workKey;
  } finally {
    zeroize(raw);
  }
}

const inflight = new Map<string, Promise<CryptoKey>>();

/**
 * 신규 raw work_key 생성 직후 1회 호출되는 전역 훅.
 * 앱 부팅 시 setOnWorkKeyCreatedHook(issueServerDek) 로 등록 →
 * Vault Transit server_encrypted_dek 발급 자동 수행.
 * crypto core 가 apiClient 에 직접 의존하지 않도록 indirection.
 *
 * curious-wiggling-thacker plan V-5.
 */
let onWorkKeyCreatedHook:
  | ((workId: string, rawWorkKey: Uint8Array) => Promise<void>)
  | null = null;

export function setOnWorkKeyCreatedHook(
  fn: ((workId: string, rawWorkKey: Uint8Array) => Promise<void>) | null,
): void {
  onWorkKeyCreatedHook = fn;
}

export interface EnsureWorkKeyParams {
  kek: CryptoKey;
  workId: string;
  /** DB에서 work.encrypted_dek 컬럼 (base64 문자열) 을 읽어온다. 없으면 null. */
  loadEncryptedDek: () => Promise<string | null>;
  /** 새로 만든 wrapped DEK을 work.encrypted_dek에 INSERT/UPDATE 한다. */
  saveEncryptedDek: (encryptedDekB64: string) => Promise<void>;
  /**
   * 신규 work_key 가 생성된 직후 raw 를 받아 서버 발급 (server_encrypted_dek) 처리한다.
   * Vault Transit 전환 (plan V-5). 미설정 시 발급 단계는 건너뛴다 (오프라인·테스트).
   * 호출자는 실패해도 throw 하지 않도록 (queue 적재) 처리하는 것이 권장.
   */
  onCreated?: (rawWorkKey: Uint8Array) => Promise<void>;
}

/**
 * 캐시 → 저장된 DEK unwrap → (없으면) 신규 생성 + wrap + 저장 순서로 work_key를 확보.
 *
 * <p>동시 호출은 Map으로 dedup한다. 같은 workId에 대한 두 번째 호출은 첫 번째의 Promise를 그대로 await.
 */
export async function ensureWorkKey({
  kek,
  workId,
  loadEncryptedDek,
  saveEncryptedDek,
  onCreated,
}: EnsureWorkKeyParams): Promise<CryptoKey> {
  const cached = getCachedWorkKey(workId);
  if (cached) return cached;

  const existing = inflight.get(workId);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const dek = await loadEncryptedDek();
      if (dek) {
        return await unwrapAndCacheWorkKey(kek, workId, dek);
      }
      const effectiveOnCreated =
        onCreated ??
        (onWorkKeyCreatedHook
          ? async (raw: Uint8Array) => onWorkKeyCreatedHook!(workId, raw)
          : undefined);
      const { encryptedDekB64, workKey } = await createAndWrapWorkKey(
        kek,
        effectiveOnCreated,
      );
      await saveEncryptedDek(encryptedDekB64);
      setCachedWorkKey(workId, workKey);
      return workKey;
    } finally {
      inflight.delete(workId);
    }
  })();

  inflight.set(workId, promise);
  return promise;
}
