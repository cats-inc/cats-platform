import { app, BrowserWindow, ipcMain, shell } from 'electron';

import { buildDesktopBootstrapPage } from './bootstrapPage.js';
import {
  resolveDesktopBootstrapNavigation,
  shouldNavigateDesktopBootstrap,
  resolveDesktopWindowRevealNavigation,
} from './bootstrapNavigation.js';
import {
  resolveCatsHomeDir,
  resolveDesktopHostConfig,
  resolveDesktopUserDataDir,
  type DesktopHostConfig,
} from './config.js';
import type {
  DesktopBackgroundState,
  DesktopBootstrapEventStatus,
  DesktopBootstrapSnapshot,
  DesktopHostDiagnosticsState,
  DesktopHostActionId,
  DesktopManagedServiceLog,
  DesktopPackagingPlatform,
  DesktopProductBootstrapDiagnostics,
  DesktopPackagingPlan,
  DesktopSetupHelperMode,
  DesktopSetupSnapshot,
  DesktopSetupState,
  DesktopUpdateState,
} from './contracts.js';
import {
  appendHostEvent,
  appendRuntimeEvent,
  buildDesktopAggregationBundle,
  createBootstrapAttemptId,
  createDesktopBootstrapEvent,
  createEmptyDesktopDiagnosticsState,
  toDesktopBootstrapError,
  toDesktopBootstrapStatus,
  updateServiceLogs,
} from './bootstrapDiagnostics.js';
import { createDesktopBackgroundState, DesktopHostStateStore } from './hostState.js';
import { createDesktopPackagingPlan } from './packaging.js';
import { ManagedServiceSupervisor } from './processSupervisor.js';
import {
  buildDesktopBootstrapSnapshot,
  fetchJson,
  type AppHealthPayload,
  type AppShellPayload,
  type ReadinessPayload,
  type RuntimeDiagnosticsHealthPayload,
  type RuntimeProviderDiagnosticsPayload,
} from './readiness.js';
import { isDesktopHostActionId, validateDesktopUrl } from './security.js';
import {
  readPersistedSetupCompletionState,
  type PersistedSetupCompletionState,
} from './persistedSetupState.js';
import {
  buildDesktopSetupSnapshot,
  createEmptyDesktopSetupState,
  runDesktopSetupHelper,
  shouldAutoRunSetupAudit,
} from './setupBridge.js';
import { resolveDefaultSetupAuditAction } from './setupAudit.js';
import {
  createDesktopTrayController,
  type DesktopTrayController,
} from './tray.js';
import { buildDesktopTrayMenuState as buildElectronTrayMenuState } from './trayMenu.js';
import {
  applyDesktopHostPlatformShellUpdate,
  normalizePlatformShellSetupState,
  parseDesktopHostPlatformShellUpdate,
} from './platformShellUpdate.js';
import { checkForDesktopUpdates, createDefaultDesktopUpdateState } from './update.js';
import {
  applyDesktopWindowChrome,
  resolveDesktopWindowChromeOptions,
} from './windowChrome.js';
import { resolveDesktopWindowIconPath } from './windowIcon.js';
import {
  readDesktopStartupPreferences,
  resolveDesktopStartupLaunchContext,
  syncDesktopStartupPreferences,
  updateDesktopStartupPreferences,
  DESKTOP_LAUNCH_AT_LOGIN_ARG,
  type DesktopStartupLaunchContext,
  type DesktopStartupPreferences,
} from './desktopStartup.js';
import { loadDesktopEnvFile } from './env.js';

let mainWindow: BrowserWindow | null = null;
let hostConfig: DesktopHostConfig | null = null;
let supervisor: ManagedServiceSupervisor | null = null;
let latestSnapshot: DesktopBootstrapSnapshot | null = null;
let latestAppHealthPayload: AppHealthPayload | null = null;
let latestAppShellPayload: AppShellPayload | null = null;
let latestRuntimeHealthPayload: RuntimeDiagnosticsHealthPayload | ReadinessPayload | null = null;
let latestProviderDiagnosticsPayload: RuntimeProviderDiagnosticsPayload | null = null;
let latestPersistedSetupState: PersistedSetupCompletionState = {
  setupCompleteAt: null,
  productSetupCompleted: false,
};
let bootstrapPromise: Promise<DesktopBootstrapSnapshot> | null = null;
let shuttingDown = false;
let trayController: DesktopTrayController | null = null;
let stateStore: DesktopHostStateStore | null = null;
let backgroundState: DesktopBackgroundState | null = null;
let updateState: DesktopUpdateState | null = null;
let packagingState: DesktopPackagingPlan | null = null;
let setupState: DesktopSetupState | null = null;
let diagnosticsState: DesktopHostDiagnosticsState | null = null;
let bootstrapPageVisible = false;
let bootstrapWindowRevealRequested = false;
let startupLaunchContext: DesktopStartupLaunchContext | null = null;
let latestDesktopStartupPreferences: DesktopStartupPreferences = {
  startAtLogin: true,
  openWindowOnStartup: false,
  systemTrayEnabled: true,
};

