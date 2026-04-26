// MUST be the first import — userData 경로를 다른 모듈이 캐시하기 전에 변경해야 함
import './appPaths';
import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import path from 'node:path';
import {
  loginWithGoogle,
  logout,
  tryRestoreLogin,
  getAccessToken,
  tokenRefreshScheduler,
  getLastKnownWriterId,
  commitLastKnownWriterId,
} from './auth/googleOAuth';
import { getOrCreateGuestId } from './auth/guestId';

const createWindow = () => {
  Menu.setApplicationMenu(null);

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 480,
    minHeight: 320,
    icon: path.join(__dirname, '../../resources/folio.png'),
    // 타이틀바: OS 기본 프레임 사용. 한때 titleBarStyle: 'hidden' + titleBarOverlay 로
    // 테마와 동기화 시도했으나, electron-vite 마이그레이션 환경에서 overlay가 제대로 그려지지
    // 않아 헤더가 시각적으로 사라지는 회귀가 발생. 빌드 파이프라인 안정화 후 재시도 예정.
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // electron-vite: dev에선 ELECTRON_RENDERER_URL이 주입되고,
  // prod에선 out/renderer/index.html이 main 기준 ../renderer/ 에 위치한다.
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // dev에서만 타이틀바를 "Folio (dev)"로 고정. HTML <title>이 자동으로 덮어쓰는 것을 막아
  // 프로덕션 인스턴스와 시각적으로 구분되도록 한다.
  if (!app.isPackaged) {
    mainWindow.on('page-title-updated', (e) => e.preventDefault());
    mainWindow.setTitle('Folio (dev)');
  }

  // 메뉴 제거 시 사라지는 기본 단축키들을 직접 등록
  // - F12 / Ctrl+Shift+I  → DevTools 토글
  // - F5  / Ctrl+R        → 일반 새로고침 (캐시 사용)
  // - Ctrl+Shift+R        → 강력 새로고침 (캐시 무시)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const wc = mainWindow.webContents;

    const toggleDevTools =
      input.key === 'F12' ||
      (input.control && input.shift && input.key === 'I');
    if (toggleDevTools) {
      wc.toggleDevTools();
      event.preventDefault();
      return;
    }

    const hardReload =
      input.control && input.shift && (input.key === 'R' || input.key === 'r');
    if (hardReload) {
      wc.reloadIgnoringCache();
      event.preventDefault();
      return;
    }

    const reload =
      input.key === 'F5' ||
      (input.control && !input.shift && (input.key === 'R' || input.key === 'r'));
    if (reload) {
      wc.reload();
      event.preventDefault();
      return;
    }
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
};

function registerAuthHandlers() {
  ipcMain.handle('auth:login', async () => loginWithGoogle());
  ipcMain.handle('auth:logout', async () => logout());
  ipcMain.handle('auth:tryRestore', async () => tryRestoreLogin());
  ipcMain.handle('auth:getAccessToken', () => getAccessToken());
  ipcMain.handle('auth:getGuestId', () => getOrCreateGuestId());
  ipcMain.handle('auth:getLastKnownWriterId', () => getLastKnownWriterId());
  ipcMain.handle('auth:commitLastKnownWriterId', (_e, writerId: string) =>
    commitLastKnownWriterId(writerId),
  );
}

function registerWindowHandlers() {
  // 렌더러가 테마 변경 후 ActivityBar 색을 hex로 전달하면 OS 타이틀바 오버레이에 적용.
  // Windows 외 플랫폼은 setTitleBarOverlay 미지원 — silent no-op.
  ipcMain.handle(
    'window:setTitleBarColor',
    (e, color: string, symbolColor: string) => {
      if (process.platform !== 'win32') return;
      const win = BrowserWindow.fromWebContents(e.sender);
      if (!win) return;
      try {
        win.setTitleBarOverlay({ color, symbolColor });
      } catch {
        // setTitleBarOverlay는 titleBarStyle: 'hidden' + titleBarOverlay 옵션이 있을 때만 동작.
        // 옵션 없이 호출되면 throw — 로그 노이즈 방지로 무시.
      }
    },
  );
}

app.on('ready', () => {
  registerAuthHandlers();
  registerWindowHandlers();
  // Scheduler가 RT 거부/재시도 초과를 감지하면 모든 창에 세션 만료를 통지한다.
  tokenRefreshScheduler.on('session-expired', () => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('auth:session-expired');
    }
  });
  createWindow();
});

app.on('before-quit', () => {
  tokenRefreshScheduler.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
