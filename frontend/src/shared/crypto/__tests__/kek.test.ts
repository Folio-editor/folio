import { describe, expect, it } from 'vitest';
import { deriveKek, deriveKekBits } from '../kek';
import { decryptString, encryptString } from '../cipher';

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fixedBytes(byte: number, len: number): Uint8Array {
  const out = new Uint8Array(len);
  out.fill(byte);
  return out;
}

/**
 * Plan C 결정 12 — 클라이언트 KEK 도출 인자 자리 검증.
 *
 * 같은 (pepper_user, salt) 라도 sub만 다르면 KEK가 달라야 한다 (info에 sub 포함).
 * 같은 입력은 결정적으로 같은 KEK여야 한다 (HKDF는 deterministic).
 * deriveBits 로 32B를 얻은 결과로 AES-GCM CryptoKey를 따로 만들어 encrypt 한 ciphertext가
 * deriveKey 로 만든 KEK 로도 복호화 가능해야 한다 (= 두 경로가 동일 키 생성).
 */
describe('kek (HKDF-SHA256, Plan C 결정 12)', () => {
  const pepperUser = bytesToBase64(fixedBytes(0xab, 32));
  const salt = bytesToBase64(fixedBytes(0xcd, 32));

  it('동일 입력 → 동일 KEK (deterministic)', async () => {
    const a = await deriveKekBits({ sub: 'sub-1', saltBase64: salt, pepperUserBase64: pepperUser });
    const b = await deriveKekBits({ sub: 'sub-1', saltBase64: salt, pepperUserBase64: pepperUser });
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('sub가 다르면 KEK가 다르다 (info domain separation)', async () => {
    const a = await deriveKekBits({ sub: 'sub-1', saltBase64: salt, pepperUserBase64: pepperUser });
    const b = await deriveKekBits({ sub: 'sub-2', saltBase64: salt, pepperUserBase64: pepperUser });
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('salt가 다르면 KEK가 다르다', async () => {
    const otherSalt = bytesToBase64(fixedBytes(0xee, 32));
    const a = await deriveKekBits({ sub: 'sub-1', saltBase64: salt, pepperUserBase64: pepperUser });
    const b = await deriveKekBits({ sub: 'sub-1', saltBase64: otherSalt, pepperUserBase64: pepperUser });
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('pepper_user가 다르면 KEK가 다르다', async () => {
    const otherPepper = bytesToBase64(fixedBytes(0x11, 32));
    const a = await deriveKekBits({ sub: 'sub-1', saltBase64: salt, pepperUserBase64: pepperUser });
    const b = await deriveKekBits({ sub: 'sub-1', saltBase64: salt, pepperUserBase64: otherPepper });
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('deriveKey 결과(non-extractable)와 deriveBits 결과가 동일 키 — 라운드트립으로 확인', async () => {
    const kekKey = await deriveKek({ sub: 'sub-1', saltBase64: salt, pepperUserBase64: pepperUser });
    const ct = await encryptString(kekKey, 'hello kek');

    // 같은 입력으로 raw bits 도출 → AES-GCM 키 만들어 복호 시도
    const bits = await deriveKekBits({ sub: 'sub-1', saltBase64: salt, pepperUserBase64: pepperUser });
    const importedKey = await globalThis.crypto.subtle.importKey(
      'raw',
      bits,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    const decrypted = await decryptString(importedKey, ct);
    expect(decrypted).toBe('hello kek');
  });

  it('deriveKey 로 만든 KEK 는 export 불가 (non-extractable)', async () => {
    const kekKey = await deriveKek({ sub: 'sub-1', saltBase64: salt, pepperUserBase64: pepperUser });
    expect(kekKey.extractable).toBe(false);
    await expect(globalThis.crypto.subtle.exportKey('raw', kekKey)).rejects.toBeDefined();
  });
});
