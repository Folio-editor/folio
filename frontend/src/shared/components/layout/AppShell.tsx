import type { ReactNode } from 'react';
import { useAuthStore } from '../../stores/authStore';

interface AppShellProps {
  sidebar: ReactNode;
  children: ReactNode;
  rightPanels: ReactNode;
}

/**
 * 3패널 IDE 스타일 앱 셸.
 * - 게스트 배너 (isGuest 시 상단 표시)
 * - 헤더 (타이틀 + 프로필/로그아웃)
 * - 좌측 사이드바 | 중앙 에디터 | 우측 패널
 */
export function AppShell({ sidebar, children, rightPanels }: AppShellProps) {
  const writer = useAuthStore((s) => s.writer);
  const isGuest = useAuthStore((s) => s.isGuest);
  const isLoggingIn = useAuthStore((s) => s.isLoggingIn);
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      {/* 게스트 배너 */}
      {isGuest && (
        <div className="flex shrink-0 items-center justify-between border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-800">
          <span>게스트 모드 — 로컬 편집만 가능합니다. 클라우드 저장·동기화를 사용하려면 로그인하세요.</span>
          <button
            type="button"
            onClick={() => void login()}
            disabled={isLoggingIn}
            className="ml-4 rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {isLoggingIn ? '로그인 중…' : 'Google로 로그인'}
          </button>
        </div>
      )}

      {/* 헤더 */}
      <header className="flex shrink-0 items-center justify-between border-b bg-white px-4 py-2">
        <span className="text-base font-bold tracking-tight text-gray-900">StoryZip</span>
        <div className="flex items-center gap-3">
          {writer?.profileImageUrl && (
            <img src={writer.profileImageUrl} alt="" className="h-7 w-7 rounded-full" />
          )}
          {writer ? (
            <>
              <span className="text-sm text-gray-700">{writer.nickname ?? writer.email}</span>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
              >
                로그아웃
              </button>
            </>
          ) : (
            <span className="text-sm text-gray-400">게스트</span>
          )}
        </div>
      </header>

      {/* 3패널 본문 */}
      <div className="flex min-h-0 flex-1">
        {/* 좌측 사이드바 */}
        <aside className="flex w-60 shrink-0 flex-col border-r bg-white">
          {sidebar}
        </aside>

        {/* 중앙 에디터 */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
          {children}
        </main>

        {/* 우측 패널 */}
        {rightPanels}
      </div>
    </div>
  );
}
