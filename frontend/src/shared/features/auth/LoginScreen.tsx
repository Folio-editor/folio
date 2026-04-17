import { useAuthStore } from '../../stores/authStore';

export function LoginScreen() {
  const isLoggingIn = useAuthStore((s) => s.isLoggingIn);
  const error = useAuthStore((s) => s.error);
  const login = useAuthStore((s) => s.login);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50">
      <div className="w-full max-w-sm rounded-lg bg-background p-8 shadow">
        <h1 className="mb-2 text-center text-2xl font-bold">Folio</h1>
        <p className="mb-6 text-center text-sm text-muted-foreground">
          스토리 작가를 위한 원고 편집 서비스
        </p>

        <button
          type="button"
          onClick={() => void login()}
          disabled={isLoggingIn}
          className="w-full rounded-md bg-primary py-2 text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {isLoggingIn ? '로그인 중...' : 'Google로 로그인'}
        </button>

        {error && (
          <p className="mt-4 rounded bg-destructive/5 p-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
