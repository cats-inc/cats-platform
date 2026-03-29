import { app, BrowserWindow, ipcMain, shell } from 'electron';

import { buildDesktopBootstrapPage } from './bootstrapPage.js';
import { resolveDesktopHostConfig, type DesktopHostConfig } from './config.js';
import type {
  DesktopBackgroundState,
  DesktopBootstrapSnapshot,
  DesktopHostActionId,
  DesktopPackagingPlan,
  DesktopSetupHelperMode,
  DesktopSetupSnapshot,
  DesktopSetupState,
  DesktopUpdateState,
} from './contracts.js';
import { createDesktopBackgroundState, DesktopHostStateStore } from './hostState.js';
import { createDesktopPackagingPlan } from './packaging.js';
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
import {
  buildDesktopSetupSnapshot,
  createEmptyDesktopSetupState,
  runDesktopSetupHelper,
} from './setupBridge.js';
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
let packagingState: DesktopPackagingPlan | null = null;
let setupState: DesktopSetupState | null = null;
let bootstrapPageVisible = false;

function encodeDataUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

async function openExternalDesktopUrl(rawUrl: string): Promise<void> {
  await shell.openExternal(validateDesktopUrl(rawUrl));
}

function reportExternalUrlOpenFailure(error: unknown): void {
  process.stderr.write(
    `Failed to open external desktop URL: ${error instanceof Error ? error.message : String(error)}\n`,
  );
}

function shouldAllowInAppNavigation(
  rawUrl: string,
  config: DesktopHostConfig,
): boolean {
  try {
    const currentAppUrl = new URL(config.appBaseUrl);
    const nextUrl = new URL(validateDesktopUrl(rawUrl, {
      allowedHosts: [config.appHost],
    }));
    return nextUrl.origin === currentAppUrl.origin;
  } catch {
    return false;
  }
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
    setup: snapshot.setup,
  }).catch((error) => {
    process.stderr.write(`Failed to persist desktop host state: ${error instanceof Error ? error.message : String(error)}\n`);
  });
}

function publishSnapshot(snapshot: DesktopBootstrapSnapshot): DesktopBootstrapSnapshot {
  const enriched: DesktopBootstrapSnapshot = {
    ...snapshot,
    background: backgroundState ?? snapshot.background,
    updates: updateState ?? snapshot.updates,
    packaging: packagingState ?? snapshot.packaging,
    setup: setupState ?? snapshot.setup,
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

function isDesktopSetupHelperMode(value: unknown): value is DesktopSetupHelperMode {
  return value === 'check' || value === 'apply' || value === 'upgrade' || value === 'force';
}

function resolveCurrentPackagingPlan(config: DesktopHostConfig): DesktopPackagingPlan {
  return packagingState ?? createDesktopPackagingPlan(config, {
    generatedAt: new Date(),
    outputRoot: config.paths.packagingOutputRoot,
  });
}

async function getSetupSnapshot(): Promise<DesktopSetupSnapshot> {
  if (!hostConfig) {
    throw new Error('Desktop host is not initialized.');
  }

  return await buildDesktopSetupSnapshot({
    config: hostConfig,
    packaging: resolveCurrentPackagingPlan(hostConfig),
    state: setupState ?? createEmptyDesktopSetupState(),
  });
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
    packaging: packagingState ?? undefined,
    setup: setupState ?? undefined,
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
    packaging: packagingState ?? undefined,
    setup: setupState ?? undefined,
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

async function runSetupAction(
  action: {
    helperId: string;
    mode: DesktopSetupHelperMode;
  },
): Promise<DesktopSetupSnapshot> {
  if (!hostConfig) {
    throw new Error('Desktop host is not initialized.');
  }

  const packaging = resolveCurrentPackagingPlan(hostConfig);
  const result = await runDesktopSetupHelper({
    config: hostConfig,
    packaging,
    action,
  });
  packagingState = packaging;
  setupState = {
    lastAction: result,
    updatedAt: result.completedAt ?? result.startedAt,
  };
  publishSnapshot(await refreshBootstrapSnapshot());
  return await getSetupSnapshot();
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

  window.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalDesktopUrl(url).catch(reportExternalUrlOpenFailure);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (shouldAllowInAppNavigation(url, config)) {
      return;
    }
    event.preventDefault();
    void openExternalDesktopUrl(url).catch(reportExternalUrlOpenFailure);
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
  const nodeProcess = process as NodeJS.Process & { resourcesPath?: string };

  hostConfig = resolveDesktopHostConfig({
    userDataDir: app.getPath('userData'),
    packaged: app.isPackaged,
    resourcesPath: nodeProcess.resourcesPath,
  });
  stateStore = new DesktopHostStateStore(hostConfig.paths.hostStatePath);
  {
    const defaultBackground = createDesktopBackgroundState(hostConfig);
    const defaultUpdates = createDefaultDesktopUpdateState(hostConfig.update);
    const defaultPackaging = createDesktopPackagingPlan(hostConfig, {
      generatedAt: new Date(),
      outputRoot: hostConfig.paths.packagingOutputRoot,
    });
    const defaultSetup = createEmptyDesktopSetupState();
    const restoredState = await stateStore.load(hostConfig, {
      background: defaultBackground,
      updates: defaultUpdates,
      packaging: defaultPackaging,
      setup: defaultSetup,
    });
    backgroundState = restoredState?.background ?? defaultBackground;
    updateState = restoredState?.updates ?? defaultUpdates;
    packagingState = restoredState?.packaging ?? defaultPackaging;
    setupState = restoredState?.setup ?? defaultSetup;
  }
  supervisor = new ManagedServiceSupervisor(hostConfig, {
    onStateChange: () => {
      if (hostConfig && supervisor) {
        publishSnapshot(buildDesktopBootstrapSnapshot({
          config: hostConfig,
          services: supervisor.getSnapshots(),
          background: backgroundState ?? undefined,
          updates: updateState ?? undefined,
          packaging: packagingState ?? undefined,
          setup: setupState ?? undefined,
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
  ipcMain.handle('cats-host:get-setup-snapshot', async () => {
    return await getSetupSnapshot();
  });
  ipcMain.handle('cats-host:run-action', async (_event, actionId: unknown) => {
    if (!isDesktopHostActionId(actionId)) {
      throw new Error(`Invalid desktop host action: ${String(actionId)}`);
    }
    return await runHostAction(actionId);
  });
  ipcMain.handle('cats-host:run-setup-helper', async (_event, payload: unknown) => {
    if (
      typeof payload !== 'object'
      || payload === null
      || typeof (payload as { helperId?: unknown }).helperId !== 'string'
      || !isDesktopSetupHelperMode((payload as { mode?: unknown }).mode)
    ) {
      throw new Error('Invalid packaged setup helper action payload.');
    }
    return await runSetupAction({
      helperId: (payload as { helperId: string }).helperId,
      mode: (payload as { mode: DesktopSetupHelperMode }).mode,
    });
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
