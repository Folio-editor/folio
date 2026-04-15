import { useAuthStore } from '../../stores/authStore';

export function AuthenticatedApp() {
  const writer = useAuthStore((s) => s.writer);
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
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
          <span className="text-sm text-gray-700">
            {writer?.nickname ?? writer?.email}
          </span>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
          >
            로그아웃
          </button>
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-2 text-xl font-semibold">
            안녕하세요, {writer?.nickname ?? '작가'}님
          </h2>
          <p className="text-gray-600">
            로그인 성공. 여기에 워크스페이스 목록이 표시됩니다.
          </p>
          <pre className="mt-4 overflow-auto rounded bg-gray-100 p-3 text-xs">
            {JSON.stringify(writer, null, 2)}
          </pre>
        </div>
      </main>
    </div>
  );
}
