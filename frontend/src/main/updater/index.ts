import { ipcMain } from 'electron';
import {
  checkForUpdates,
  downloadUpdate,
  getCurrentVersion,
  installAndRestart,
} from './updater';

export function registerUpdaterHandlers() {
  ipcMain.handle('updater:getCurrentVersion', () => getCurrentVersion());
  ipcMain.handle('updater:check', () => checkForUpdates());
  ipcMain.handle('updater:download', () => downloadUpdate());
  ipcMain.handle('updater:installAndRestart', () => {
    installAndRestart();
  });
}
