import { useEffect } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { PowerSyncContext } from '@powersync/react';
import { useAuthStore } from '../shared/stores/authStore';
import { AuthenticatedApp } from '../shared/features/auth/AuthenticatedApp';
import { db } from './sync/db';
import { StoryZipConnector } from './sync/connector';

const connector = new StoryZipConnector();

export function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isGuest = useAuthStore((s) => s.isGuest);
  const isRestoring = useAuthStore((s) => s.isRestoring);
  const syncDecision = useAuthStore((s) => s.syncDecision);
  const restore = useAuthStore((s) => s.restore);

  useEffect(() => {
    void restore();
  }, [restore]);

  // PowerSync connect 게이팅:
  //   - syncDecision이 결정되기 전(login 직후, null)에는 connect 금지 → 로컬 게스트 데이터가 의도치 않게 업로드되는 것을 막는다
  //   - 로그인 + 결정 완료 → connect (sync 양방향 활성)
  //   - 로그아웃/게스트 → disconnect
  useEffect(() => {
    if (isAuthenticated && syncDecision !== null) {
      void db.connect(connector);
    } else if (!isAuthenticated) {
      void db.disconnect();
    }
    // 로그인 직후 syncDecision === null 인 사이에는 의도적으로 아무것도 하지 않음
  }, [isAuthenticated, syncDecision]);

  // 앱 시작 시 세션 복원 중 (짧은 로딩)
  if (isRestoring) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        로딩 중...
      </div>
    );
  }

  // 게스트 또는 로그인 상태 모두 편집 화면 진입
  // 로그인 화면은 AuthenticatedApp 내부의 게스트 배너에서 선택적으로 제공
  if (isAuthenticated || isGuest) {
    return (
      <PowerSyncContext.Provider value={db}>
        <MemoryRouter>
          <AuthenticatedApp />
        </MemoryRouter>
      </PowerSyncContext.Provider>
    );
  }

  // restore 완료 후 isGuest도 false인 경우는 없어야 하지만 방어 처리
  return (
    <div className="flex min-h-screen items-center justify-center text-gray-500">
      초기화 중...
    </div>
  );
}
