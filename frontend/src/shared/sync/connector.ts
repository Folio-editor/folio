// ============================================================
// PowerSync Sync Connector — Electron 렌더러 + 웹 공통
// ============================================================
// - fetchCredentials: window.folio.auth.getAccessToken으로 JWT 제공
//   (Electron: IPC, Web: 메모리 AT 어댑터)
// - uploadData: PowerSync CRUD 큐 → 백엔드 batch 업로드
// ============================================================

import type {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
} from '@powersync/web';
import { apiClient, ApiError } from '../lib/apiClient';
import { useNetworkStore } from '../hooks/useNetworkStatus';
import { analytics, countBucket } from '../lib/analytics';
import { sanitizeCrudBatch } from './uploadSanitizer';

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
    if (!useNetworkStore.getState().isOnline) {
      return;
    }

    const token = await window.folio.auth.getAccessToken();
    if (!token) {
      return;
    }

    // 마지막 업로드로부터 throttle 미경과 시, 남은 시간만큼 대기 후 진행
    // → 즉시 return 하면 큐가 그대로 남아 PowerSync가 빠르게 재호출하다가 일시
    //    uploadError가 set되어 UI에 "동기화 오류"로 잘못 표시되는 문제가 발생.
    //    sleep으로 정상 종료 흐름을 유지해 status flag를 안정화.
    const elapsed = Date.now() - this.lastUploadAt;
    if (elapsed < FolioConnector.UPLOAD_THROTTLE_MS) {
      await new Promise((r) =>
        setTimeout(r, FolioConnector.UPLOAD_THROTTLE_MS - elapsed),
      );
    }
    this.lastUploadAt = Date.now();

    const BATCH_SIZE = 50;
    const THROTTLE_MS = 200;

    let batch = await database.getCrudBatch(BATCH_SIZE);

    while (batch) {
      // ★ Plan C 결정 23 — 큐 entry 서버 전송 직전 sanitize.
      // 게스트 시절 적재된 평문 PUT/PATCH op 의 본문 컬럼을 KEK + work_key로 ciphertext 교체.
      // KEK 없으면(게스트/PepperProvider 비활성) 즉시 no-op. 멱등 + 개별 op 실패 격리.
      // 백필(SQLite 측) + sanitize(큐 측) 이중 보호로 평문이 서버에 도달할 모든 경로를 차단.
      await sanitizeCrudBatch(database, batch);

      const entries: SyncUploadEntry[] = batch.crud.map((entry) => ({
        table: entry.table,
        op: entry.op,
        id: entry.id,
        data: (entry.opData as Record<string, unknown>) ?? null,
      }));

      try {
        void analytics.track('sync_started', {
          queue_count_bucket: countBucket(entries.length),
        });
        await apiClient.post('/sync/upload', entries);
        await batch.complete();
        void analytics.track('sync_succeeded', {
          event_count_bucket: countBucket(entries.length),
        });
        // batch 안에 work PUT 이 있으면 서버에 work 행 도달 → server-dek 즉시 발급 가능.
        // pending queue + SQLite 의 stale work (server_encrypted_dek=NULL) 둘 다 trigger.
        // sanitize 의 issueServerDek 는 즉시 호출 안 하고 pending 만 적재 →
        // 여기 trigger 가 진짜 발급. backend INSERT 커밋·트랜잭션 가시성 위해 짧은 delay.
        const hasWorkPut = entries.some((e) => e.table === 'work' && e.op === 'PUT');
        if (hasWorkPut) {
          const { retryPendingServerDeks } = await import('../crypto/serverDek');
          const { reconcileMissingServerDeks } = await import(
            '../crypto/serverDekReconciler'
          );
          setTimeout(() => {
            void retryPendingServerDeks();
            void reconcileMissingServerDeks();
          }, 500);
        }
        // reconcilePlaintextAll 호출 제거 — sync down 과 race 로 무한 round-trip 발생.
      } catch (e) {
        const status = e instanceof ApiError ? e.status : 'network';
        void analytics.track('sync_failed', {
          reason_code: String(status),
          retry_count_bucket: 'unknown',
        });
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
