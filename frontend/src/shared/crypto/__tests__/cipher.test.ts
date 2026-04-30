import { describe, expect, it } from 'vitest';
import {
  decryptString,
  encryptString,
  generateWorkKey,
  importAesGcmKey,
  zeroize,
} from '../cipher';

describe('cipher (AES-256-GCM)', () => {
  it('encrypt → decrypt 라운드트립이 평문을 복원한다', async () => {
    const raw = generateWorkKey();
    const key = await importAesGcmKey(raw, false);
    const plaintext = '안녕, Folio. 이건 본문 평문입니다. 🪶';

    const cipher = await encryptString(key, plaintext);
    const decrypted = await decryptString(key, cipher);

    expect(decrypted).toBe(plaintext);
    zeroize(raw);
  });

  it('동일 평문이라도 IV가 매번 달라 ciphertext가 달라진다', async () => {
    const raw = generateWorkKey();
    const key = await importAesGcmKey(raw, false);
    const a = await encryptString(key, 'hello');
    const b = await encryptString(key, 'hello');
    expect(a).not.toBe(b);
  });

  it('잘못된 키로 복호화하면 에러를 던진다 — tag 검증', async () => {
    const k1 = await importAesGcmKey(generateWorkKey(), false);
    const k2 = await importAesGcmKey(generateWorkKey(), false);
    const ct = await encryptString(k1, 'secret');

    await expect(decryptString(k2, ct)).rejects.toBeDefined();
  });

  it('변조된 ciphertext는 복호화 실패', async () => {
    const key = await importAesGcmKey(generateWorkKey(), false);
    const ct = await encryptString(key, 'secret');
    // base64를 디코드해서 마지막 바이트 한 개만 뒤집기
    const bytes = Uint8Array.from(atob(ct), (c) => c.charCodeAt(0));
    bytes[bytes.length - 1] ^= 0xff;
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    const tampered = btoa(s);

    await expect(decryptString(key, tampered)).rejects.toBeDefined();
  });

  it('너무 짧은 payload는 거부', async () => {
    const key = await importAesGcmKey(generateWorkKey(), false);
    await expect(decryptString(key, btoa('short'))).rejects.toThrow(/too short/);
  });

  it('zeroize는 byte 배열을 0으로 채운다', () => {
    const raw = new Uint8Array([1, 2, 3, 4]);
    zeroize(raw);
    expect(Array.from(raw)).toEqual([0, 0, 0, 0]);
  });
});