interface ProductBootstrapDiagnosticsPayload {
  generatedAt?: string;
  attemptId?: string | null;
  status?: string;
  summary?: string;
  historyPath?: string | null;
  latestReference?: {
    artifactId?: string;
    artifactPath?: string;
    recordId?: string;
    route?: string;
  } | null;
  events?: Array<{
    layer?: string;
    kind?: string;
    timestamp?: string;
    attemptId?: string | null;
    summary?: string;
    status?: string;
    context?: Record<string, unknown>;
    error?: {
      message?: string;
      code?: string;
      cause?: string;
      stack?: string;
    } | null;
    reference?: {
      artifactId?: string;
      artifactPath?: string;
      recordId?: string;
      route?: string;
    } | null;
  }>;
}

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

function deriveSetupEventStatus(setup: DesktopSetupState): DesktopBootstrapEventStatus {
  const lastAction = setup.lastAction;
  if (!lastAction) {
    return 'info';
  }
  if (lastAction.runState === 'failed') {
    return 'unavailable';
  }
  if (lastAction.status === 'ready') {
    return 'ok';
  }
  if (lastAction.restartRequired || lastAction.interruptions.length > 0) {
    return 'degraded';
  }
  return 'info';
}

function buildServiceLogs(snapshot: DesktopBootstrapSnapshot): DesktopManagedServiceLog[] {
  return snapshot.services.map((service) => ({
    service: service.name,
    logPath: service.logPath,
    lastOutput: service.lastOutput,
    lastOutputAt: service.lastOutputAt,
  }));
}

function buildServiceLogReference(
  service: DesktopBootstrapSnapshot['services'][number] | undefined,
) {
  if (!service) {
    return null;
  }
  return {
    artifactId: `${service.name}-log`,
    artifactPath: service.logPath ?? undefined,
    route: service.healthUrl,
  };
}

function normalizeRuntimeHealthPayload(
  payload: RuntimeDiagnosticsHealthPayload | ReadinessPayload,
): RuntimeDiagnosticsHealthPayload {
  return {
    status: payload.status,
    summary: payload.summary,
    readiness: payload.readiness,
    runtime: 'runtime' in payload && payload.runtime
      ? payload.runtime
      : {
        status: payload.status,
        summary: payload.summary,
      },
    providers: 'providers' in payload ? payload.providers : undefined,
  };
}

function normalizeProductDiagnosticsPayload(
  payload: ProductBootstrapDiagnosticsPayload,
): DesktopProductBootstrapDiagnostics | null {
  if (
    typeof payload.generatedAt !== 'string'
    || typeof payload.summary !== 'string'
  ) {
    return null;
  }

  return {
    generatedAt: payload.generatedAt,
    attemptId: typeof payload.attemptId === 'string' && payload.attemptId.trim()
      ? payload.attemptId.trim()
      : null,
    status: toDesktopBootstrapStatus(
      payload.status === 'ok'
        || payload.status === 'degraded'
        || payload.status === 'unavailable'
        || payload.status === 'info'
        ? payload.status
        : 'info',
      'info',
    ),
    summary: payload.summary,
    historyPath: typeof payload.historyPath === 'string' && payload.historyPath.trim()
      ? payload.historyPath
      : null,
    latestReference: payload.latestReference
      ? {
        artifactId: payload.latestReference.artifactId,
        artifactPath: payload.latestReference.artifactPath,
        recordId: payload.latestReference.recordId,
        route: payload.latestReference.route,
      }
      : null,
    events: Array.isArray(payload.events)
      ? payload.events.flatMap((event) => {
        if (
          (event.layer !== 'runtime' && event.layer !== 'product' && event.layer !== 'host')
          || typeof event.kind !== 'string'
          || typeof event.timestamp !== 'string'
          || typeof event.summary !== 'string'
        ) {
          return [];
        }

        return [createDesktopBootstrapEvent({
          layer: event.layer,
          kind: event.kind,
          timestamp: event.timestamp,
          attemptId: typeof event.attemptId === 'string' && event.attemptId.trim()
            ? event.attemptId.trim()
            : null,
          summary: event.summary,
          status: toDesktopBootstrapStatus(
            event.status === 'ok'
              || event.status === 'degraded'
              || event.status === 'unavailable'
              || event.status === 'info'
              ? event.status
              : 'info',
            'info',
          ),
          context: event.context ?? null,
          error: event.error?.message
            ? {
              message: event.error.message,
              code: event.error.code,
              cause: event.error.cause,
              stack: event.error.stack,
            }
            : null,
          reference: event.reference
            ? {
              artifactId: event.reference.artifactId,
              artifactPath: event.reference.artifactPath,
              recordId: event.reference.recordId,
              route: event.reference.route,
            }
            : null,
        })];
      })
      : [],
  };
}

