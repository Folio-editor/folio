import { AppRoot } from '../shared/app/AppRoot';

/**
 * Electron 렌더러 진입점.
 * 공통 로직은 모두 {@link AppRoot}에 있고, 여기서는 라우터 종류만 지정.
 */
export function App() {
  return <AppRoot router="memory" />;
}
