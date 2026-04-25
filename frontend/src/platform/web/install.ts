// ============================================================
// Web FolioApi 설치 — window.folio 주입
// ============================================================
// createRoot 호출 이전에 한 번 실행되어야 한다.
// 모든 share 코드(apiClient, authStore, connector 등)가 window.folio.*를
// 동기적으로 참조하기 때문에 React 트리 마운트 전에 세팅이 끝나야 한다.
// ============================================================

import { createWebFolioApi } from './folioApi';

export function installWebFolioApi() {
  if (typeof window === 'undefined') return;
  if ((window as { folio?: unknown }).folio) {
    // Hot reload 등으로 이미 설치돼 있으면 덮어쓰지 않음
    return;
  }
  (window as unknown as { folio: ReturnType<typeof createWebFolioApi> }).folio =
    createWebFolioApi();
}
