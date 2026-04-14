import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('storyzip', {
  platform: 'electron',
});
