import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  __resetForTests,
  clearKek,
  ensureKekVersion,
  getCurrentKek,
  getCurrentMaterial,
  initKekFromLogin,
  restoreKek,
  rotateKek,
} from '../lifecycle';
import { getWorkKey, setWorkKey, size as workKeyCacheSize } from '../keyCache';
import { generateWorkKey, importAesGcmKey } from '../cipher';
import type { FolioCryptoMaterial } from '../../types/auth';

// ---- in-memory window.folio.crypto stub ----
let stored: FolioCryptoMaterial | null = null;
const stub = {
  saveMaterial: async (m: FolioCryptoMaterial) => {
    stored = { ...m };
  },
  loadMaterial: async () => (stored ? { ...stored } : null),
  clearMaterial: async () => {
    stored = null;
  },
};

function bytesToBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

function fixed(byte: number, len: number): Uint8Array {
  const o = new Uint8Array(len);
  o.fill(byte);
  return o;
}

beforeEach(() => {
  stored = null;
  __resetForTests();
  (globalThis as unknown as { folio?: unknown }).folio = { crypto: stub };
});

afterEach(() => {
  delete (globalThis as { folio?: unknown }).folio;
});

const PARAMS_USER1_V1 = {
  sub: 'user-1',
  saltBase64: bytesToBase64(fixed(0x11, 32)),
  pepperUserBase64: bytesToBase64(fixed(0xaa, 32)),
  pepperVersion: 'v1',
};

const PARAMS_USER2_V1 = {
  sub: 'user-2',
  saltBase64: bytesToBase64(fixed(0x22, 32)),
  pepperUserBase64: bytesToBase64(fixed(0xbb, 32)),
  pepperVersion: 'v1',
};

const PARAMS_USER1_V2 = { ...PARAMS_USER1_V1, pepperUserBase64: bytesToBase64(fixed(0xcc, 32)), pepperVersion: 'v2' };

describe('lifecycle (Plan C 결정 11)', () => {
  it('initKekFromLogin → 재료 영속 + KEK 메모리 도출 + getCurrentKek 반환', async () => {
    const kek = await initKekFromLogin(PARAMS_USER1_V1);
    expect(kek).toBeDefined();
    expect(kek.extractable).toBe(false);
    expect(getCurrentKek()).toBe(kek);
    expect(getCurrentMaterial()).toEqual(PARAMS_USER1_V1);
    expect(stored).toEqual(PARAMS_USER1_V1);
  });

  it('clearKek → 메모리/디스크/work cache 모두 비움', async () => {
    await initKekFromLogin(PARAMS_USER1_V1);
    setWorkKey('w1', await importAesGcmKey(generateWorkKey(), false));
    expect(workKeyCacheSize()).toBe(1);

    await clearKek();

    expect(getCurrentKek()).toBeNull();
    expect(getCurrentMaterial()).toBeNull();
    expect(stored).toBeNull();
    expect(workKeyCacheSize()).toBe(0);
  });

  it('사용자 전환 — 다른 sub로 init 호출 시 이전 KEK가 자동 폐기', async () => {
    await initKekFromLogin(PARAMS_USER1_V1);
    setWorkKey('w1', await importAesGcmKey(generateWorkKey(), false));

    await initKekFromLogin(PARAMS_USER2_V1);

    expect(getCurrentMaterial()?.sub).toBe('user-2');
    // 이전 사용자의 work key 캐시는 비워져야 한다
    expect(getWorkKey('w1')).toBeUndefined();
  });

  it('restoreKek — 영속 재료가 있으면 KEK 재도출, 없으면 null', async () => {
    await initKekFromLogin(PARAMS_USER1_V1);
    __resetForTests();
    expect(getCurrentKek()).toBeNull();

    const restored = await restoreKek();
    expect(restored).toBeDefined();
    expect(getCurrentMaterial()).toEqual(PARAMS_USER1_V1);

    await clearKek();
    __resetForTests();
    expect(await restoreKek()).toBeNull();
  });

  it('ensureKekVersion — version 일치 시 no-op (동일 KEK)', async () => {
    const kek = await initKekFromLogin(PARAMS_USER1_V1);
    const same = await ensureKekVersion(PARAMS_USER1_V1);
    expect(same).toBe(kek);
  });

  it('ensureKekVersion — pepper_version 변화 감지 시 재도출 + work cache flush', async () => {
    await initKekFromLogin(PARAMS_USER1_V1);
    setWorkKey('w1', await importAesGcmKey(generateWorkKey(), false));

    const rotated = await ensureKekVersion(PARAMS_USER1_V2);
    expect(getCurrentMaterial()?.pepperVersion).toBe('v2');
    expect(rotated.extractable).toBe(false);
    expect(getWorkKey('w1')).toBeUndefined();
  });

  it('rotateKek — 명시 회전 호출도 work cache flush + KEK 재도출', async () => {
    await initKekFromLogin(PARAMS_USER1_V1);
    setWorkKey('w1', await importAesGcmKey(generateWorkKey(), false));

    await rotateKek(PARAMS_USER1_V2);
    expect(getCurrentMaterial()?.pepperVersion).toBe('v2');
    expect(getWorkKey('w1')).toBeUndefined();
  });
});
