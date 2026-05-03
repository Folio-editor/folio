/**
 * Plan C — AES-256-GCM 본문 암호화 / 복호화 유틸.
 *
 * 포맷: `IV(12B) || ciphertext || tag(16B)` 를 Base64로 직렬화.
 * tag는 AES-GCM의 결과 끝에 자동으로 붙는 16B authentication tag.
 *
 * <p>WebCrypto는 SubtleCrypto.encrypt 결과에 ciphertext+tag를 함께 반환하므로
 * 별도 분리 없이 그대로 IV 뒤에 붙여 저장한다.
 */

const IV_BYTES = 12;
const TAG_BITS = 128;

function getCrypto(): Crypto {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    return globalThis.crypto;
  }
  throw new Error('WebCrypto not available — Folio crypto requires SubtleCrypto');
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * 평문 문자열을 AES-256-GCM으로 암호화하여 base64(IV||CT||TAG) 반환.
 * key는 SubtleCrypto.importKey 로 만든 AES-GCM 256bit CryptoKey.
 */
export async function encryptString(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = new Uint8Array(IV_BYTES);
  getCrypto().getRandomValues(iv);

  const ctAndTag = await getCrypto().subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: TAG_BITS },
    key,
    new TextEncoder().encode(plaintext),
  );

  const merged = new Uint8Array(iv.length + ctAndTag.byteLength);
  merged.set(iv, 0);
  merged.set(new Uint8Array(ctAndTag), iv.length);
  return bytesToBase64(merged);
}

/**
 * base64(IV||CT||TAG) 를 복호화하여 원문 문자열 반환.
 * tag 검증 실패 시 SubtleCrypto가 던지는 에러를 그대로 전파한다.
 */
export async function decryptString(key: CryptoKey, payload: string): Promise<string> {
  const merged = base64ToBytes(payload);
  if (merged.length < IV_BYTES + 16) {
    throw new Error('ciphertext too short');
  }
  const iv = merged.slice(0, IV_BYTES);
  const body = merged.slice(IV_BYTES);
  const plain = await getCrypto().subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: TAG_BITS },
    key,
    body,
  );
  return new TextDecoder().decode(plain);
}

/**
 * raw 바이트(예: 32B work_key)를 AES-256-GCM으로 wrap → base64(IV||CT||TAG) 반환.
 * encryptString의 byte[] 버전. KEK으로 work_key를 wrap할 때 사용.
 */
export async function encryptBytes(key: CryptoKey, plaintext: Uint8Array): Promise<string> {
  const iv = new Uint8Array(IV_BYTES);
  getCrypto().getRandomValues(iv);

  const ctAndTag = await getCrypto().subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: TAG_BITS },
    key,
    plaintext,
  );

  const merged = new Uint8Array(iv.length + ctAndTag.byteLength);
  merged.set(iv, 0);
  merged.set(new Uint8Array(ctAndTag), iv.length);
  return bytesToBase64(merged);
}

/**
 * base64(IV||CT||TAG) 를 복호화하여 raw 바이트 반환.
 * KEK으로 wrapped work_key를 unwrap할 때 사용.
 */
export async function decryptBytes(key: CryptoKey, payload: string): Promise<Uint8Array> {
  const merged = base64ToBytes(payload);
  if (merged.length < IV_BYTES + 16) {
    throw new Error('ciphertext too short');
  }
  const iv = merged.slice(0, IV_BYTES);
  const body = merged.slice(IV_BYTES);
  const plain = await getCrypto().subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: TAG_BITS },
    key,
    body,
  );
  return new Uint8Array(plain);
}

/**
 * raw 32B 키 → AES-GCM CryptoKey.
 * extractable=false 로 만들면 export 불가능. work key는 메모리에만 머무르므로 false 추천.
 */
export async function importAesGcmKey(rawKey: ArrayBuffer | Uint8Array, extractable: boolean): Promise<CryptoKey> {
  const buf = rawKey instanceof Uint8Array ? rawKey : new Uint8Array(rawKey);
  return getCrypto().subtle.importKey(
    'raw',
    buf,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt'],
  );
}

/**
 * 16~32B work_key 랜덤 생성. 호출자는 importAesGcmKey 로 CryptoKey 변환 후 메모리 캐시에 저장.
 */
export function generateWorkKey(): Uint8Array {
  const out = new Uint8Array(32);
  getCrypto().getRandomValues(out);
  return out;
}

/**
 * 명시적 메모리 zeroize. byte[] 파기에 의미가 있는 곳에서만 사용 (DEK raw bytes 등).
 * CryptoKey 객체 자체는 GC 의존.
 */
export function zeroize(bytes: Uint8Array): void {
  bytes.fill(0);
}
