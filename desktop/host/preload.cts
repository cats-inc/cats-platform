import { contextBridge, ipcRenderer } from 'electron';

import type { DesktopScreenshotCaptureResult } from './contracts.js';

type DesktopHostActionId =
  | 'retry'
  | 'resume_setup'
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
  'resume_setup',
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

interface DesktopStartupPreferences {
  startAtLogin: boolean;
  openWindowOnStartup: boolean;
  systemTrayEnabled: boolean;
}

interface DesktopHostPlatformShellUpdate {
  bootstrapAttemptId: string | null;
  setupCompleteAt: string | null;
  products: Array<{
    id?: string;
    productName?: string;
    routePrefix?: string;
    installState?: string;
    setup?: {
      selectable?: boolean;
      disabledReason?: string;
    } | null;
  }>;
}

interface DesktopSetupSnapshot {
  helpers: Array<{
    id: string;
    available: boolean;
    supported: boolean;
  }>;
  resumeAction: null | {
    helperId: string;
    mode: DesktopSetupHelperMode;
    reason: string;
    summary: string;
    interruptions?: Array<{
      kind: string;
    }>;
  };
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
  screenshotRegionCaptureAvailable: false,
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
  resumeSetup(): Promise<DesktopSetupSnapshot> {
    return ipcRenderer.invoke('cats-host:resume-setup');
  },
  captureScreenshotRegion(): Promise<DesktopScreenshotCaptureResult> {
    return ipcRenderer.invoke('cats-host:capture-screenshot-region', {
      source: 'composer',
    });
  },
  updateDesktopPreferences(
    prefs: DesktopStartupPreferences,
  ): Promise<DesktopStartupPreferences> {
    if (
      typeof prefs !== 'object'
      || prefs === null
      || typeof prefs.startAtLogin !== 'boolean'
      || typeof prefs.openWindowOnStartup !== 'boolean'
      || typeof prefs.systemTrayEnabled !== 'boolean'
    ) {
      throw new Error('Invalid desktop startup preferences payload.');
    }
    return ipcRenderer.invoke('cats-host:update-desktop-preferences', prefs);
  },
  updatePlatformShell(
    payload: DesktopHostPlatformShellUpdate,
  ): Promise<void> {
    return ipcRenderer.invoke('cats-host:update-platform-shell', payload);
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
