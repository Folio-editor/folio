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
// 스키마 버전 체크 — schema.ts 가 변경되어도 PowerSync SDK 는 기존 SQLite 의
// 컬럼을 자동 ALTER 하지 않는다. 신규 컬럼이 추가된 버전이 배포되면 첫 부팅 시
// 강제로 disconnectAndClear 를 호출해 로컬 DB 를 비우고 서버에서 신규 schema 대로
// 다시 다운로드받도록 한다.
//
// 버전 bump 규칙:
//  - schema.ts 의 work / plan / 등 동기화 테이블 컬럼이 변경될 때 마다
//    아래 SCHEMA_VERSION 문자열을 새 식별자로 갱신.
//  - 첫 부팅 시 이전 값과 다르면 disconnectAndClear → 신 버전 저장.
//
// 주의:
//  - disconnectAndClear 는 미동기화된 로컬 변경을 잃을 수 있다.
//    오프라인 작가가 신 버전 받기 전 인터넷 연결이 끊기지 않도록 안내 필요.
//  - 데스크톱(Electron) 자동 업데이트 흐름에서도 동일하게 첫 부팅 1회 실행.
// ────────────────────────────────────────────────────────────
const SCHEMA_VERSION = 'v4_server_encrypted_dek';
const SCHEMA_VERSION_KEY = 'folio.schema.version';

/**
 * 앱 부팅 시 1회 호출. 저장된 버전과 현재 버전이 다르면 로컬 SQLite 를 비운다.
 * AppRoot 의 PowerSync 연결 시점 직전에 호출되어야 안전하다.
 *
 * 반환값: true 면 로컬을 비웠다 (호출자에서 sync 다운로드 인디케이터 표시 권장).
 */
export async function ensureSchemaVersion(): Promise<boolean> {
  try {
    const stored = localStorage.getItem(SCHEMA_VERSION_KEY);
    if (stored === SCHEMA_VERSION) return false;
    // 첫 부팅이거나 이전 버전과 다름 → 로컬 비우기
    if (stored !== null) {
      // 명시적 변경 — 콘솔 로그 (운영 디버깅용)
      console.info(
        `[schema-migrate] local schema "${stored}" → "${SCHEMA_VERSION}". clearing local DB`,
      );
    }
    await db.disconnectAndClear();
    localStorage.setItem(SCHEMA_VERSION_KEY, SCHEMA_VERSION);
    return true;
  } catch (err) {
    // 실패해도 앱 부팅 자체는 막지 않는다. 다음 부팅 시 재시도.
    console.error('[schema-migrate] failed', err);
    return false;
  }
}
