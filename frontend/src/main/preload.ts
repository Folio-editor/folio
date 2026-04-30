import { contextBridge, ipcRenderer } from 'electron';
import type {
  LoginResult,
  FolioApi,
  FolioOneTimePaymentParams,
  FolioOneTimePaymentResult,
  FolioBillingAuthParams,
  FolioBillingAuthResult,
  FolioCryptoMaterial,
  UpdaterState,
} from '../shared/types/auth';

const api: FolioApi = {
  platform: 'electron',
  auth: {
    loginWithGoogle: () => ipcRenderer.invoke('auth:login') as Promise<LoginResult>,
    logout: () => ipcRenderer.invoke('auth:logout') as Promise<void>,
    tryRestore: () =>
      ipcRenderer.invoke('auth:tryRestore') as Promise<LoginResult | null>,
    getAccessToken: () =>
      ipcRenderer.invoke('auth:getAccessToken') as Promise<string | null>,
    getGuestId: () =>
      ipcRenderer.invoke('auth:getGuestId') as Promise<string>,
    getLastKnownWriterId: () =>
      ipcRenderer.invoke('auth:getLastKnownWriterId') as Promise<string | null>,
    commitLastKnownWriterId: (writerId: string) =>
      ipcRenderer.invoke('auth:commitLastKnownWriterId', writerId) as Promise<void>,
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
  },
  payment: {
    openOneTime: (params: FolioOneTimePaymentParams) =>
      ipcRenderer.invoke('payment:openOneTime', params) as Promise<FolioOneTimePaymentResult>,
    openBillingAuth: (params: FolioBillingAuthParams) =>
      ipcRenderer.invoke('payment:openBillingAuth', params) as Promise<FolioBillingAuthResult>,
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
};

contextBridge.exposeInMainWorld('folio', api);
