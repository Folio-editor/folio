/**
 * Plan C — 환경 무관 KEK 도출 재료 영속화.
 *
 * <p>Electron renderer / Web 모두 `window.folio.crypto` 가 노출되어 있으므로
 * 공통 인터페이스로 호출만 위임한다.
 *
 * <ul>
 *   <li>Electron: main 프로세스 safeStorage (DPAPI/Keychain) IPC</li>
 *   <li>Web: IndexedDB</li>
 * </ul>
 *
 * <p>raw KEK는 어디에도 영속하지 않는다. 매 세션 메모리에서 deriveKek로 재도출.
 */

import type { ImportKeyMaterial, KekStorageAdapter } from './kekStorage.types';

interface PlatformCryptoApi {
  saveMaterial: (m: ImportKeyMaterial) => Promise<void>;
  loadMaterial: () => Promise<ImportKeyMaterial | null>;
  clearMaterial: () => Promise<void>;
}

function getApi(): PlatformCryptoApi {
  const api = (globalThis as unknown as { folio?: { crypto?: PlatformCryptoApi } }).folio?.crypto;
  if (!api) {
    throw new Error('window.folio.crypto unavailable — preload or web FolioApi not initialized');
  }
  return api;
}

export const kekStorage: KekStorageAdapter = {
  save: (material) => getApi().saveMaterial(material),
  load: () => getApi().loadMaterial(),
  clear: () => getApi().clearMaterial(),
};
