import { app, BrowserWindow, ipcMain, shell } from 'electron';

import { buildDesktopBootstrapPage } from './bootstrapPage.js';
import { resolveDesktopHostConfig, type DesktopHostConfig } from './config.js';
import type {
  DesktopBackgroundState,
  DesktopBootstrapSnapshot,
  DesktopHostActionId,
  DesktopUpdateState,
} from './contracts.js';
import { createDesktopBackgroundState, DesktopHostStateStore } from './hostState.js';
import { ManagedServiceSupervisor } from './processSupervisor.js';
import {
  buildDesktopBootstrapSnapshot,
  fetchJson,
  type AppHealthPayload,
  type AppShellPayload,
  type RuntimeDiagnosticsHealthPayload,
  type RuntimeProviderDiagnosticsPayload,
} from './readiness.js';
import { isDesktopHostActionId, validateDesktopUrl } from './security.js';
import { createDesktopTrayController, type DesktopTrayController } from './tray.js';
import { checkForDesktopUpdates, createDefaultDesktopUpdateState } from './update.js';

let mainWindow: BrowserWindow | null = null;
let hostConfig: DesktopHostConfig | null = null;
let supervisor: ManagedServiceSupervisor | null = null;
let latestSnapshot: DesktopBootstrapSnapshot | null = null;
let bootstrapPromise: Promise<DesktopBootstrapSnapshot> | null = null;
let shuttingDown = false;
let trayController: DesktopTrayController | null = null;
let stateStore: DesktopHostStateStore | null = null;
let backgroundState: DesktopBackgroundState | null = null;
let updateState: DesktopUpdateState | null = null;
let bootstrapPageVisible = false;

function encodeDataUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

async function ensureBootstrapPageVisible(): Promise<void> {
  if (!mainWindow) {
    return;
  }
  if (!bootstrapPageVisible) {
    await mainWindow.loadURL(encodeDataUrl(buildDesktopBootstrapPage()));
    bootstrapPageVisible = true;
  }
}

function writePersistedHostState(snapshot: DesktopBootstrapSnapshot): void {
  if (!stateStore) {
    return;
  }
  void stateStore.save({
    snapshot,
    background: snapshot.background,
    updates: snapshot.updates,
    packaging: snapshot.packaging,
  }).catch((error) => {
    process.stderr.write(`Failed to persist desktop host state: ${error instanceof Error ? error.message : String(error)}\n`);
  });
}

function publishSnapshot(snapshot: DesktopBootstrapSnapshot): DesktopBootstrapSnapshot {
  const enriched: DesktopBootstrapSnapshot = {
    ...snapshot,
    background: backgroundState ?? snapshot.background,
    updates: updateState ?? snapshot.updates,
    hostStatePath: hostConfig?.paths.hostStatePath ?? snapshot.hostStatePath,
  };
  latestSnapshot = enriched;
  writePersistedHostState(enriched);
  mainWindow?.webContents.send('cats-host:snapshot', enriched);
  return enriched;
}

function updateBackgroundState(
  update: Partial<DesktopBackgroundState>,
): void {
  if (!backgroundState || !hostConfig) {
    return;
  }
  backgroundState = {
    ...backgroundState,
    ...update,
  };
}

async function showMainWindow(url?: string): Promise<void> {
  if (!mainWindow) {
    return;
  }
  if (url) {
    await mainWindow.loadURL(validateDesktopUrl(url, {
      allowedHosts: hostConfig ? [hostConfig.appHost] : null,
    }));
    bootstrapPageVisible = false;
  }
  mainWindow.show();
  mainWindow.focus();
  updateBackgroundState({
    mode: 'foreground',
    windowVisible: true,
    lastHiddenAt: null,
  });
  if (latestSnapshot) {
    publishSnapshot(latestSnapshot);
  }
}

function hideMainWindowToTray(): void {
  if (!mainWindow || !hostConfig || !trayController) {
    return;
  }
  trayController.hideWindowToTray();
  updateBackgroundState({
    mode: 'background',
    windowVisible: false,
    lastHiddenAt: new Date().toISOString(),
  });
  if (latestSnapshot) {
    publishSnapshot(latestSnapshot);
  }
}

