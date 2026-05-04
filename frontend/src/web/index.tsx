import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installWebFolioApi } from '../platform/web/install';
import { App } from './App';
import { CheckoutResolver } from './checkout/CheckoutResolver';
import '../styles/global.css';

// React 트리 마운트 전에 window.folio를 세팅 — apiClient/authStore/connector 모두 동기 참조.
installWebFolioApi();

// /checkout/success | /checkout/fail 경로는 결제 결과 처리 전용 페이지로 분기한다.
// 메인 App(PowerSync, Auth 복원, 에디터 부트스트랩 등) 트리를 우회 — confirm 호출 1회 +
// returnTo로 즉시 redirect만 수행. base path(/editor)가 prefix로 붙을 수 있어 endsWith 매칭.
const path = window.location.pathname;
const checkoutVariant: 'success' | 'fail' | null =
  /\/checkout\/success\/?$/.test(path)
    ? 'success'
    : /\/checkout\/fail\/?$/.test(path)
      ? 'fail'
      : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {checkoutVariant ? <CheckoutResolver variant={checkoutVariant} /> : <App />}
  </StrictMode>,
);
