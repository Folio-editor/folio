// ============================================================
// PowerSync Sync Connector — Electron 렌더러용
// ============================================================
// - fetchCredentials: 기존 auth IPC(getAccessToken)로 JWT 제공
// - uploadData: PowerSync CRUD 큐 → 백엔드 batch 업로드
// ============================================================

import type {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
} from '@powersync/web';
import { apiClient, ApiError } from '@shared/lib/apiClient';

const POWERSYNC_URL =
  import.meta.env.VITE_POWERSYNC_URL ?? 'http://localhost:8090';

interface SyncUploadEntry {
  table: string;
  op: string;
  id: string;
  data: Record<string, unknown> | null;
}

export class StoryZipConnector implements PowerSyncBackendConnector {
  /**
   * PowerSync 서비스에 연결할 JWT와 엔드포인트를 반환한다.
   */
  async fetchCredentials() {
    let token = await window.storyzip.auth.getAccessToken();

    if (!token) {
      await window.storyzip.auth.tryRestore();
      token = await window.storyzip.auth.getAccessToken();
    }

    if (!token) {
      throw new Error('PowerSync: 인증 토큰 없음 — 로그인 필요');
    }

    return { endpoint: POWERSYNC_URL, token };
  }

  /**
   * 로컬 SQLite CRUD 큐를 서버에 batch 업로드한다.
   * PowerSync가 변경사항 발생 시 자동으로 호출한다.
   *
   * 흐름:
   *   1. getNextCrudTransaction()으로 한 트랜잭션의 모든 entry 조회
   *   2. POST /api/v1/sync/upload 로 한 번에 전송
   *   3. 200 OK 시에만 transaction.complete() → 큐에서 제거
   *   4. 실패 시 complete() 미호출 → PowerSync 자동 재시도
   *
   * 게스트 모드(토큰 없음): 큐는 누적되며 로그인 후 업로드된다.
   *
   * 클라이언트 UUID 전략:
   *   - 프론트엔드 UUID(work.id 등)를 그대로 전송
   *   - 백엔드: client UUID 수락, writer_id는 JWT에서 추출하여 덮어씀
   */
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    const token = await window.storyzip.auth.getAccessToken();
    if (!token) {
      // 게스트 모드 — 큐 유지, 로그인 후 재시도
      console.log('[uploadData] 게스트 모드 — 큐 유지');
      return;
    }

    const entries: SyncUploadEntry[] = transaction.crud.map((entry) => ({
      table: entry.table,
      op: entry.op,
      id: entry.id,
      data: (entry.opData as Record<string, unknown>) ?? null,
    }));

    try {
      await apiClient.post('/sync/upload', entries);
      await transaction.complete();
      console.log(`[uploadData] ${entries.length}개 항목 업로드 완료`);
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 'network';
      console.warn(`[uploadData] 업로드 실패 (${status}) — 재시도 예정:`, e);
      // complete() 미호출 → PowerSync 자동 재시도
    }
  }
}
