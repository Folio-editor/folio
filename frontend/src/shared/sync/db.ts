// ============================================================
// PowerSync DB 싱글턴 — Electron 렌더러 + 웹 공통
// ============================================================
// WASM SQLite(wa-sqlite)를 사용하며 OPFS 우선, 미지원 시 IndexedDB 폴백.
// 앱 전체에서 이 인스턴스 하나를 공유한다.
// ============================================================

import { PowerSyncDatabase } from '@powersync/web';
import { AppSchema } from './schema';

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: {
    dbFilename: 'folio.db',
    // OPFS 지원 환경(Electron/Chrome): OPFS에 저장
    // 미지원 환경: IndexedDB 자동 폴백 (@powersync/web 내부 처리)
  },
});

// 개발 환경에서 DevTools Console로 직접 쿼리 가능하도록 노출
// 사용법: __db.execute('SELECT * FROM work').then(r => console.table(r.rows._array))
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__db = db;
}

// ────────────────────────────────────────────────────────────
// 단발성 알파 리셋 (One-shot Alpha Reset)
// ────────────────────────────────────────────────────────────
// 2026-05-08 알파 테스트 단계: EC2 컨테이너 DB 전체 초기화 + Phase 4.6 의 광범위
// schema/데이터 변경 (episode.status '미작성'→'예정', episode_chunk 암호화,
// summary_tsv 드롭, time_progression TEXT, content_hash 추가 등) 동반.
//
// 알파 사용자가 새 빌드 자동 업데이트 시 이전 ps_crud 큐의 좀비 row 가 빈 backend
// 로 부활하는 것을 차단하고 KEK 재료 무효를 깨끗하게 정리하기 위해 **본 빌드 부팅 1회만**
// 로컬 일괄 wipe.
//
// ★ 핵심 보장 — **이번 wipe 가 자동 wipe 의 마지막**:
//   본 함수는 'folio.alpha.reset.v6.done' flag 1개만 본다. 이 flag 가 'true' 면
//   영구히 단락 (return false) 하므로, 향후 어떤 schema 변경에도 자동 wipe 가
//   재발화하지 않는다. 미래 마이그레이션은 다음 중 하나로 처리:
//     1. 하위 호환 컬럼 추가 (PowerSync 가 NULL 로 자동 처리)
//     2. 백엔드 측 데이터 마이그레이션 (UPDATE/ALTER) + sync down 으로 클라이언트 자동 갱신
//     3. Settings UI 의 명시적 사용자 trigger (예: AboutSettings 의 "튜토리얼 다시 시작")
//
// 주의:
//   - disconnectAndClear 는 미동기화된 로컬 변경을 잃을 수 있다.
//     알파 사용자에게 빌드 업데이트 안내 시 인터넷 연결 권고.
//   - flag 가 한 번 설정된 후엔 SCHEMA_VERSION_KEY 같은 다른 키도 의미 없음.
// ────────────────────────────────────────────────────────────
const ALPHA_RESET_FLAG_KEY = 'folio.alpha.reset.v6.done';

/**
 * 앱 부팅 시 1회 호출. 알파 리셋 flag 가 미설정인 사용자에 한해 1회 wipe.
 *
 * ★ flag 가 설정된 후엔 절대 다시 발화되지 않음 — SCHEMA_VERSION 같은 다른 식별자
 * 변경과 무관. 미래에 새로 wipe 가 필요한 시나리오가 발생하면 별도 함수 (예:
 * `ensureFooReset()`) 를 만들고 별도 flag 키 사용.
 *
 * 반환값: true 면 wipe 가 수행됐다 (호출자에서 sync 다운로드 인디케이터 표시 권장).
 */
/**
 * ★ 2026-05-11 자동 wipe 폐기 — no-op 로 전환.
 *
 * <p>배경: 알파 단계 종료 후, 신규 사용자가 첫 OAuth 로그인 직후 본 함수의 자동 wipe
 * 로직(disconnectAndClear + auth.logout)에 의해 곧바로 강제 logout 당해 "한 번 더
 * 로그인해야 인증됨" 증상을 유발하는 회귀가 확인됨.
 *
 * <p>알파 빌드 잔존 데이터가 있는 기존 사용자도 이 시점에는 자연스럽게 정리됐을 것으로
 * 판단하여 자동 wipe 를 완전 폐기. 향후 비슷한 일괄 정리가 필요해지면:
 * <ol>
 *   <li>별도 함수 이름 + 별도 flag 키로 신규 함수 작성 (절대 본 함수 재활성화 금지)</li>
 *   <li>Settings UI 의 명시적 사용자 trigger 권장 (예: "데이터 초기화")</li>
 * </ol>
 *
 * @return 항상 false — wipe 가 수행되지 않음을 의미. 호출자(AppRoot)는 이 반환값을
 *         보지 않으므로 무해. flag 는 호환용으로만 세팅.
 */
export async function ensureSchemaVersion(): Promise<boolean> {
  if (localStorage.getItem(ALPHA_RESET_FLAG_KEY) !== 'true') {
    try {
      localStorage.setItem(ALPHA_RESET_FLAG_KEY, 'true');
    } catch {
      /* storage 접근 실패는 부팅을 막지 않음 */
    }
  }
  return false;
}
