import { contextBridge, ipcRenderer } from 'electron';

type DesktopHostActionId =
  | 'retry'
  | 'open_runtime_diagnostics'
  | 'open_setup'
  | 'open_chat'
  | 'quit';

const DESKTOP_HOST_ACTION_IDS = new Set<DesktopHostActionId>([
  'retry',
  'open_runtime_diagnostics',
  'open_setup',
  'open_chat',
  'quit',
]);

interface DesktopBootstrapSnapshot {
  phase: string;
  status: string;
  summary: string;
}

function assertDesktopHostActionId(value: unknown): DesktopHostActionId {
  if (typeof value !== 'string' || !DESKTOP_HOST_ACTION_IDS.has(value as DesktopHostActionId)) {
    throw new Error(`Invalid desktop host action id: ${String(value)}`);
  }
  return value as DesktopHostActionId;
}

const bridge = {
  getSnapshot(): Promise<DesktopBootstrapSnapshot> {
    return ipcRenderer.invoke('cats-host:get-snapshot');
  },
  runAction(actionId: DesktopHostActionId): Promise<DesktopBootstrapSnapshot> {
    return ipcRenderer.invoke('cats-host:run-action', assertDesktopHostActionId(actionId));
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
