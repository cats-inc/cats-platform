import { contextBridge, ipcRenderer } from 'electron';

type DesktopHostActionId =
  | 'retry'
  | 'open_runtime_diagnostics'
  | 'open_setup'
  | 'open_chat'
  | 'quit';
type DesktopSetupHelperMode =
  | 'check'
  | 'apply'
  | 'upgrade'
  | 'force';

const DESKTOP_HOST_ACTION_IDS = new Set<DesktopHostActionId>([
  'retry',
  'open_runtime_diagnostics',
  'open_setup',
  'open_chat',
  'quit',
]);
const DESKTOP_SETUP_HELPER_MODES = new Set<DesktopSetupHelperMode>([
  'check',
  'apply',
  'upgrade',
  'force',
]);

interface DesktopBootstrapSnapshot {
  phase: string;
  status: string;
  summary: string;
}

interface DesktopSetupSnapshot {
  helpers: Array<{
    id: string;
    available: boolean;
    supported: boolean;
  }>;
  state: {
    updatedAt: string | null;
    lastAction: null | {
      helperId: string;
      mode: DesktopSetupHelperMode;
      runState: 'completed' | 'failed';
      status: string | null;
    };
  };
}

function assertDesktopHostActionId(value: unknown): DesktopHostActionId {
  if (typeof value !== 'string' || !DESKTOP_HOST_ACTION_IDS.has(value as DesktopHostActionId)) {
    throw new Error(`Invalid desktop host action id: ${String(value)}`);
  }
  return value as DesktopHostActionId;
}

function assertDesktopSetupHelperMode(value: unknown): DesktopSetupHelperMode {
  if (typeof value !== 'string' || !DESKTOP_SETUP_HELPER_MODES.has(value as DesktopSetupHelperMode)) {
    throw new Error(`Invalid desktop setup helper mode: ${String(value)}`);
  }
  return value as DesktopSetupHelperMode;
}

const bridge = {
  getSnapshot(): Promise<DesktopBootstrapSnapshot> {
    return ipcRenderer.invoke('cats-host:get-snapshot');
  },
  getSetupSnapshot(): Promise<DesktopSetupSnapshot> {
    return ipcRenderer.invoke('cats-host:get-setup-snapshot');
  },
  runAction(actionId: DesktopHostActionId): Promise<DesktopBootstrapSnapshot> {
    return ipcRenderer.invoke('cats-host:run-action', assertDesktopHostActionId(actionId));
  },
  runSetupHelper(
    helperId: string,
    mode: DesktopSetupHelperMode,
  ): Promise<DesktopSetupSnapshot> {
    if (typeof helperId !== 'string' || helperId.trim().length === 0) {
      throw new Error(`Invalid desktop setup helper id: ${String(helperId)}`);
    }
    return ipcRenderer.invoke('cats-host:run-setup-helper', {
      helperId,
      mode: assertDesktopSetupHelperMode(mode),
    });
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
