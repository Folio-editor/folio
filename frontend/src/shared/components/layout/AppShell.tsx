import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

interface AppShellProps {
  activityBar: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
  rightPanels: ReactNode;
}

/**
 * VSCode 스타일 4슬롯 앱 셸.
 * - 상단 헤더 없음 (프로필/로그아웃은 SecondarySidebar 프로필 풋터가 담당)
 * - 게스트 모드 공지: 메인 영역 상단에 얇게 겹쳐진 오버레이 + 우측 X 닫기
 * - 액티비티 바(narrow) | 보조 사이드바(list) | 중앙 에디터 | 우측 패널
 */
export function AppShell({ activityBar, sidebar, children, rightPanels }: AppShellProps) {
  const isGuest = useAuthStore((s) => s.isGuest);
  const isLoggingIn = useAuthStore((s) => s.isLoggingIn);
  const login = useAuthStore((s) => s.login);

  const [bannerDismissed, setBannerDismissed] = useState(false);

  // 게스트 → 로그인 → 게스트 복귀 시 배너 다시 표시
  useEffect(() => {
    if (!isGuest) setBannerDismissed(false);
  }, [isGuest]);

  const showBanner = isGuest && !bannerDismissed;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 flex-1">
        {activityBar}
        {sidebar}

        {/* 중앙 에디터 */}
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-background">
          {/* 게스트 오버레이 공지 */}
          {showBanner && (
            <div
              role="status"
              className="pointer-events-auto absolute inset-x-3 top-3 z-10 flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50/95 px-3 py-1.5 text-xs text-amber-800 shadow-sm backdrop-blur dark:border-amber-800 dark:bg-amber-950/90 dark:text-amber-200"
            >
              <span className="flex-1 truncate">
                게스트 모드 — 로컬 편집만 가능합니다. 클라우드 저장·동기화를 사용하려면 로그인하세요.
              </span>
              <button
                type="button"
                onClick={() => void login()}
                disabled={isLoggingIn}
                className="shrink-0 rounded bg-amber-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-500 dark:hover:bg-amber-400"
              >
                {isLoggingIn ? '로그인 중…' : 'Google로 로그인'}
              </button>
              <button
                type="button"
                onClick={() => setBannerDismissed(true)}
                aria-label="알림 닫기"
                className="shrink-0 rounded p-0.5 text-amber-700 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-300 dark:hover:bg-amber-800 dark:hover:text-amber-100"
              >
                <X size={14} strokeWidth={2} />
              </button>
            </div>
          )}

          {children}
        </main>

        {/* 우측 패널 */}
        {rightPanels}
      </div>
    </div>
  );
}
