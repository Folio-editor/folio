/**
 * Plan C 결정 12 — 클라이언트 KEK 도출.
 *
 * KEK = HKDF-SHA256(IKM=pepper_user, salt=user_salt, info="folio-kek-v1:" + sub) → 32B AES-GCM CryptoKey
 *
 * <p>결정 13에 따라 **non-extractable**로 만든다. 즉 SubtleCrypto.deriveKey 1단계로 직접
 * AES-GCM CryptoKey를 만들고 extractable=false 로 둔다.
 *
 * <p>입력 자리 바꿈은 결함 #1로 분류된다. info 필드에 sub를 끼워넣어 동일 (pepper_user, salt)
 * 라도 sub가 다르면 다른 KEK가 나오도록 도메인 분리.
 */

import { ImportKeyMaterial } from './kekStorage.types';

const KEK_INFO_PREFIX = 'folio-kek-v1:';

function getCrypto(): Crypto {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    return globalThis.crypto;
  }
  throw new Error('WebCrypto not available — KEK derivation requires SubtleCrypto');
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export interface KekDerivationInput {
  /** Google sub. info 필드에 사용 */
  sub: string;
  /** Base64-encoded user_salt (writer.encryption_salt) */
  saltBase64: string;
  /** Base64-encoded pepper_user — KEK의 IKM */
  pepperUserBase64: string;
}

/**
 * 1단계 deriveKey 로 KEK CryptoKey(AES-GCM 256, non-extractable) 생성.
 *
 * <p>WebCrypto의 HKDF deriveKey 는 salt/info 인자를 그대로 RFC 5869 형식에 매핑한다:
 *   PRK = HMAC-SHA256(salt, IKM)
 *   OKM = HKDF-Expand(PRK, info, length)
 *
 * 따라서 Plan C 결정 12의 (IKM=pepper_user, salt=user_salt, info="folio-kek-v1:"+sub)
 * 는 그대로 적용된다.
 */
export async function deriveKek(input: KekDerivationInput): Promise<CryptoKey> {
  const ikm = base64ToBytes(input.pepperUserBase64);
  const salt = base64ToBytes(input.saltBase64);
  const info = new TextEncoder().encode(KEK_INFO_PREFIX + input.sub);

  // IKM을 HKDF base key로 import (extractable=false, deriveKey 권한만)
  const baseKey = await getCrypto().subtle.importKey(
    'raw',
    ikm,
    { name: 'HKDF' },
    false,
    ['deriveKey', 'deriveBits'],
  );

  try {
    return await getCrypto().subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt,
        info,
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false, // extractable: 결정 13 — non-extractable 강제
      ['encrypt', 'decrypt'],
    );
  } finally {
    // ikm/salt 평문은 더 이상 필요 없으므로 메모리 zeroize.
    ikm.fill(0);
    salt.fill(0);
  }
}

/** raw bytes 형태의 도출이 필요할 때 (디버그/마이그레이션 한정). 결정 13에 따라 직후 zeroize 필수. */
export async function deriveKekBits(input: KekDerivationInput): Promise<Uint8Array> {
  const ikm = base64ToBytes(input.pepperUserBase64);
  const salt = base64ToBytes(input.saltBase64);
  const info = new TextEncoder().encode(KEK_INFO_PREFIX + input.sub);

  const baseKey = await getCrypto().subtle.importKey(
    'raw',
    ikm,
    { name: 'HKDF' },
    false,
    ['deriveBits'],
  );

  try {
    const bits = await getCrypto().subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info },
      baseKey,
      256,
    );
    return new Uint8Array(bits);
  } finally {
    ikm.fill(0);
    salt.fill(0);
  }
}

export type { ImportKeyMaterial };
