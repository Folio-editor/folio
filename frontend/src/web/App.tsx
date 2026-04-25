import { AppRoot } from '../shared/app/AppRoot';

/**
 * 웹 브라우저 진입점.
 * 공통 로직은 모두 {@link AppRoot}에 있고, 여기서는 BrowserRouter를 선택한다.
 *
 * basename: vite.web.config.ts의 base 설정으로부터 자동 주입.
 *   dev:  '/' (vite dev server root)
 *   prod: '/editor' (nginx path 라우팅 — nginx.conf:94의 location /editor)
 */
export function App() {
  // import.meta.env.BASE_URL은 vite의 base 설정값. trailing slash 제거.
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';
  return <AppRoot router="browser" basename={basename} />;
}
