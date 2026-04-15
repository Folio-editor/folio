import { useAuthStore } from '../../stores/authStore';

export function AuthenticatedApp() {
  const writer = useAuthStore((s) => s.writer);
  const isGuest = useAuthStore((s) => s.isGuest);
  const isLoggingIn = useAuthStore((s) => s.isLoggingIn);
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* 게스트 모드 배너 */}
      {isGuest && (
        <div className="flex items-center justify-between bg-amber-50 border-b border-amber-200 px-6 py-2 text-sm text-amber-800">
          <span>
            게스트 모드 — 로컬 편집만 가능합니다. 클라우드 저장·동기화를 사용하려면 로그인하세요.
          </span>
          <button
            type="button"
            onClick={() => void login()}
            disabled={isLoggingIn}
            className="ml-4 rounded-md bg-amber-600 px-3 py-1 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            {isLoggingIn ? '로그인 중…' : 'Google로 로그인'}
          </button>
        </div>
      )}

      <header className="flex items-center justify-between border-b bg-white px-6 py-3">
        <h1 className="text-lg font-bold">StoryZip</h1>
        <div className="flex items-center gap-3">
          {writer?.profileImageUrl && (
            <img
              src={writer.profileImageUrl}
              alt=""
              className="h-8 w-8 rounded-full"
            />
          )}
          {writer ? (
            <>
              <span className="text-sm text-gray-700">
                {writer.nickname ?? writer.email}
              </span>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
              >
                로그아웃
              </button>
            </>
          ) : (
            <span className="text-sm text-gray-400">게스트</span>
          )}
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="rounded-lg bg-white p-6 shadow">
          {isGuest ? (
            <>
              <h2 className="mb-2 text-xl font-semibold">환영합니다</h2>
              <p className="text-gray-600">
                로그인 없이 바로 편집을 시작할 수 있습니다.
                <br />
                로그인하면 작업이 클라우드에 저장되고 다른 기기에서도 이어쓸 수 있습니다.
              </p>
            </>
          ) : (
            <>
              <h2 className="mb-2 text-xl font-semibold">
                안녕하세요, {writer?.nickname ?? '작가'}님
              </h2>
              <p className="text-gray-600">
                로그인 성공. 여기에 워크스페이스 목록이 표시됩니다.
              </p>
              <pre className="mt-4 overflow-auto rounded bg-gray-100 p-3 text-xs">
                {JSON.stringify(writer, null, 2)}
              </pre>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