function buildSnapshot(lastError?: string | null): DesktopBootstrapSnapshot {
  if (!hostConfig || !supervisor) {
    throw new Error('Desktop host is not initialized.');
  }
  return buildDesktopBootstrapSnapshot({
    config: hostConfig,
    services: supervisor.getSnapshots(),
    lastError,
    background: backgroundState ?? undefined,
    updates: updateState ?? undefined,
    hostStatePath: hostConfig.paths.hostStatePath,
  });
}

async function refreshBootstrapSnapshot(): Promise<DesktopBootstrapSnapshot> {
  if (!hostConfig || !supervisor) {
    throw new Error('Desktop host is not initialized.');
  }

  const [appHealth, appShell, runtimeHealth, providerDiagnostics] = await Promise.allSettled([
    fetchJson<AppHealthPayload>(`${hostConfig.appBaseUrl}/health`),
    fetchJson<AppShellPayload>(`${hostConfig.appBaseUrl}/api/app-shell`),
    fetchJson<RuntimeDiagnosticsHealthPayload>(`${hostConfig.runtimeBaseUrl}/diagnostics/health`),
    fetchJson<RuntimeProviderDiagnosticsPayload>(`${hostConfig.runtimeBaseUrl}/diagnostics/providers`),
  ]);

  return buildDesktopBootstrapSnapshot({
    config: hostConfig,
    services: supervisor.getSnapshots(),
    appHealth: appHealth.status === 'fulfilled' ? appHealth.value : null,
    appShell: appShell.status === 'fulfilled' ? appShell.value : null,
    runtimeHealth: runtimeHealth.status === 'fulfilled' ? runtimeHealth.value : null,
    providerDiagnostics: providerDiagnostics.status === 'fulfilled' ? providerDiagnostics.value : null,
    background: backgroundState ?? undefined,
    updates: updateState ?? undefined,
    hostStatePath: hostConfig.paths.hostStatePath,
  });
}

async function maybeOpenApp(snapshot: DesktopBootstrapSnapshot): Promise<void> {
  if (!mainWindow || !hostConfig || snapshot.phase !== 'ready_for_chat') {
    return;
  }
  await showMainWindow(`${hostConfig.appBaseUrl}${snapshot.app.entryPath}`);
}

async function refreshUpdateState(): Promise<DesktopUpdateState> {
  if (!hostConfig) {
    throw new Error('Desktop host is not initialized.');
  }
  updateState = {
    ...(updateState ?? createDefaultDesktopUpdateState(hostConfig.update)),
    status: hostConfig.update.manifestUrl ? 'checking' : 'disabled',
    summary: hostConfig.update.manifestUrl
      ? 'Checking for desktop updates.'
      : 'Update checks are disabled until a manifest URL is configured.',
  };
  if (latestSnapshot) {
    publishSnapshot(latestSnapshot);
  }
  updateState = await checkForDesktopUpdates(hostConfig.update);
  if (latestSnapshot) {
    publishSnapshot(latestSnapshot);
  }
  return updateState;
}

async function bootstrapDesktopHost(restartServices = false): Promise<DesktopBootstrapSnapshot> {
  if (!hostConfig || !supervisor) {
    throw new Error('Desktop host is not initialized.');
  }
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    await ensureBootstrapPageVisible();

    if (restartServices) {
      await supervisor.stopAll();
    }

    publishSnapshot(buildSnapshot(null));
    await supervisor.startAll();
    publishSnapshot(buildDesktopBootstrapSnapshot({
      config: hostConfig,
      services: supervisor.getSnapshots(),
    }));

    const snapshot = publishSnapshot(await refreshBootstrapSnapshot());
    await maybeOpenApp(snapshot);
    return snapshot;
  })().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    return publishSnapshot(buildSnapshot(message));
  }).finally(() => {
    bootstrapPromise = null;
  });

  return bootstrapPromise;
}

