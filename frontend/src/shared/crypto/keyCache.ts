/**
 * Plan C — workId → work_key(AES-GCM CryptoKey) 메모리 캐시.
 *
 * <p>편집 세션 동안 한 번 KEK로 work.encrypted_dek를 풀어 CryptoKey 객체로 보관하면,
 * 매 키 입력마다 KDF/decrypt 비용을 내지 않아도 된다. 로그아웃·세션 종료·사용자 전환 시
 * {@link clear} 로 통째로 비운다 (결정 11).
 *
 * <p>저장하는 값은 CryptoKey 객체뿐이다. raw 바이트는 캐시에 두지 않는다 — Electron / 웹 모두
 * non-extractable 핸들로 만들어 저장한다.
 */

const cache = new Map<string, CryptoKey>();

export function setWorkKey(workId: string, key: CryptoKey): void {
  cache.set(workId, key);
}

export function getWorkKey(workId: string): CryptoKey | undefined {
  return cache.get(workId);
}

export function hasWorkKey(workId: string): boolean {
  return cache.has(workId);
}

export function deleteWorkKey(workId: string): void {
  cache.delete(workId);
}

/** 사용자 전환 / 로그아웃 / 30일 비활성 시 호출. 결정 11. */
export function clear(): void {
  cache.clear();
}

/** 디버그 / 테스트용. 절대 prod 분기에서 의존하지 말 것. */
export function size(): number {
  return cache.size;
}
