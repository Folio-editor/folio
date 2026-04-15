import { contextBridge, ipcRenderer } from 'electron';
import type { LoginResult, StoryZipApi } from '../shared/types/auth';

const api: StoryZipApi = {
  platform: 'electron',
  auth: {
    loginWithGoogle: () => ipcRenderer.invoke('auth:login') as Promise<LoginResult>,
    logout: () => ipcRenderer.invoke('auth:logout') as Promise<void>,
    tryRestore: () =>
      ipcRenderer.invoke('auth:tryRestore') as Promise<LoginResult | null>,
    getAccessToken: () =>
      ipcRenderer.invoke('auth:getAccessToken') as Promise<string | null>,
  },
};

contextBridge.exposeInMainWorld('storyzip', api);
