/**
 * Plan C — KEK / pepper_user / user_salt 영속화 어댑터의 타입 계약.
 *
 * <p>실제 구현은 platform별:
 * <ul>
 *   <li>Electron renderer: main 프로세스의 safeStorage IPC를 호출 (DPAPI/Keychain)</li>
 *   <li>Web: IndexedDB에 non-extractable CryptoKey 핸들 저장</li>
 * </ul>
 *
 * <p>storage 어댑터는 raw KEK bytes를 절대 받지 않는다. 원자료(pepper_user/salt)만 보관하고
 * KEK는 렌더러 메모리에서 재도출한다. — 결정 1/2.
 */

/** 로그인 응답 EncryptionMaterial 4개 필드 그대로 storage에 보관할 단위. */
export interface ImportKeyMaterial {
  sub: string;
  saltBase64: string;
  pepperUserBase64: string;
  pepperVersion: string;
}

/** 환경별 어댑터가 구현할 인터페이스. 구현은 후속 단계에서 추가. */
export interface KekStorageAdapter {
  save(material: ImportKeyMaterial): Promise<void>;
  load(): Promise<ImportKeyMaterial | null>;
  clear(): Promise<void>;
}
