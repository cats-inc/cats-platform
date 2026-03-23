import { app, BrowserWindow, ipcMain, shell } from 'electron';

import { buildDesktopBootstrapPage } from './bootstrapPage.js';
import { resolveDesktopHostConfig, type DesktopHostConfig } from './config.js';
import type { DesktopBootstrapSnapshot, DesktopHostActionId } from './contracts.js';
import { ManagedServiceSupervisor } from './processSupervisor.js';
import {
  buildDesktopBootstrapSnapshot,
  fetchJson,
  type AppHealthPayload,
  type AppShellPayload,
  type RuntimeDiagnosticsHealthPayload,
  type RuntimeProviderDiagnosticsPayload,
} from './readiness.js';

let mainWindow: BrowserWindow | null = null;
let hostConfig: DesktopHostConfig | null = null;
let supervisor: ManagedServiceSupervisor | null = null;
let latestSnapshot: DesktopBootstrapSnapshot | null = null;
let bootstrapPromise: Promise<DesktopBootstrapSnapshot> | null = null;
let shuttingDown = false;

function encodeDataUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

async function ensureBootstrapPageVisible(): Promise<void> {
  if (!mainWindow) {
    return;
  }
  const bootstrapUrl = encodeDataUrl(buildDesktopBootstrapPage());
  if (mainWindow.webContents.getURL() !== bootstrapUrl) {
    await mainWindow.loadURL(bootstrapUrl);
  }
}

function publishSnapshot(snapshot: DesktopBootstrapSnapshot): DesktopBootstrapSnapshot {
  latestSnapshot = snapshot;
  mainWindow?.webContents.send('cats-host:snapshot', snapshot);
  return snapshot;
}

function buildSnapshot(lastError?: string | null): DesktopBootstrapSnapshot {
  if (!hostConfig || !supervisor) {
    throw new Error('Desktop host is not initialized.');
  }
  return buildDesktopBootstrapSnapshot({
    config: hostConfig,
    services: supervisor.getSnapshots(),
    lastError,
  });
}

async function refreshBootstrapSnapshot(): Promise<DesktopBootstrapSnapshot> {
  if (!hostConfig || !supervisor) {
    throw new Error('Desktop host is not initialized.');
  }

  const [appHealth, appShell, runtimeHealth, providerDiagnostics] = await Promise.all([
    fetchJson<AppHealthPayload>(`${hostConfig.appBaseUrl}/health`),
    fetchJson<AppShellPayload>(`${hostConfig.appBaseUrl}/api/app-shell`),
    fetchJson<RuntimeDiagnosticsHealthPayload>(`${hostConfig.runtimeBaseUrl}/diagnostics/health`),
    fetchJson<RuntimeProviderDiagnosticsPayload>(`${hostConfig.runtimeBaseUrl}/diagnostics/providers`),
  ]);

  return buildDesktopBootstrapSnapshot({
    config: hostConfig,
    services: supervisor.getSnapshots(),
    appHealth,
    appShell,
    runtimeHealth,
    providerDiagnostics,
  });
}

async function maybeOpenApp(snapshot: DesktopBootstrapSnapshot): Promise<void> {
  if (!mainWindow || !hostConfig || snapshot.phase !== 'ready_for_chat') {
    return;
  }
  await mainWindow.loadURL(`${hostConfig.appBaseUrl}${snapshot.app.entryPath}`);
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
    await shell.openExternal(`${hostConfig.runtimeBaseUrl}/diagnostics/health`);
    return latestSnapshot ?? buildSnapshot(null);
  }
  if (actionId === 'open_setup') {
    await mainWindow.loadURL(`${hostConfig.appBaseUrl}/setup`);
    return latestSnapshot ?? buildSnapshot(null);
  }
  if (actionId === 'open_chat') {
    const snapshot = latestSnapshot ?? await refreshBootstrapSnapshot();
    await mainWindow.loadURL(`${hostConfig.appBaseUrl}${snapshot.app.entryPath}`);
    return snapshot;
  }

  app.quit();
  return latestSnapshot ?? buildSnapshot(null);
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
      sandbox: false,
    },
  });

  await window.loadURL(encodeDataUrl(buildDesktopBootstrapPage()));
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
  });
  supervisor = new ManagedServiceSupervisor(hostConfig, {
    onStateChange: () => {
      if (hostConfig && supervisor) {
        publishSnapshot(buildDesktopBootstrapSnapshot({
          config: hostConfig,
          services: supervisor.getSnapshots(),
        }));
      }
    },
  });
  latestSnapshot = buildSnapshot(null);

  mainWindow = await createMainWindow(hostConfig);

  ipcMain.handle('cats-host:get-snapshot', async () => {
    return latestSnapshot ?? buildSnapshot(null);
  });
  ipcMain.handle('cats-host:run-action', async (_event, actionId: DesktopHostActionId) => {
    return await runHostAction(actionId);
  });

  app.on('before-quit', (event) => {
    if (!shuttingDown) {
      event.preventDefault();
      void shutdownHost();
    }
  });
  app.on('window-all-closed', () => {
    app.quit();
  });
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  await bootstrapDesktopHost(false);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
  process.exit(1);
});
