// ============================================================
// PowerSync DB 싱글턴 — Electron 렌더러용
// ============================================================
// WASM SQLite(wa-sqlite)를 사용하며 OPFS 우선, 미지원 시 IndexedDB 폴백.
// 앱 전체에서 이 인스턴스 하나를 공유한다.
// ============================================================

import { PowerSyncDatabase } from '@powersync/web';
import { AppSchema } from '@shared/sync/schema';

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: {
    dbFilename: 'storyzip.db',
    // OPFS 지원 환경(Electron/Chrome): OPFS에 저장
    // 미지원 환경: IndexedDB 자동 폴백 (@powersync/web 내부 처리)
  },
});
