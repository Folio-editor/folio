import { contextBridge, ipcRenderer } from 'electron';
import type {
  LoginResult,
  LoginOutcome,
  FolioApi,
  FolioCryptoMaterial,
  UpdaterState,
} from '../shared/types/auth';
import type {
  ExportProgress,
  ExportRequest,
  ExportResult,
} from '../shared/types/export';

const api: FolioApi = {
  platform: 'electron',
  auth: {
    loginWithGoogle: () => ipcRenderer.invoke('auth:login') as Promise<LoginOutcome>,
    restoreAfterWithdrawal: () =>
      ipcRenderer.invoke('auth:restoreAfterWithdrawal') as Promise<LoginResult>,
    logout: () => ipcRenderer.invoke('auth:logout') as Promise<void>,
    tryRestore: () =>
      ipcRenderer.invoke('auth:tryRestore') as Promise<LoginResult | null>,
    getAccessToken: () =>
      ipcRenderer.invoke('auth:getAccessToken') as Promise<string | null>,
    getGuestId: () =>
      ipcRenderer.invoke('auth:getGuestId') as Promise<string>,
    rotateGuestId: () =>
      ipcRenderer.invoke('auth:rotateGuestId') as Promise<string>,
    getLastKnownWriterId: () =>
      ipcRenderer.invoke('auth:getLastKnownWriterId') as Promise<string | null>,
    commitLastKnownWriterId: (writerId: string) =>
      ipcRenderer.invoke('auth:commitLastKnownWriterId', writerId) as Promise<void>,
    clearLastKnownWriterId: () =>
      ipcRenderer.invoke('auth:clearLastKnownWriterId') as Promise<void>,
    onSessionExpired: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('auth:session-expired', listener);
      return () => ipcRenderer.removeListener('auth:session-expired', listener);
    },
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize') as Promise<void>,
    toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize') as Promise<void>,
    close: () => ipcRenderer.invoke('window:close') as Promise<void>,
    isMaximized: () => ipcRenderer.invoke('window:isMaximized') as Promise<boolean>,
    onMaximizeChanged: (callback: (maximized: boolean) => void) => {
      const listener = (_e: unknown, state: boolean) => callback(state);
      ipcRenderer.on('window:maximizeChanged', listener);
      return () => ipcRenderer.removeListener('window:maximizeChanged', listener);
    },
    platform: process.platform as 'win32' | 'darwin' | 'linux' | 'web',
    openExternal: (url: string) =>
      ipcRenderer.invoke('window:openExternal', url) as Promise<void>,
  },
  spellcheck: {
    syncWords: (words: string[]) =>
      ipcRenderer.invoke('spellcheck:syncWords', words) as Promise<void>,
  },
  crypto: {
    saveMaterial: (material: FolioCryptoMaterial) =>
      ipcRenderer.invoke('crypto:saveMaterial', material) as Promise<void>,
    loadMaterial: () =>
      ipcRenderer.invoke('crypto:loadMaterial') as Promise<FolioCryptoMaterial | null>,
    clearMaterial: () => ipcRenderer.invoke('crypto:clearMaterial') as Promise<void>,
  },
  updater: {
    getCurrentVersion: () =>
      ipcRenderer.invoke('updater:getCurrentVersion') as Promise<string>,
    check: () => ipcRenderer.invoke('updater:check') as Promise<UpdaterState>,
    download: () => ipcRenderer.invoke('updater:download') as Promise<UpdaterState>,
    installAndRestart: () =>
      ipcRenderer.invoke('updater:installAndRestart') as Promise<void>,
    onStateChange: (callback: (state: UpdaterState) => void) => {
      const listener = (_e: unknown, state: UpdaterState) => callback(state);
      ipcRenderer.on('updater:state', listener);
      return () => ipcRenderer.removeListener('updater:state', listener);
    },
  },
  export: {
    run: (req: ExportRequest) =>
      ipcRenderer.invoke('export:run', req) as Promise<ExportResult>,
    onProgress: (callback: (p: ExportProgress) => void) => {
      const listener = (_e: unknown, p: ExportProgress) => callback(p);
      ipcRenderer.on('export:progress', listener);
      return () => ipcRenderer.removeListener('export:progress', listener);
    },
    openInFolder: (filePath: string) =>
      ipcRenderer.invoke('export:openInFolder', filePath) as Promise<void>,
  },
};

contextBridge.exposeInMainWorld('folio', api);