async function runHostAction(actionId: DesktopHostActionId): Promise<DesktopBootstrapSnapshot> {
  if (!hostConfig || !supervisor || !mainWindow) {
    throw new Error('Desktop host is not initialized.');
  }

  if (actionId === 'retry') {
    return await bootstrapDesktopHost(true);
  }
  if (actionId === 'open_runtime_diagnostics') {
    await shell.openExternal(validateDesktopUrl(
      `${hostConfig.runtimeBaseUrl}/diagnostics/health`,
      {
        allowedHosts: [hostConfig.runtimeHost],
      },
    ));
    return latestSnapshot ?? buildSnapshot(null);
  }
  if (actionId === 'open_setup') {
    await showMainWindow(`${hostConfig.appBaseUrl}/setup`);
    return latestSnapshot ?? buildSnapshot(null);
  }
  if (actionId === 'open_chat') {
    const snapshot = latestSnapshot ?? await refreshBootstrapSnapshot();
    await showMainWindow(`${hostConfig.appBaseUrl}${snapshot.app.entryPath}`);
    return snapshot;
  }
  if (actionId === 'quit') {
    app.quit();
    return latestSnapshot ?? buildSnapshot(null);
  }

  throw new Error(`Unknown desktop host action: ${actionId}`);
}

async function createMainWindow(config: DesktopHostConfig): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 700,
    show: false,
    title: 'Cats',
    backgroundColor: '#f5f1e8',
    webPreferences: {
      preload: config.paths.preloadScript,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  await window.loadURL(encodeDataUrl(buildDesktopBootstrapPage()));
  bootstrapPageVisible = true;
  window.once('ready-to-show', () => {
    window.show();
  });
  return window;
}

async function shutdownHost(): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  try {
    trayController?.dispose();
    await supervisor?.stopAll();
  } finally {
    app.exit();
  }
}

async function main(): Promise<void> {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  await app.whenReady();

  hostConfig = resolveDesktopHostConfig({
    userDataDir: app.getPath('userData'),
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
  });
  backgroundState = createDesktopBackgroundState(hostConfig);
  updateState = createDefaultDesktopUpdateState(hostConfig.update);
  stateStore = new DesktopHostStateStore(hostConfig.paths.hostStatePath);
  supervisor = new ManagedServiceSupervisor(hostConfig, {
    onStateChange: () => {
      if (hostConfig && supervisor) {
        publishSnapshot(buildDesktopBootstrapSnapshot({
          config: hostConfig,
          services: supervisor.getSnapshots(),
          background: backgroundState ?? undefined,
          updates: updateState ?? undefined,
          hostStatePath: hostConfig.paths.hostStatePath,
        }));
      }
    },
  });
  latestSnapshot = buildSnapshot(null);

  mainWindow = await createMainWindow(hostConfig);
  if (hostConfig.background.trayEnabled) {
    trayController = createDesktopTrayController({
      getWindow: () => mainWindow,
      onShowSetup: async () => {
        if (hostConfig) {
          await showMainWindow(`${hostConfig.appBaseUrl}/setup`);
        }
      },
      onShowChat: async () => {
        if (!hostConfig) {
          return;
        }
        const snapshot = latestSnapshot ?? await refreshBootstrapSnapshot();
        await showMainWindow(`${hostConfig.appBaseUrl}${snapshot.app.entryPath}`);
      },
      onQuit: () => {
        void shutdownHost();
      },
    });
  }

  ipcMain.handle('cats-host:get-snapshot', async () => {
    return latestSnapshot ?? buildSnapshot(null);
  });
  ipcMain.handle('cats-host:run-action', async (_event, actionId: unknown) => {
    if (!isDesktopHostActionId(actionId)) {
      throw new Error(`Invalid desktop host action: ${String(actionId)}`);
    }
    return await runHostAction(actionId);
  });

  app.on('before-quit', (event) => {
    if (!shuttingDown) {
      event.preventDefault();
      void shutdownHost();
    }
  });
  mainWindow.on('close', (event) => {
    if (
      !shuttingDown
      && hostConfig?.background.trayEnabled
      && hostConfig.background.keepServicesRunning
      && hostConfig.background.closeBehavior === 'minimize_to_tray'
    ) {
      event.preventDefault();
      hideMainWindowToTray();
    }
  });
  app.on('window-all-closed', () => {
    if (!hostConfig?.background.trayEnabled || !hostConfig.background.keepServicesRunning) {
      app.quit();
    }
  });
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      void showMainWindow();
    }
  });
  app.on('activate', () => {
    void showMainWindow();
  });

  await bootstrapDesktopHost(false);
  if (hostConfig.update.checkOnStartup && hostConfig.update.manifestUrl) {
    void refreshUpdateState();
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
