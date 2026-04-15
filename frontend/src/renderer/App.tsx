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
  const restore = useAuthStore((s) => s.restore);

  useEffect(() => {
    void restore();
  }, [restore]);

  // 로그인 성공 시 PowerSync sync 연결, 로그아웃(게스트 복귀) 시 해제
  useEffect(() => {
    if (isAuthenticated) {
      void db.connect(connector);
    } else {
      void db.disconnect();
    }
  }, [isAuthenticated]);

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
