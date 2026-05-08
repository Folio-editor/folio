// ============================================================
// PowerSync DB 싱글턴 — Electron 렌더러 + 웹 공통
// ============================================================
// WASM SQLite(wa-sqlite)를 사용하며 OPFS 우선, 미지원 시 IndexedDB 폴백.
// 앱 전체에서 이 인스턴스 하나를 공유한다.
// ============================================================

import { PowerSyncDatabase } from '@powersync/web';
import { resetTabHelpShownFlags } from '../constants/tabHelpContent';
import { kekStorage } from '../crypto/kekStorage';
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
export async function ensureSchemaVersion(): Promise<boolean> {
  try {
    // 이미 알파 리셋 완료된 사용자 — 즉시 단락. 어떤 향후 변경에도 wipe 재발화 X.
    if (localStorage.getItem(ALPHA_RESET_FLAG_KEY) === 'true') {
      return false;
    }

    console.info('[alpha-reset] 알파 리셋 시작 — 로컬 데이터 일괄 정리');

    // 1. PowerSync SQLite — 모든 동기화 테이블 + ps_crud 큐 비우기
    await db.disconnectAndClear();

    // 2. 사용자 안내 플래그 초기화 — 새 환경에 첫 진입한 것처럼 환영 다이얼로그 / 도움말 자동 노출
    try {
      localStorage.removeItem('folio.onboarding.guideOffered');
      localStorage.removeItem('folio.welcomeTour.completed');
      // 옛 SCHEMA_VERSION 키는 더 이상 사용 안 함 — 잔존 정리
      localStorage.removeItem('folio.schema.version');
      resetTabHelpShownFlags();
    } catch (e) {
      console.warn('[alpha-reset] localStorage flag clear 실패', e);
    }

    // 3. KEK 재료 (Plan C) — safeStorage / IndexedDB 영속본 폐기. 새 backend 의 pepper
    //    material 로 다음 로그인 시 자동 재발급. 옛 재료 잔존 시 새 backend 의 sub
    //    매핑 충돌로 복호화 실패 가능.
    try {
      await kekStorage.clear();
    } catch (e) {
      console.warn('[alpha-reset] KEK material clear 실패', e);
    }

    // 4. Auth 토큰 / lastKnownWriterId — 새 backend 에 옛 토큰 무효 → 401 noisy 회피.
    //    재로그인 흐름으로 깨끗하게 진입.
    try {
      const folio = (window as { folio?: { auth?: { logout?: () => Promise<void> } } }).folio;
      if (folio?.auth?.logout) {
        await folio.auth.logout();
      }
    } catch (e) {
      console.warn('[alpha-reset] auth logout 실패 (이미 로그아웃 상태일 수 있음)', e);
    }

    // 5. 마지막 — 알파 리셋 완료 flag 영속화. 이 시점 이후 본 함수는 절대 wipe 재발화 X.
    //    중간 단계 실패 시 flag 미설정 → 다음 부팅에서 재시도 (idempotent).
    localStorage.setItem(ALPHA_RESET_FLAG_KEY, 'true');
    console.info('[alpha-reset] 완료 — 향후 자동 wipe 비활성화');
    return true;
  } catch (err) {
    // 부분 wipe 만 됐거나 전체 실패 — 앱 부팅 자체는 막지 않는다.
    // ALPHA_RESET_FLAG_KEY 가 미설정이면 다음 부팅에서 재시도.
    console.error('[alpha-reset] failed', err);
    return false;
  }
}
