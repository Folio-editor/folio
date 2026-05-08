/**
 * Plan C 결정 11 — KEK 라이프사이클 관리.
 *
 * <p>4가지 트리거:
 * <ol>
 *   <li>로그인 성공 — pepper_user/salt/sub/version 보관 + KEK 메모리 도출</li>
 *   <li>로그아웃 — KEK / work_key 캐시 / 영속 재료 모두 폐기</li>
 *   <li>사용자 전환 — 이전 사용자 KEK 폐기 후 신규 사용자로 재도출</li>
 *   <li>pepper_version 변화 감지 — KEK 즉시 재도출 (회전 대응)</li>
 * </ol>
 *
 * <p>30일 비활성 자동 폐기는 별도 스케줄러(상위 hooks layer)에서 호출한다.
 *
 * <p>이 모듈은 "단일 진실의 KEK 핸들"을 모듈 스코프에 보관한다. 다중 사용자
 * 동시 세션은 의도적으로 지원하지 않는다(Plan C 가정).
 */

import { deriveKek } from './kek';
import { clear as clearWorkKeyCache } from './keyCache';
import { kekStorage } from './kekStorage';
import type { ImportKeyMaterial } from './kekStorage.types';

// KEK 상태는 globalThis 에 저장한다.
// 이전엔 module-scope let 변수를 썼으나, prd 빌드에서 vite/rollup chunk splitting
// 으로 lifecycle 모듈이 두 인스턴스로 번들되는 케이스가 발생 → restoreKek() 가
// 한 인스턴스에 currentKek 을 set 해도 hook 의 getCurrentKek() 가 다른 인스턴스
// 를 보고 null 을 반환하는 회귀가 있었다. globalThis 는 인스턴스 무관 단일 슬롯.
interface KekGlobal {
  currentKek: CryptoKey | null;
  currentMaterial: ImportKeyMaterial | null;
  lastActivityMs: number;
}

const KEK_STATE_KEY = '__folio_kek_state__';
const _g = globalThis as unknown as Record<string, KekGlobal | undefined>;
if (!_g[KEK_STATE_KEY]) {
  _g[KEK_STATE_KEY] = {
    currentKek: null,
    currentMaterial: null,
    lastActivityMs: Date.now(),
  };
}
const state: KekGlobal = _g[KEK_STATE_KEY]!;

const INACTIVITY_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000; // 30일

export interface InitKekParams {
  sub: string;
  saltBase64: string;
  pepperUserBase64: string;
  pepperVersion: string;
}

/**
 * 로그인 직후 호출. 영속 저장 + KEK 메모리 도출까지 한 번에.
 * 이미 다른 사용자의 KEK가 있다면 자동 폐기된다 (사용자 전환).
 */
export async function initKekFromLogin(params: InitKekParams): Promise<CryptoKey> {
  if (state.currentMaterial && state.currentMaterial.sub !== params.sub) {
    await clearKek();
  }
  await kekStorage.save(params);
  state.currentMaterial = { ...params };
  state.currentKek = await deriveKek(params);
  touchActivity();
  return state.currentKek;
}

/**
 * 앱 재시작 시 호출. 영속된 재료가 있으면 KEK를 메모리에 재도출, 없으면 null.
 * pepper_version이 바뀌었다면 호출자가 ensureKekVersion으로 재도출 필요.
 */
export async function restoreKek(): Promise<CryptoKey | null> {
  const m = await kekStorage.load();
  if (!m) {
    state.currentKek = null;
    state.currentMaterial = null;
    return null;
  }
  state.currentMaterial = m;
  state.currentKek = await deriveKek(m);
  touchActivity();
  return state.currentKek;
}

/** 메모리에 보관된 현재 KEK. 없으면 null. raw bytes 반환은 결정 13으로 금지된다. */
export function getCurrentKek(): CryptoKey | null {
  if (!state.currentKek) return null;
  if (Date.now() - state.lastActivityMs > INACTIVITY_TIMEOUT_MS) {
    void clearKek();
    return null;
  }
  return state.currentKek;
}

export function getCurrentMaterial(): ImportKeyMaterial | null {
  return state.currentMaterial ? { ...state.currentMaterial } : null;
}

/**
 * 로그아웃 / 30일 비활성 / 사용자 전환 시. 메모리 + 디스크 모두 폐기 + work key 캐시 비움.
 */
export async function clearKek(): Promise<void> {
  state.currentKek = null;
  state.currentMaterial = null;
  clearWorkKeyCache();
  try {
    await kekStorage.clear();
  } catch {
    // 디스크 폐기 실패해도 메모리는 이미 비웠으니 진행
  }
}

/**
 * 서버가 새로운 pepper_user/version을 내려줬을 때 (회전 감지) — 즉시 재도출.
 * 호출자는 이후 work_key 재암호화 큐를 트리거해야 한다.
 */
export async function rotateKek(next: InitKekParams): Promise<CryptoKey> {
  clearWorkKeyCache();
  await kekStorage.save(next);
  state.currentMaterial = { ...next };
  state.currentKek = await deriveKek(next);
  touchActivity();
  return state.currentKek;
}

/**
 * 로그인 응답의 pepper_version과 현재 보관된 version이 일치하는지 확인.
 * 다르면 rotateKek 호출하여 재도출. 일치하면 no-op.
 */
export async function ensureKekVersion(latest: InitKekParams): Promise<CryptoKey> {
  if (
    !state.currentMaterial ||
    state.currentMaterial.pepperVersion !== latest.pepperVersion ||
    state.currentMaterial.pepperUserBase64 !== latest.pepperUserBase64 ||
    state.currentMaterial.saltBase64 !== latest.saltBase64 ||
    state.currentMaterial.sub !== latest.sub
  ) {
    return rotateKek(latest);
  }
  if (!state.currentKek) {
    state.currentKek = await deriveKek(latest);
  }
  touchActivity();
  return state.currentKek;
}

/** 사용자 활동(편집/저장/네트워크) 발생 시 hook이 호출. 30일 카운터 리셋. */
export function touchActivity(): void {
  state.lastActivityMs = Date.now();
}

/** 테스트 / dev 도구 전용. prod 분기에서 호출 금지. */
export function __resetForTests(): void {
  state.currentKek = null;
  state.currentMaterial = null;
  state.lastActivityMs = Date.now();
  clearWorkKeyCache();
}
