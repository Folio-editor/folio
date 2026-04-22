import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
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

if (started) {
  app.quit();
}

const syncedSpellcheckWords = new Set<string>();

function normalizeSpellcheckWords(words: unknown): string[] {
  if (!Array.isArray(words)) return [];

  const unique = new Set<string>();
  for (const rawWord of words) {
    if (typeof rawWord !== 'string') continue;

    const word = rawWord.trim();
    if (!word) continue;
    if (word.length > 64) continue;
    unique.add(word);
  }

  return Array.from(unique);
}

const createWindow = () => {
  Menu.setApplicationMenu(null);

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, '../../resources/folio.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // 메뉴 제거 시 DevTools 단축키(F12, Ctrl+Shift+I)가 사라지므로 직접 등록
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown') return;
    const toggle =
      input.key === 'F12' ||
      (input.control && input.shift && input.key === 'I');
    if (toggle) mainWindow.webContents.toggleDevTools();
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

app.on('ready', () => {
  registerSpellcheckHandlers();
});

app.on('ready', () => {
  registerAuthHandlers();
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