function recordSnapshotTransitions(snapshot: DesktopBootstrapSnapshot): void {
  if (!diagnosticsState) {
    return;
  }

  const attemptId = diagnosticsState.activeAttemptId;
  const previousSnapshot = latestSnapshot;
  if (!previousSnapshot || previousSnapshot.phase !== snapshot.phase) {
    diagnosticsState = appendHostEvent(diagnosticsState, createDesktopBootstrapEvent({
      layer: 'host',
      kind: 'host_phase_changed',
      timestamp: snapshot.timestamp,
      attemptId,
      summary: `Desktop host phase is ${snapshot.phase}. ${snapshot.summary}`,
      status: snapshot.status,
      context: {
        previousPhase: previousSnapshot?.phase ?? null,
        phase: snapshot.phase,
        hostStatus: snapshot.status,
      },
      reference: {
        artifactPath: hostConfig?.paths.hostStatePath,
      },
    }));
  }

  for (const service of snapshot.services) {
    const previousService = previousSnapshot?.services.find((entry) => entry.name === service.name);
    if (
      service.status === 'failed'
      && previousService?.status !== 'failed'
      && service.error?.includes('before readiness')
    ) {
      diagnosticsState = appendHostEvent(diagnosticsState, createDesktopBootstrapEvent({
        layer: 'host',
        kind: 'service_exited_before_ready',
        timestamp: snapshot.timestamp,
        attemptId,
        summary: service.error,
        status: 'unavailable',
        context: {
          service: service.name,
          exitCode: service.exitCode,
          healthUrl: service.healthUrl,
          lastOutput: service.lastOutput,
        },
        reference: buildServiceLogReference(service),
      }));
    }
  }

  const setupKey = snapshot.setup.lastAction
    ? [
      snapshot.setup.updatedAt ?? '',
      snapshot.setup.lastAction.helperId,
      snapshot.setup.lastAction.runState,
      snapshot.setup.lastAction.status ?? '',
    ].join('|')
    : null;
  const previousSetupKey = previousSnapshot?.setup.lastAction
    ? [
      previousSnapshot.setup.updatedAt ?? '',
      previousSnapshot.setup.lastAction.helperId,
      previousSnapshot.setup.lastAction.runState,
      previousSnapshot.setup.lastAction.status ?? '',
    ].join('|')
    : null;
  if (setupKey && setupKey !== previousSetupKey && snapshot.setup.lastAction) {
    diagnosticsState = appendHostEvent(diagnosticsState, createDesktopBootstrapEvent({
      layer: 'host',
      kind: 'resume_action_changed',
      timestamp: snapshot.setup.updatedAt ?? snapshot.timestamp,
      attemptId,
      summary: snapshot.setup.lastAction.summary,
      status: deriveSetupEventStatus(snapshot.setup),
      context: {
        helperId: snapshot.setup.lastAction.helperId,
        status: snapshot.setup.lastAction.status,
        runState: snapshot.setup.lastAction.runState,
        restartRequired: snapshot.setup.lastAction.restartRequired,
      },
      error: toDesktopBootstrapError(snapshot.setup.lastAction.error),
      reference: {
        artifactPath: hostConfig?.paths.hostStatePath,
      },
    }));
  }

  const runtimeService = snapshot.services.find((service) => service.name === 'cats-runtime');
  const runtimeObservationKey = [
    runtimeService?.status ?? 'missing',
    runtimeService?.error ?? '',
    snapshot.runtime.status ?? 'unknown',
    snapshot.runtime.summary ?? '',
    snapshot.runtime.providerSummary?.status ?? 'unknown',
    snapshot.runtime.providerSummary?.summary ?? '',
  ].join('|');
  const previousRuntimeService = previousSnapshot?.services.find((service) => service.name === 'cats-runtime');
  const previousRuntimeObservationKey = previousSnapshot
    ? [
      previousRuntimeService?.status ?? 'missing',
      previousRuntimeService?.error ?? '',
      previousSnapshot.runtime.status ?? 'unknown',
      previousSnapshot.runtime.summary ?? '',
      previousSnapshot.runtime.providerSummary?.status ?? 'unknown',
      previousSnapshot.runtime.providerSummary?.summary ?? '',
    ].join('|')
    : null;
  if (runtimeObservationKey !== previousRuntimeObservationKey) {
    diagnosticsState = appendRuntimeEvent(diagnosticsState, createDesktopBootstrapEvent({
      layer: 'runtime',
      kind: runtimeService?.status === 'failed'
        ? 'runtime_service_unavailable_observed'
        : 'runtime_status_observed',
      timestamp: snapshot.timestamp,
      attemptId,
      summary: runtimeService?.error
        ?? snapshot.runtime.providerSummary?.summary
        ?? snapshot.runtime.summary
        ?? 'Observed a runtime status change.',
      status: runtimeService?.status === 'failed'
        ? 'unavailable'
        : toDesktopBootstrapStatus(snapshot.runtime.status, 'info'),
      context: {
        serviceStatus: runtimeService?.status ?? null,
        healthStatus: snapshot.runtime.status,
        providerStatus: snapshot.runtime.providerSummary?.status ?? null,
        exitCode: runtimeService?.exitCode ?? null,
        lastOutput: runtimeService?.lastOutput ?? null,
      },
      reference: runtimeService
        ? {
          artifactPath: runtimeService.logPath ?? undefined,
          route: snapshot.runtime.diagnosticsUrl,
        }
        : null,
    }));
  }
}

