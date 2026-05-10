// MUST be the first import — userData 경로를 다른 모듈이 캐시하기 전에 변경해야 함
import './appPaths';
import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
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
import {
  saveMaterial as saveEncryptionMaterial,
  loadMaterial as loadEncryptionMaterial,
  clearMaterial as clearEncryptionMaterial,
  type PersistedMaterial,
} from './auth/encryptionMaterialStore';
import { registerUpdaterHandlers } from './updater';
import { registerExportHandlers } from './export';

const createWindow = () => {
  Menu.setApplicationMenu(null);

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 480,
    minHeight: 320,
    icon: path.join(__dirname, '../../resources/folio.png'),
    // 타이틀바: 완전 커스텀.
    // - Windows: frame: false 로 OS 프레임 제거 → React TitleBar 컴포넌트가 컨트롤·드래그 영역 직접 그림
    // - macOS: titleBarStyle: 'hiddenInset' 으로 OS traffic light는 유지(좌측 상단), 우측은 React가 그림
    frame: process.platform !== 'darwin' ? false : undefined,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
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

  bindMaximizeEvents(mainWindow);

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
};

// Spellchecker dictionary 동기화 — 렌더러 신호로 유저 사전 단어 set을 OS spellchecker에 반영
const syncedSpellcheckWords = new Set<string>();
const LOGIN_RETURN_DELAY_MS = 1000;

function normalizeSpellcheckWords(words: unknown): string[] {
  if (!Array.isArray(words)) return [];
  const out: string[] = [];
  for (const w of words) {
    if (typeof w !== 'string') continue;
    const trimmed = w.trim();
    if (trimmed) out.push(trimmed);
  }
  return out;
}

function bringWindowToFront(win: BrowserWindow | null) {
  if (!win || win.isDestroyed()) return;

  if (win.isMinimized()) {
    win.restore();
  }
  if (!win.isVisible()) {
    win.show();
  }

  win.show();
  win.focus();
}

function bringWindowToFrontAfter(win: BrowserWindow | null, delayMs: number) {
  setTimeout(() => bringWindowToFront(win), delayMs);
}

function minimizeWindowForOAuth(win: BrowserWindow | null) {
  if (!win || win.isDestroyed() || win.isMinimized()) return;
  win.minimize();
}

function registerAuthHandlers() {
  ipcMain.handle('auth:login', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    minimizeWindowForOAuth(win);
    const result = await loginWithGoogle({
      onCodeReceived: () => bringWindowToFrontAfter(win, LOGIN_RETURN_DELAY_MS),
    });
    bringWindowToFrontAfter(win, LOGIN_RETURN_DELAY_MS);
    return result;
  });
  ipcMain.handle('auth:logout', async () => logout());
  ipcMain.handle('auth:tryRestore', async () => tryRestoreLogin());
  ipcMain.handle('auth:getAccessToken', () => getAccessToken());
  ipcMain.handle('auth:getGuestId', () => getOrCreateGuestId());
  ipcMain.handle('auth:getLastKnownWriterId', () => getLastKnownWriterId());
  ipcMain.handle('auth:commitLastKnownWriterId', (_e, writerId: string) =>
    commitLastKnownWriterId(writerId),
  );
}

function registerCryptoHandlers() {
  ipcMain.handle('crypto:saveMaterial', (_e, material: PersistedMaterial) => {
    saveEncryptionMaterial(material);
  });
  ipcMain.handle('crypto:loadMaterial', () => loadEncryptionMaterial());
  ipcMain.handle('crypto:clearMaterial', () => {
    clearEncryptionMaterial();
  });
}

function registerWindowHandlers() {
  // 커스텀 TitleBar에서 사용하는 OS 창 제어 IPC.
  ipcMain.handle('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize();
  });
  ipcMain.handle('window:toggleMaximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.handle('window:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
  });
  ipcMain.handle('window:isMaximized', (e) => {
    return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false;
  });
  // 외부 링크 — http/https 만 허용. file:// / javascript: 차단해 RCE/스푸핑 위험 제거.
  ipcMain.handle('window:openExternal', async (_e, raw: unknown) => {
    if (typeof raw !== 'string') return;
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    await shell.openExternal(url.toString());
  });
}

function registerSpellcheckHandlers() {
  ipcMain.handle('spellcheck:syncWords', async (event, words: unknown) => {
    const session = event.sender.session as Electron.Session & {
      removeWordFromSpellCheckerDictionary?: (word: string) => boolean;
    };
    const nextWords = new Set(normalizeSpellcheckWords(words));

    if (typeof session.removeWordFromSpellCheckerDictionary === 'function') {
      for (const word of syncedSpellcheckWords) {
        if (!nextWords.has(word)) {
          session.removeWordFromSpellCheckerDictionary(word);
        }
      }
    }

    for (const word of nextWords) {
      if (!syncedSpellcheckWords.has(word)) {
        session.addWordToSpellCheckerDictionary(word);
      }
    }

    syncedSpellcheckWords.clear();
    for (const word of nextWords) {
      syncedSpellcheckWords.add(word);
    }
  });
}

/** 새 창 생성 시 maximize/unmaximize 이벤트를 렌더러로 push — TitleBar의 Max/Restore 아이콘 토글용. */
function bindMaximizeEvents(win: BrowserWindow) {
  const send = (state: boolean) => win.webContents.send('window:maximizeChanged', state);
  win.on('maximize', () => send(true));
  win.on('unmaximize', () => send(false));
}

app.on('ready', () => {
  registerAuthHandlers();
  registerWindowHandlers();
  registerSpellcheckHandlers();
  registerCryptoHandlers();
  registerUpdaterHandlers();
  registerExportHandlers();
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
