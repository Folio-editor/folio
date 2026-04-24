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

// Windows Docker에서 localhost는 IPv6 우선 해석되는데 컨테이너는 IPv4 바인딩이라
// CONNECTION_RESET이 난다. 기본값을 127.0.0.1로 고정.
const POWERSYNC_URL =
  import.meta.env.VITE_POWERSYNC_URL ?? 'http://127.0.0.1:8090';

interface SyncUploadEntry {
  table: string;
  op: string;
  id: string;
  data: Record<string, unknown> | null;
}

export class FolioConnector implements PowerSyncBackendConnector {
  /** 마지막 업로드 시각 — throttle 판단 기준 */
  private lastUploadAt = 0;
  /** 업로드 최소 간격 (ms). 디바운스 3초와 합쳐 실질 5~8초 간격 업로드 */
  private static readonly UPLOAD_THROTTLE_MS = 5000;

  /**
   * PowerSync 서비스에 연결할 JWT와 엔드포인트를 반환한다.
   */
  async fetchCredentials() {
    let token = await window.folio.auth.getAccessToken();

    if (!token) {
      await window.folio.auth.tryRestore();
      token = await window.folio.auth.getAccessToken();
    }

    if (!token) {
      throw new Error('PowerSync: 인증 토큰 없음 — 로그인 필요');
    }

    console.log('[sync] 인증 OK, PowerSync 연결 시도:', POWERSYNC_URL);
    return { endpoint: POWERSYNC_URL, token };
  }

  /**
   * 로컬 SQLite CRUD 큐를 서버에 batch 업로드한다.
   * PowerSync가 변경사항 발생 시 자동으로 호출한다.
   *
   * 흐름:
   *   1. getCrudBatch(BATCH_SIZE)로 최대 50건의 entry를 한 배치로 조회
   *   2. POST /api/v1/sync/upload 로 한 번에 전송
   *   3. 200 OK 시에만 batch.complete() → 큐에서 제거
   *   4. 실패 시 complete() 미호출 → PowerSync 자동 재시도
   *   5. 배치 간 200ms throttle로 서버 burst 부하 방지
   *
   * 게스트 모드(토큰 없음): 큐는 누적되며 로그인 후 업로드된다.
   *
   * 클라이언트 UUID 전략:
   *   - 프론트엔드 UUID(work.id 등)를 그대로 전송
   *   - 백엔드: client UUID 수락, writer_id는 JWT에서 추출하여 덮어씀
   */
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const token = await window.folio.auth.getAccessToken();
    if (!token) {
      console.log('[uploadData] 게스트 모드 — 큐 유지');
      return;
    }

    // 마지막 업로드로부터 5초 미경과 시 건너뜀
    // → PowerSync가 나중에 재호출하며, 그때 쌓인 entry를 한 번에 처리
    const now = Date.now();
    if (now - this.lastUploadAt < FolioConnector.UPLOAD_THROTTLE_MS) {
      return;
    }
    this.lastUploadAt = now;

    const BATCH_SIZE = 50;
    const THROTTLE_MS = 200;

    let batch = await database.getCrudBatch(BATCH_SIZE);

    while (batch) {
      const entries: SyncUploadEntry[] = batch.crud.map((entry) => ({
        table: entry.table,
        op: entry.op,
        id: entry.id,
        data: (entry.opData as Record<string, unknown>) ?? null,
      }));

      try {
        await apiClient.post('/sync/upload', entries);
        await batch.complete();
        console.log(`[sync] uploadData ${entries.length}건 업로드 성공`);
      } catch (e) {
        const status = e instanceof ApiError ? e.status : 'network';
        console.warn(`[sync] uploadData 업로드 실패 (${status}) — 재시도 예정:`, e);
        break;
      }

      if (!batch.haveMore) break;

      // 다음 배치 전 throttle — 서버 burst 부하 방지
      await new Promise((r) => setTimeout(r, THROTTLE_MS));
      batch = await database.getCrudBatch(BATCH_SIZE);
    }
  }
}