function buildDiagnosticsState(snapshot: DesktopBootstrapSnapshot): DesktopHostDiagnosticsState | null {
  if (!diagnosticsState) {
    return null;
  }

  let nextState = updateServiceLogs(
    diagnosticsState,
    buildServiceLogs(snapshot),
    snapshot.timestamp,
  );

  const runtimeFallback = {
    status: snapshot.runtime.status
      ? toDesktopBootstrapStatus(snapshot.runtime.status, 'info')
      : snapshot.services.some((service) => service.name === 'cats-runtime' && service.status === 'failed')
        ? 'unavailable'
        : 'info',
    summary: snapshot.runtime.providerSummary?.summary
      ?? snapshot.runtime.summary
      ?? 'Runtime diagnostics are still loading.',
  } as const;
  const hostFallback = {
    status: snapshot.status,
    summary: snapshot.summary,
  } as const;

  nextState = {
    ...nextState,
    aggregation: buildDesktopAggregationBundle({
      generatedAt: snapshot.timestamp,
      attemptId: nextState.activeAttemptId,
      runtimeEvents: nextState.runtimeEvents,
      product: nextState.product,
      hostEvents: nextState.hostEvents,
      runtimeFallback,
      hostFallback,
    }),
    updatedAt: snapshot.timestamp,
  };

  diagnosticsState = nextState;
  return nextState;
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
    diagnostics: snapshot.diagnostics,
  }).catch((error) => {
    process.stderr.write(`Failed to persist desktop host state: ${error instanceof Error ? error.message : String(error)}\n`);
  });
}

function publishSnapshot(snapshot: DesktopBootstrapSnapshot): DesktopBootstrapSnapshot {
  recordSnapshotTransitions(snapshot);
  const diagnostics = buildDiagnosticsState(snapshot);
  const enriched: DesktopBootstrapSnapshot = {
    ...snapshot,
    background: backgroundState ?? snapshot.background,
    updates: updateState ?? snapshot.updates,
    packaging: packagingState ?? snapshot.packaging,
    setup: setupState ?? snapshot.setup,
    diagnostics,
    hostStatePath: hostConfig?.paths.hostStatePath ?? snapshot.hostStatePath,
  };
  latestSnapshot = enriched;
  trayController?.updateMenu(resolveDesktopTrayMenuState(enriched));
  writePersistedHostState(enriched);
  mainWindow?.webContents.send('cats-host:snapshot', enriched);
  return enriched;
}

function resolveDesktopTrayMenuState(snapshot: DesktopBootstrapSnapshot) {
  return buildElectronTrayMenuState({
    phase: snapshot.phase,
    summary: snapshot.summary,
    setupCompleteAt: snapshot.app.setupCompleteAt,
    fallbackSetupCompleteAt: latestPersistedSetupState.setupCompleteAt,
    actions: snapshot.actions,
    products: latestAppShellPayload?.products,
  });
}

function isSystemTrayEnabled(): boolean {
  if (!hostConfig) {
    return false;
  }
  return hostConfig.background.trayEnabled
    && hostConfig.background.keepServicesRunning
    && hostConfig.background.closeBehavior === 'minimize_to_tray'
    && latestDesktopStartupPreferences.systemTrayEnabled;
}

function resolveEffectiveBackgroundPreferences(): Pick<
  DesktopBackgroundState,
  'trayEnabled' | 'keepServicesRunning' | 'closeBehavior'
> {
  const trayEnabled = isSystemTrayEnabled();
  return {
    trayEnabled,
    keepServicesRunning: trayEnabled,
    closeBehavior: trayEnabled ? 'minimize_to_tray' : 'quit',
  };
}

function applyEffectiveBackgroundPreferences(
  state: DesktopBackgroundState,
): DesktopBackgroundState {
  return {
    ...state,
    ...resolveEffectiveBackgroundPreferences(),
  };
}

function updateBackgroundState(
  update: Partial<DesktopBackgroundState>,
): void {
  if (!backgroundState || !hostConfig) {
    return;
  }
  backgroundState = applyEffectiveBackgroundPreferences({
    ...backgroundState,
    ...update,
  });
}

