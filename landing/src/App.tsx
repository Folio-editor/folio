import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { Terms } from './pages/Terms';
import { Privacy } from './pages/Privacy';
import { Refund } from './pages/Refund';
import { Guide } from './pages/Guide';
import { exchangeAuthCodeIfPresent } from './lib/auth';
import { AuthFailureToast } from './components/landing/AuthFailureToast';

/**
 * URL 에 {@code ?auth_code} 가 박혀 있는 OAuth callback 직후만 교환 완료를
 * 기다린 뒤 마운트한다. 일반 진입(auth_code 없음)에서는 첫 렌더를 지연시키지 않음.
 *
 * <p>callback 직후만 기다리는 이유: TopNav 의 {@link useLandingAuth} 가 첫 렌더에서
 * 이미 채워진 localStorage 를 읽도록 — "로그인 풀린 채로 보였다가 인증됨" 깜빡임 제거.
 */
function useAuthCodeBootstrap(): boolean {
  const hasAuthCode =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('auth_code');
  const [ready, setReady] = useState(!hasAuthCode);
  useEffect(() => {
    if (!hasAuthCode) return;
    let cancelled = false;
    void exchangeAuthCodeIfPresent().finally(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [hasAuthCode]);
  return ready;
}

export function App() {
  const ready = useAuthCodeBootstrap();
  if (!ready) return null;

  return (
    <BrowserRouter>
      <AuthFailureToast />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/refund" element={<Refund />} />
        <Route path="/guide" element={<Guide />} />
      </Routes>
    </BrowserRouter>
  );
}
