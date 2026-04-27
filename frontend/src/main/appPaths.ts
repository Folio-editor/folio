import { app } from 'electron';
import path from 'node:path';

// dev 인스턴스를 프로덕션 설치본과 격리.
// 기본값: app.getName() = productName ("Folio") → 양쪽이 %APPDATA%\Folio\ 를 공유.
// dev에서만 이름/경로를 바꿔 %APPDATA%\Folio Dev\ 로 분리한다.
// 반드시 다른 모듈이 app.getPath('userData')를 호출하기 전에 실행되어야 하므로
// index.ts의 최상단에서 가장 먼저 import되어야 한다.
if (!app.isPackaged) {
  app.setName('Folio Dev');
  app.setPath('userData', path.join(app.getPath('appData'), 'Folio Dev'));
}
