import { useEffect } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore } from '../shared/stores/authStore';
import { LoginScreen } from '../shared/features/auth/LoginScreen';
import { AuthenticatedApp } from '../shared/features/auth/AuthenticatedApp';

export function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isRestoring = useAuthStore((s) => s.isRestoring);
  const restore = useAuthStore((s) => s.restore);

  useEffect(() => {
    void restore();
  }, [restore]);

  if (isRestoring) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        로딩 중...
      </div>
    );
  }

  return (
    <MemoryRouter>{isAuthenticated ? <AuthenticatedApp /> : <LoginScreen />}</MemoryRouter>
  );
}
