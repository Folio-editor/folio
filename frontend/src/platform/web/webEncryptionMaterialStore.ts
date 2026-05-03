/**
 * Plan C 결정 2 — 웹 환경의 KEK 도출 재료 영속화.
 *
 * <p>IndexedDB에 단일 레코드로 저장한다. raw KEK는 절대 두지 않으며 입력 재료
 * (sub, salt, pepper_user, version)만 보관한다. 도메인 분리(같은 사용자 다른 origin은
 * 다른 IndexedDB)가 자연스럽게 되어 brower SOP 보호를 받는다.
 *
 * <p>실제 KEK는 매 세션 메모리에서 deriveKey 로 만들고 non-extractable로 둔다 (결정 13).
 */

import type { FolioCryptoMaterial } from '../../shared/types/auth';

const DB_NAME = 'folio-crypto';
const DB_VERSION = 1;
const STORE_NAME = 'material';
const RECORD_KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const req = fn(tx.objectStore(STORE_NAME));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB tx failed'));
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
      }),
  );
}

export async function saveWebMaterial(material: FolioCryptoMaterial): Promise<void> {
  await withStore('readwrite', (store) => store.put(material, RECORD_KEY));
}

export async function loadWebMaterial(): Promise<FolioCryptoMaterial | null> {
  const result = await withStore('readonly', (store) => store.get(RECORD_KEY));
  if (!result) return null;
  const m = result as Partial<FolioCryptoMaterial>;
  if (
    typeof m.sub !== 'string' ||
    typeof m.saltBase64 !== 'string' ||
    typeof m.pepperUserBase64 !== 'string' ||
    typeof m.pepperVersion !== 'string'
  ) {
    return null;
  }
  return m as FolioCryptoMaterial;
}

export async function clearWebMaterial(): Promise<void> {
  await withStore('readwrite', (store) => store.delete(RECORD_KEY));
}
