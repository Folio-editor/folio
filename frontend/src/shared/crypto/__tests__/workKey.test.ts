import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decryptString,
  encryptString,
  generateWorkKey,
  importAesGcmKey,
} from '../cipher';
import {
  clear as clearWorkKeyCache,
  getWorkKey,
  hasWorkKey,
} from '../keyCache';
import {
  createAndWrapWorkKey,
  ensureWorkKey,
  unwrapAndCacheWorkKey,
} from '../workKey';

async function makeKek(): Promise<CryptoKey> {
  return importAesGcmKey(generateWorkKey(), false);
}

describe('workKey (KEK ↔ DEK)', () => {
  beforeEach(() => {
    clearWorkKeyCache();
  });

  it('createAndWrapWorkKey → unwrapAndCacheWorkKey 라운드트립으로 본문이 그대로 복원된다', async () => {
    const kek = await makeKek();
    const { encryptedDekB64, workKey } = await createAndWrapWorkKey(kek);

    const cipher = await encryptString(workKey, '본문');

    const recovered = await unwrapAndCacheWorkKey(kek, 'work-1', encryptedDekB64);
    const decrypted = await decryptString(recovered, cipher);

    expect(decrypted).toBe('본문');
    expect(hasWorkKey('work-1')).toBe(true);
    expect(getWorkKey('work-1')).toBe(recovered);
  });

  it('ensureWorkKey: 캐시 hit이면 load/save 없이 캐시된 키 반환', async () => {
    const kek = await makeKek();
    const { workKey } = await createAndWrapWorkKey(kek);
    // 캐시에 직접 등록
    const { setWorkKey } = await import('../keyCache');
    setWorkKey('work-cached', workKey);

    const load = vi.fn();
    const save = vi.fn();
    const got = await ensureWorkKey({
      kek,
      workId: 'work-cached',
      loadEncryptedDek: load,
      saveEncryptedDek: save,
    });

    expect(got).toBe(workKey);
    expect(load).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('ensureWorkKey: 저장된 DEK이 있으면 unwrap만 한다 (save 호출 X)', async () => {
    const kek = await makeKek();
    const { encryptedDekB64 } = await createAndWrapWorkKey(kek);

    const save = vi.fn();
    const got = await ensureWorkKey({
      kek,
      workId: 'work-existing',
      loadEncryptedDek: async () => encryptedDekB64,
      saveEncryptedDek: save,
    });

    expect(save).not.toHaveBeenCalled();
    expect(getWorkKey('work-existing')).toBe(got);
  });

  it('ensureWorkKey: 저장된 DEK이 없으면 신규 생성 + save 호출', async () => {
    const kek = await makeKek();
    const save = vi.fn().mockResolvedValue(undefined);

    const got = await ensureWorkKey({
      kek,
      workId: 'work-new',
      loadEncryptedDek: async () => null,
      saveEncryptedDek: save,
    });

    expect(save).toHaveBeenCalledOnce();
    const savedB64 = save.mock.calls[0][0] as string;
    // unwrap 가능해야 함
    const unwrapped = await unwrapAndCacheWorkKey(kek, 'work-new-2', savedB64);
    const ct = await encryptString(got, 'x');
    const pt = await decryptString(unwrapped, ct);
    expect(pt).toBe('x');
  });

  it('ensureWorkKey: 같은 workId 동시 호출은 dedup → save 한 번만 호출', async () => {
    const kek = await makeKek();
    let savedDek: string | null = null;
    const save = vi.fn().mockImplementation(async (b64: string) => {
      // save가 끝난 다음에야 load가 비-null을 반환하도록
      await new Promise((r) => setTimeout(r, 10));
      savedDek = b64;
    });
    const load = vi.fn().mockImplementation(async () => savedDek);

    const [a, b, c] = await Promise.all([
      ensureWorkKey({
        kek,
        workId: 'work-race',
        loadEncryptedDek: load,
        saveEncryptedDek: save,
      }),
      ensureWorkKey({
        kek,
        workId: 'work-race',
        loadEncryptedDek: load,
        saveEncryptedDek: save,
      }),
      ensureWorkKey({
        kek,
        workId: 'work-race',
        loadEncryptedDek: load,
        saveEncryptedDek: save,
      }),
    ]);

    expect(save).toHaveBeenCalledOnce();
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});
