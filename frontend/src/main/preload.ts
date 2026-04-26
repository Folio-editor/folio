import { contextBridge, ipcRenderer } from 'electron';
import type { LoginResult, FolioApi } from '../shared/types/auth';

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
    setTitleBarColor: (color: string, symbolColor: string) =>
      ipcRenderer.invoke('window:setTitleBarColor', color, symbolColor) as Promise<void>,
  },
};

contextBridge.exposeInMainWorld('folio', api);
