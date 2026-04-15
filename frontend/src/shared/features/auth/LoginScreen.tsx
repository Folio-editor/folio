import { useAuthStore } from '../../stores/authStore';

export function LoginScreen() {
  const isLoggingIn = useAuthStore((s) => s.isLoggingIn);
  const error = useAuthStore((s) => s.error);
  const login = useAuthStore((s) => s.login);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow">
        <h1 className="mb-2 text-center text-2xl font-bold">StoryZip</h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          스토리 작가를 위한 원고 편집 서비스
        </p>

        <button
          type="button"
          onClick={() => void login()}
          disabled={isLoggingIn}
          className="w-full rounded-md bg-blue-600 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoggingIn ? '로그인 중...' : 'Google로 로그인'}
        </button>

        {error && (
          <p className="mt-4 rounded bg-red-50 p-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
