// ============================================================
// AppRoot — Electron 렌더러 + 웹 공통 진입 컴포넌트
// ============================================================
// 라우터 종류만 prop으로 받아 둘 모두에서 동일한 트리를 렌더한다.
//   - Electron(MemoryRouter): URL 노출 없이 메모리 기반 navigation
//   - Web(BrowserRouter): 브라우저 주소 기반 + basename 지원
//
// PowerSync connect 게이팅, 세션 복원, 온라인 복귀 reconnect 등 모든 공통 로직 보유.
// ============================================================

import { useEffect } from 'react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { PowerSyncContext } from '@powersync/react';
import { Toaster } from 'sonner';
import { useAuthStore } from '../stores/authStore';
import { AuthenticatedApp } from '../features/auth/AuthenticatedApp';
import { ThemeProvider } from '../components/ThemeProvider';
import { db } from '../sync/db';
import { FolioConnector } from '../sync/connector';
import { initNetworkListener, useNetworkStatus } from '../hooks/useNetworkStatus';

// 모듈 로드 시 1회 — online/offline 이벤트 바인딩
initNetworkListener();

const connector = new FolioConnector();

interface AppRootProps {
  /** 'memory' = Electron(URL 노출 없음), 'browser' = 웹(주소 표시줄 사용) */
  router: 'memory' | 'browser';
  /** BrowserRouter용 base path (예: '/editor'). memory 모드에서는 무시. */
  basename?: string;
}

export function AppRoot({ router, basename }: AppRootProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isGuest = useAuthStore((s) => s.isGuest);
  const isRestoring = useAuthStore((s) => s.isRestoring);
  const syncDecision = useAuthStore((s) => s.syncDecision);
  const restore = useAuthStore((s) => s.restore);
  const subscribeSessionEvents = useAuthStore((s) => s.subscribeSessionEvents);

  useEffect(() => {
    void restore();
  }, [restore]);

  // Main 프로세스(Electron) 또는 web FolioApi(브라우저)의 세션 만료 알림 수신
  useEffect(() => {
    const unsubscribe = subscribeSessionEvents();
    return unsubscribe;
  }, [subscribeSessionEvents]);

  // PowerSync connect 게이팅:
  //   - syncDecision이 결정되기 전(login 직후, null)에는 connect 금지 → 로컬 게스트 데이터가 의도치 않게 업로드되는 것을 막는다
  //   - 로그인 + 결정 완료 → connect (sync 양방향 활성)
  //   - 로그아웃/게스트 → disconnect
  useEffect(() => {
    if (isAuthenticated && syncDecision !== null) {
      // use-server는 disconnectAndClear 직후라 SDK 내부 정리가 끝나야 connect 가능.
      // await로 순차 실행하여 race 방지. 실패 시 다음 렌더에서 재시도.
      (async () => {
        try {
          await db.connect(connector);
        } catch (e) {
          console.warn('[AppRoot] db.connect 실패 — 다음 렌더에서 재시도:', e);
        }
      })();
    } else if (!isAuthenticated) {
      void db.disconnect();
    }
  }, [isAuthenticated, syncDecision]);

  // 온라인 복귀 시 PowerSync 즉시 재연결 트리거
  const isOnline = useNetworkStatus();
  useEffect(() => {
    if (isOnline && isAuthenticated && syncDecision !== null) {
      db.connect(connector).catch((e) =>
        console.warn('[AppRoot] 온라인 복귀 reconnect 실패:', e),
      );
    }
    // isOnline 변경 시에만 트리거 (isAuthenticated/syncDecision은 위 effect가 담당)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // 앱 시작 시 세션 복원 중 (짧은 로딩)
  if (isRestoring) {
    return (
      <ThemeProvider>
        <div className="flex min-h-screen items-center justify-center text-muted-foreground">
          로딩 중...
        </div>
      </ThemeProvider>
    );
  }

  // 게스트 또는 로그인 상태 모두 편집 화면 진입
  // 로그인 화면은 AuthenticatedApp 내부의 게스트 배너에서 선택적으로 제공
  if (isAuthenticated || isGuest) {
    const Router = router === 'browser' ? BrowserRouter : MemoryRouter;
    const routerProps = router === 'browser' && basename ? { basename } : {};
    return (
      <ThemeProvider>
        <PowerSyncContext.Provider value={db}>
          <Router {...routerProps}>
            <AuthenticatedApp />
          </Router>
        </PowerSyncContext.Provider>
        <Toaster position="bottom-right" richColors closeButton />
      </ThemeProvider>
    );
  }

  // restore 완료 후 isGuest=false, isAuthenticated=false → 웹 비인증 상태(또는 Electron 방어 분기).
  // 웹: 랜딩 페이지로 redirect (?login=1). sessionStorage flag로 1회 한정 (무한 루프 방지).
  // Electron: 기존 WebLoginScreen 폴백 유지.
  return (
    <ThemeProvider>
      <UnauthenticatedFallback />
    </ThemeProvider>
  );
}

function UnauthenticatedFallback() {
  const login = useAuthStore((s) => s.login);
  const isWeb =
    typeof window !== 'undefined' && window.folio?.platform === 'web';

  // web: 랜딩으로 redirect (1회 한정). sessionStorage flag로 무한 루프 방지.
  useEffect(() => {
    if (!isWeb) return;
    let alreadyRedirected = false;
    try {
      alreadyRedirected = sessionStorage.getItem('folio:web:noredirect') === '1';
    } catch {
      /* ignore */
    }
    if (alreadyRedirected) return;
    try {
      sessionStorage.setItem('folio:web:noredirect', '1');
    } catch {
      /* ignore */
    }
    const landing =
      ((import.meta.env.VITE_LANDING_URL as string | undefined) ?? '').replace(/\/$/, '') ||
      window.location.origin;
    window.location.replace(`${landing}/?login=1`);
  }, [isWeb]);

  // web에서 redirect 직전 또는 1회 차단 후 fallback / Electron 미인증 폴백
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="mb-2 text-3xl font-semibold">Folio</h1>
        <p className="text-sm text-muted-foreground">
          Google 계정으로 로그인하면 모든 작업이 클라우드에 동기화됩니다.
        </p>
      </div>
      <button
        type="button"
        onClick={() => void login()}
        className="rounded-lg border border-border bg-card px-6 py-3 text-sm font-medium shadow-sm transition hover:bg-accent"
      >
        Google로 로그인
      </button>
    </div>
  );
}
