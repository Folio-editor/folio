import { AppRoot } from '../shared/app/AppRoot';

/**
 * 웹 브라우저 진입점.
 * 공통 로직은 모두 {@link AppRoot}에 있고, 여기서는 BrowserRouter를 선택한다.
 *
 * 운영 배포는 별도 서브도메인(app.folio.com)을 사용하므로 basename은 비워둔다.
 * 만약 path 기반(folio.com/editor) 배포로 전환할 경우 basename="/editor" 추가.
 */
export function App() {
  return <AppRoot router="browser" />;
}