async function syncBackgroundPreferencesState(): Promise<void> {
  if (!backgroundState) {
    return;
  }
  const shouldRevealWindow = !isSystemTrayEnabled() && backgroundState.mode === 'background';
  if (shouldRevealWindow) {
    await showMainWindow();
  }
  backgroundState = applyEffectiveBackgroundPreferences({
    ...backgroundState,
    ...(shouldRevealWindow
      ? {
          mode: 'foreground',
          windowVisible: mainWindow?.isVisible() ?? backgroundState.windowVisible,
          lastHiddenAt: null,
        }
      : {}),
  });
}

async function showMainWindow(url?: string): Promise<void> {
  if (!mainWindow) {
    return;
  }
  const nextUrl = url ?? (
    hostConfig
      ? resolveDesktopWindowRevealNavigation(latestSnapshot, {
        appBaseUrl: hostConfig.appBaseUrl,
        bootstrapPageVisible,
      })
      : null
  );
  if (nextUrl) {
    await mainWindow.loadURL(validateDesktopUrl(nextUrl, {
      allowedHosts: hostConfig ? [hostConfig.appHost] : null,
    }));
    bootstrapPageVisible = false;
    bootstrapWindowRevealRequested = false;
  } else if (!url && bootstrapPageVisible) {
    bootstrapWindowRevealRequested = true;
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
  if (!mainWindow || !trayController) {
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

function buildTrayControllerOptions(): Parameters<typeof createDesktopTrayController>[0] {
  return {
    getWindow: () => mainWindow,
    onShowWindow: async () => {
      await showMainWindow();
    },
    onNavigate: async (path) => {
      if (hostConfig) {
        await showMainWindow(`${hostConfig.appBaseUrl}${path}`);
      }
    },
    onRunAction: async (actionId) => {
      await runHostAction(actionId);
    },
    onQuit: () => {
      void shutdownHost();
    },
  };
}

async function syncTrayController(): Promise<void> {
  if (!isSystemTrayEnabled()) {
    const activeTrayController = trayController;
    trayController = null;
    activeTrayController?.dispose();
    return;
  }

  if (!trayController) {
    trayController = await createDesktopTrayController(buildTrayControllerOptions());
  }
  if (latestSnapshot) {
    trayController.updateMenu(resolveDesktopTrayMenuState(latestSnapshot));
  }
}

function isDesktopSetupHelperMode(value: unknown): value is DesktopSetupHelperMode {
  return value === 'check' || value === 'apply' || value === 'upgrade' || value === 'force';
}

function resolveHostPackagingPlatforms(
  platform: NodeJS.Platform = process.platform,
): DesktopPackagingPlatform[] | undefined {
  switch (platform) {
    case 'win32':
      return ['windows'];
    case 'darwin':
      return ['macos'];
    case 'linux':
      return ['linux'];
    default:
      return undefined;
  }
}

function buildHostPackagingPlan(
  config: DesktopHostConfig,
  generatedAt: Date = new Date(),
): DesktopPackagingPlan {
  return createDesktopPackagingPlan(config, {
    generatedAt,
    outputRoot: config.paths.packagingOutputRoot,
    platforms: resolveHostPackagingPlatforms(),
  });
}

function resolveCurrentPackagingPlan(config: DesktopHostConfig): DesktopPackagingPlan {
  return packagingState ?? buildHostPackagingPlan(config);
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
    appHealth: latestAppHealthPayload,
    appShell: latestAppShellPayload,
    runtimeHealth: latestRuntimeHealthPayload
      ? normalizeRuntimeHealthPayload(latestRuntimeHealthPayload)
      : null,
    providerDiagnostics: latestProviderDiagnosticsPayload,
    persistedSetupCompleteAt: latestPersistedSetupState.setupCompleteAt,
    persistedProductSetupCompleted: latestPersistedSetupState.productSetupCompleted,
    lastError,
    background: backgroundState ?? undefined,
    updates: updateState ?? undefined,
    packaging: packagingState ?? undefined,
    setup: setupState ?? undefined,
    hostStatePath: hostConfig.paths.hostStatePath,
  });
}

async function refreshBootstrapSnapshot(
  persistedSetup: PersistedSetupCompletionState | null = null,
): Promise<DesktopBootstrapSnapshot> {
  if (!hostConfig || !supervisor) {
    throw new Error('Desktop host is not initialized.');
  }

  const effectivePersistedSetup = persistedSetup
    ?? await readPersistedSetupCompletionState(hostConfig.paths.appStatePath);
  latestPersistedSetupState = effectivePersistedSetup;
  const skipStartupProviderReprobe = Boolean(
    effectivePersistedSetup.setupCompleteAt || effectivePersistedSetup.productSetupCompleted,
  );

  const [
    appHealth,
    appShell,
    runtimeHealth,
    providerDiagnostics,
    productDiagnostics,
  ] = await Promise.allSettled([
    fetchJson<AppHealthPayload>(`${hostConfig.appBaseUrl}/health`),
    fetchJson<AppShellPayload>(`${hostConfig.appBaseUrl}/api/app-shell`),
    fetchJson<RuntimeDiagnosticsHealthPayload | ReadinessPayload>(
      skipStartupProviderReprobe
        ? `${hostConfig.runtimeBaseUrl}/health`
        : `${hostConfig.runtimeBaseUrl}/diagnostics/health`,
    ),
    skipStartupProviderReprobe
      ? Promise.resolve<RuntimeProviderDiagnosticsPayload | null>(null)
      : fetchJson<RuntimeProviderDiagnosticsPayload>(`${hostConfig.runtimeBaseUrl}/diagnostics/providers`),
    fetchJson<ProductBootstrapDiagnosticsPayload>(`${hostConfig.appBaseUrl}/api/platform/bootstrap-diagnostics`),
  ]);

  if (appHealth.status === 'fulfilled') {
    latestAppHealthPayload = appHealth.value;
  }
  if (appShell.status === 'fulfilled') {
    latestAppShellPayload = appShell.value;
  }
  if (runtimeHealth.status === 'fulfilled') {
    latestRuntimeHealthPayload = runtimeHealth.value;
  }
  if (providerDiagnostics.status === 'fulfilled') {
    latestProviderDiagnosticsPayload = providerDiagnostics.value;
  }

  if (diagnosticsState && productDiagnostics.status === 'fulfilled') {
    diagnosticsState = {
      ...diagnosticsState,
      product: normalizeProductDiagnosticsPayload(productDiagnostics.value),
      updatedAt: new Date().toISOString(),
    };
  }

  return buildDesktopBootstrapSnapshot({
    config: hostConfig,
    services: supervisor.getSnapshots(),
    appHealth: appHealth.status === 'fulfilled' ? appHealth.value : null,
    appShell: appShell.status === 'fulfilled' ? appShell.value : null,
    runtimeHealth: runtimeHealth.status === 'fulfilled'
      ? normalizeRuntimeHealthPayload(runtimeHealth.value)
      : null,
    providerDiagnostics: providerDiagnostics.status === 'fulfilled'
      ? providerDiagnostics.value
      : null,
    persistedSetupCompleteAt: effectivePersistedSetup.setupCompleteAt,
    persistedProductSetupCompleted: effectivePersistedSetup.productSetupCompleted,
    background: backgroundState ?? undefined,
    updates: updateState ?? undefined,
    packaging: packagingState ?? undefined,
    setup: setupState ?? undefined,
    hostStatePath: hostConfig.paths.hostStatePath,
  });
}

function hasPersistedProductSetupCompletion(
  persistedSetup: PersistedSetupCompletionState | null = null,
): boolean {
  if (persistedSetup?.productSetupCompleted) {
    return true;
  }

  const productEvents = diagnosticsState?.product?.events ?? [];
  return productEvents.some((event) => event.kind === 'setup_completed' && event.status === 'ok');
}

async function maybeOpenApp(snapshot: DesktopBootstrapSnapshot): Promise<void> {
  if (!mainWindow || !hostConfig) {
    return;
  }
  const nextUrl = resolveDesktopBootstrapNavigation(snapshot, {
    appBaseUrl: hostConfig.appBaseUrl,
    showWindowOnStartup: shouldNavigateDesktopBootstrap({
      showWindowOnStartup: startupLaunchContext?.showWindowOnStartup !== false,
      windowRevealRequested: bootstrapWindowRevealRequested,
    }),
  });
  if (!nextUrl) {
    return;
  }
  await showMainWindow(nextUrl);
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
    const persistedSetup = hostConfig
      ? await readPersistedSetupCompletionState(hostConfig.paths.appStatePath)
      : null;

    if (restartServices) {
      await supervisor.stopAll();
    }

    const attemptTimestamp = new Date();
    diagnosticsState = {
      ...(diagnosticsState ?? createEmptyDesktopDiagnosticsState(['cats-runtime', 'cats-platform'])),
      activeAttemptId: createBootstrapAttemptId(attemptTimestamp),
      updatedAt: attemptTimestamp.toISOString(),
    };

    publishSnapshot(buildSnapshot(null));
    await supervisor.startAll();
    publishSnapshot(buildDesktopBootstrapSnapshot({
      config: hostConfig,
      services: supervisor.getSnapshots(),
      persistedSetupCompleteAt: persistedSetup?.setupCompleteAt ?? null,
      persistedProductSetupCompleted: persistedSetup?.productSetupCompleted ?? false,
    }));
    const preAuditSnapshot = publishSnapshot(await refreshBootstrapSnapshot(persistedSetup));
    await maybePrimeSetupAudit(preAuditSnapshot, persistedSetup);

    const snapshot = publishSnapshot(await refreshBootstrapSnapshot(persistedSetup));
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
  if (actionId === 'resume_setup') {
    await resumeSetupAction();
    return latestSnapshot ?? await refreshBootstrapSnapshot();
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
    extraArguments?: string[];
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
  if (diagnosticsState) {
    diagnosticsState = appendHostEvent(diagnosticsState, createDesktopBootstrapEvent({
      layer: 'host',
      kind: 'helper_run_completed',
      timestamp: result.completedAt ?? result.startedAt,
      attemptId: diagnosticsState.activeAttemptId,
      summary: result.summary,
      status: result.runState === 'failed'
        ? 'unavailable'
        : result.status === 'ready'
          ? 'ok'
          : result.restartRequired || result.interruptions.length > 0
            ? 'degraded'
            : 'info',
      context: {
        helperId: result.helperId,
        mode: result.mode,
        runState: result.runState,
        status: result.status,
        restartRequired: result.restartRequired,
      },
      error: toDesktopBootstrapError(result.error),
      reference: {
        artifactPath: hostConfig.paths.hostStatePath,
      },
    }));
  }
  publishSnapshot(await refreshBootstrapSnapshot());
  return await getSetupSnapshot();
}

async function maybePrimeSetupAudit(
  snapshot: DesktopBootstrapSnapshot,
  persistedSetup: PersistedSetupCompletionState | null = null,
): Promise<void> {
  if (!hostConfig) {
    return;
  }
  if (!shouldAutoRunSetupAudit(setupState, {
    setupCompleteAt: snapshot.app.setupCompleteAt ?? persistedSetup?.setupCompleteAt ?? null,
    productSetupCompleted: hasPersistedProductSetupCompletion(persistedSetup),
  })) {
    return;
  }
  const setupAuditAction = resolveDefaultSetupAuditAction(hostConfig);
  if (!setupAuditAction) {
    return;
  }

  await runSetupAction({
    helperId: setupAuditAction.helperId,
    mode: 'check',
    extraArguments: setupAuditAction.extraArguments,
  });
}

async function resumeSetupAction(): Promise<DesktopSetupSnapshot> {
  const snapshot = await getSetupSnapshot();
  if (!snapshot.resumeAction) {
    throw new Error('No resumable packaged setup action is currently available.');
  }

  return await runSetupAction({
    helperId: snapshot.resumeAction.helperId,
    mode: snapshot.resumeAction.mode,
  });
}

async function createMainWindow(
  config: DesktopHostConfig,
  options: {
    showWindowOnStartup: boolean;
  },
): Promise<BrowserWindow> {
  const windowIconPath = resolveDesktopWindowIconPath(app.getAppPath());
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 700,
    show: false,
    title: 'Cats',
    backgroundColor: '#f5f1e8',
    ...(windowIconPath ? { icon: windowIconPath } : {}),
    ...resolveDesktopWindowChromeOptions(),
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

  applyDesktopWindowChrome(window);

  const showBootstrapWindow = () => {
    if (!options.showWindowOnStartup || window.isDestroyed() || window.isVisible()) {
      return;
    }
    window.show();
  };

  window.webContents.once('did-finish-load', showBootstrapWindow);
  window.once('ready-to-show', showBootstrapWindow);

  bootstrapPageVisible = true;
  await window.loadURL(encodeDataUrl(buildDesktopBootstrapPage()));
  return window;
}

async function shutdownHost(): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  try {
    const activeTrayController = trayController;
    trayController = null;
    activeTrayController?.dispose();
    await supervisor?.stopAll();
  } finally {
    app.exit();
  }
}

async function main(): Promise<void> {
  loadDesktopEnvFile();

  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  app.setPath('userData', resolveDesktopUserDataDir(app.getPath('appData')));
  await app.whenReady();
  const nodeProcess = process as NodeJS.Process & { resourcesPath?: string };

  hostConfig = resolveDesktopHostConfig({
    userDataDir: app.getPath('userData'),
    catsHomeDir: resolveCatsHomeDir(),
    packaged: app.isPackaged,
    resourcesPath: nodeProcess.resourcesPath,
  });
  latestDesktopStartupPreferences = await readDesktopStartupPreferences(hostConfig.paths.appStatePath);
  await syncDesktopStartupPreferences(app, latestDesktopStartupPreferences);
  startupLaunchContext = resolveDesktopStartupLaunchContext({
    argv: process.argv,
    wasOpenedAtLogin: process.platform === 'darwin'
      ? app.getLoginItemSettings().wasOpenedAtLogin === true
      : false,
    preferences: latestDesktopStartupPreferences,
    background: hostConfig.background,
  });
  latestPersistedSetupState = await readPersistedSetupCompletionState(hostConfig.paths.appStatePath);
  stateStore = new DesktopHostStateStore(hostConfig.paths.hostStatePath);
  {
    const defaultBackground = applyEffectiveBackgroundPreferences(
      createDesktopBackgroundState(hostConfig),
    );
    const defaultUpdates = createDefaultDesktopUpdateState(hostConfig.update);
    const defaultPackaging = buildHostPackagingPlan(hostConfig);
    const defaultSetup = createEmptyDesktopSetupState();
    const restoredState = await stateStore.load(hostConfig, {
      background: defaultBackground,
      updates: defaultUpdates,
      packaging: defaultPackaging,
      setup: defaultSetup,
    });
    backgroundState = applyEffectiveBackgroundPreferences(
      restoredState?.background ?? defaultBackground,
    );
    if (startupLaunchContext && !startupLaunchContext.showWindowOnStartup) {
      backgroundState = {
        ...backgroundState,
        mode: 'background',
        windowVisible: false,
        lastHiddenAt: new Date().toISOString(),
      };
    }
    updateState = restoredState?.updates ?? defaultUpdates;
    packagingState = defaultPackaging;
    setupState = normalizePlatformShellSetupState(
      restoredState?.setup ?? defaultSetup,
      Boolean(
        latestPersistedSetupState.setupCompleteAt
        || latestPersistedSetupState.productSetupCompleted
      ),
    );
    diagnosticsState = restoredState?.diagnostics ?? createEmptyDesktopDiagnosticsState([
      'cats-runtime',
      'cats-platform',
    ]);
  }
  supervisor = new ManagedServiceSupervisor(hostConfig, {
    onStateChange: () => {
      if (hostConfig && supervisor) {
        publishSnapshot(buildSnapshot(null));
      }
    },
  });
  latestSnapshot = buildSnapshot(null);

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
  ipcMain.handle('cats-host:resume-setup', async () => {
    return await resumeSetupAction();
  });
  ipcMain.handle('cats-host:update-desktop-preferences', async (_event, payload: unknown) => {
    if (
      typeof payload !== 'object'
      || payload === null
      || typeof (payload as { startAtLogin?: unknown }).startAtLogin !== 'boolean'
      || typeof (payload as { openWindowOnStartup?: unknown }).openWindowOnStartup !== 'boolean'
      || typeof (payload as { systemTrayEnabled?: unknown }).systemTrayEnabled !== 'boolean'
    ) {
      throw new Error('Invalid desktop startup preferences payload.');
    }
    if (!hostConfig) {
      throw new Error('Desktop host is not initialized.');
    }

    latestDesktopStartupPreferences = await updateDesktopStartupPreferences(
      hostConfig.paths.appStatePath,
      {
        startAtLogin: (payload as { startAtLogin: boolean }).startAtLogin,
        openWindowOnStartup: (payload as { openWindowOnStartup: boolean }).openWindowOnStartup,
        systemTrayEnabled: (payload as { systemTrayEnabled: boolean }).systemTrayEnabled,
      },
    );
    await syncDesktopStartupPreferences(app, latestDesktopStartupPreferences);
    startupLaunchContext = resolveDesktopStartupLaunchContext({
      argv: process.argv,
      wasOpenedAtLogin: process.platform === 'darwin'
        ? app.getLoginItemSettings().wasOpenedAtLogin === true
        : process.argv.includes(DESKTOP_LAUNCH_AT_LOGIN_ARG),
      preferences: latestDesktopStartupPreferences,
      background: hostConfig.background,
    });
    await syncBackgroundPreferencesState();
    await syncTrayController();
    if (latestSnapshot) {
      publishSnapshot(buildSnapshot(null));
    }
    return latestDesktopStartupPreferences;
  });
  ipcMain.handle('cats-host:update-platform-shell', async (_event, payload: unknown) => {
    const nextState = applyDesktopHostPlatformShellUpdate({
      appShell: latestAppShellPayload,
      persistedSetup: latestPersistedSetupState,
      providerDiagnostics: latestProviderDiagnosticsPayload,
      setup: setupState ?? createEmptyDesktopSetupState(),
    }, parseDesktopHostPlatformShellUpdate(payload));

    latestAppShellPayload = nextState.appShell;
    latestPersistedSetupState = nextState.persistedSetup;
    latestProviderDiagnosticsPayload = nextState.providerDiagnostics;
    setupState = nextState.setup;

    publishSnapshot(buildSnapshot(null));
  });

  mainWindow = await createMainWindow(hostConfig, {
    showWindowOnStartup: startupLaunchContext?.showWindowOnStartup !== false,
  });
  await syncTrayController();

  app.on('before-quit', (event) => {
    if (!shuttingDown) {
      event.preventDefault();
      void shutdownHost();
    }
  });
  mainWindow.on('close', (event) => {
    if (!shuttingDown && isSystemTrayEnabled() && trayController) {
      event.preventDefault();
      hideMainWindowToTray();
    }
  });
  app.on('window-all-closed', () => {
    if (!trayController) {
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
