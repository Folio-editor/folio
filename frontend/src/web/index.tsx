import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installWebFolioApi } from '../platform/web/install';
import { App } from './App';
import '../styles/global.css';

// React 트리 마운트 전에 window.folio를 세팅 — apiClient/authStore/connector 모두 동기 참조.
installWebFolioApi();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
