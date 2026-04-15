// ============================================================
// PowerSync Sync Connector — Electron 렌더러용
// ============================================================
// - fetchCredentials: 기존 auth IPC(getAccessToken)로 JWT 제공
// - uploadData: stub (쓰기는 apiClient HTTP 경유, 로컬 직접 쓰기 없음)
// ============================================================

import type {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
} from '@powersync/web';

const POWERSYNC_URL =
  import.meta.env.VITE_POWERSYNC_URL ?? 'http://localhost:8090';

export class StoryZipConnector implements PowerSyncBackendConnector {
  /**
   * PowerSync 서비스에 연결할 JWT와 엔드포인트를 반환한다.
   * Spring Boot가 발급한 access token(HS256)을 그대로 전달 — 새 IPC 채널 불필요.
   * 토큰이 없으면 tryRestore()로 갱신을 시도한다.
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
   * 로컬 SQLite CRUD 큐를 서버에 업로드한다.
   * 현재는 모든 쓰기가 apiClient(HTTP)를 거치므로 큐가 항상 비어 있다.
   * 향후 오프라인 쓰기 지원 시 여기서 apiClient 호출을 구현한다.
   */
  async uploadData(_database: AbstractPowerSyncDatabase): Promise<void> {
    // no-op
  }
}
