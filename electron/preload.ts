import { contextBridge, ipcRenderer } from 'electron';

import type {
  DesktopBootstrapSnapshot,
  DesktopHostActionId,
} from './contracts.js';

const bridge = {
  getSnapshot(): Promise<DesktopBootstrapSnapshot> {
    return ipcRenderer.invoke('cats-host:get-snapshot');
  },
  runAction(actionId: DesktopHostActionId): Promise<DesktopBootstrapSnapshot> {
    return ipcRenderer.invoke('cats-host:run-action', actionId);
  },
  onSnapshot(listener: (snapshot: DesktopBootstrapSnapshot) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: DesktopBootstrapSnapshot) => {
      listener(snapshot);
    };
    ipcRenderer.on('cats-host:snapshot', handler);
    return () => {
      ipcRenderer.off('cats-host:snapshot', handler);
    };
  },
};

contextBridge.exposeInMainWorld('catsDesktopHost', bridge);
