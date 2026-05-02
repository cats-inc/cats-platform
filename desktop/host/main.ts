import { dirname, join } from 'node:path';

import { app, BrowserWindow, ipcMain, session, shell, systemPreferences } from 'electron';

import { buildDesktopBootstrapPage } from './bootstrapPage.js';
import {
  resolveDesktopBootstrapNavigation,
  shouldRevealDesktopBootstrapRecovery,
  shouldNavigateDesktopBootstrap,
  resolveDesktopWindowRevealNavigation,
  shouldAllowDesktopBootstrapWindowNavigation,
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
  DesktopCliInventoryError,
  DesktopHostDiagnosticsState,
  DesktopHostActionId,
  DesktopManagedServiceLog,
  DesktopPackagingPlatform,
  DesktopProductBootstrapDiagnostics,
  DesktopPackagingPlan,
  DesktopSetupHelperMode,
  DesktopSetupSnapshot,
  DesktopSetupState,
  DesktopScreenshotCaptureRequest,
  DesktopScreenshotCaptureResult,
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
import {
  isDesktopBootstrapLoadingPhase,
  resolveDesktopBootstrapError,
  shouldAttemptDesktopLateReadyRecovery,
} from './startupRecovery.js';
import { resolveDefaultSetupAuditAction } from './setupAudit.js';
import {
  buildDesktopCliInventoryFromRuntime,
  type RuntimeCliInventoryProbe,
} from './cliInventoryProbe.js';
import {
  createDesktopTrayController,
  type DesktopTrayController,
} from './tray.js';
import {
  buildDesktopTrayMenuState as buildElectronTrayMenuState,
  buildDesktopTrayQuittingMenuState,
} from './trayMenu.js';
import {
  applyDesktopHostPlatformShellUpdate,
  normalizePlatformShellSetupState,
  parseDesktopHostPlatformShellUpdate,
} from './platformShellUpdate.js';
import { enableDesktopMobilePairingEnv } from './mobilePairingEnv.js';
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
import { loadDesktopEnvFiles } from './env.js';
import {
  assertMainWindowScreenshotIpcSender,
  captureScreenshotRegion,
  DESKTOP_SCREENSHOT_IPC_CHANNEL,
  parseDesktopScreenshotCaptureRequest,
} from './screenshotCapture.js';
import {
  createElectronScreenshotCaptureDependencies,
  createElectronScreenshotCropDependencies,
  resolveElectronScreenshotWorkAreas,
} from './screenshotElectronAdapter.js';
import {
  createElectronScreenshotOverlayWindowFactory,
} from './screenshotElectronOverlay.js';
import {
  createDesktopScreenshotFilename,
} from './screenshotFilename.js';
import {
  captureDesktopDisplaySnapshots,
  type DesktopScreenshotDisplaySnapshot,
} from './screenshotNativeCapture.js';
import {
  openScreenshotOverlayWindows,
} from './screenshotOverlayController.js';
import {
  DESKTOP_SCREENSHOT_OVERLAY_CANCEL_CHANNEL,
  DESKTOP_SCREENSHOT_OVERLAY_COMPLETE_CHANNEL,
  DESKTOP_SCREENSHOT_OVERLAY_GET_SNAPSHOT_CHANNEL,
  parseDesktopScreenshotOverlayCancelReason,
  parseDesktopScreenshotOverlayDisplayId,
  parseDesktopScreenshotOverlaySelectionResult,
} from './screenshotOverlayIpc.js';
import {
  DesktopScreenshotOverlaySession,
} from './screenshotOverlaySession.js';
import {
  resolveDesktopScreenshotPermissionResult,
  type DesktopScreenshotMediaAccessStatus,
} from './screenshotPermission.js';
import {
  buildScreenshotOverlayWindowPlans,
} from './screenshotOverlayWindows.js';
import {
  runDesktopScreenshotRegionCapture,
  type DesktopScreenshotOverlayController,
} from './screenshotRegionCapture.js';
import {
  captureWlrootsNativeScreenshotRegion,
  isLikelyWlrootsScreenshotSession,
} from './screenshotWlrootsCapture.js';
import { createExternalDesktopOpenDeduper } from './externalOpenGate.js';
import {
  assertMainWindowVoiceCaptureIpcSender,
  DESKTOP_VOICE_CAPTURE_CANCEL_CHANNEL,
  DESKTOP_VOICE_CAPTURE_EVENT_CHANNEL,
  DESKTOP_VOICE_CAPTURE_START_CHANNEL,
  DESKTOP_VOICE_CAPTURE_STOP_CHANNEL,
  DesktopVoiceCaptureController,
  parseVoiceCaptureSessionId,
  parseVoiceCaptureStartOptions,
  shouldAllowDesktopRendererPermission,
} from './voiceCapture.js';

let mainWindow: BrowserWindow | null = null;
let hostConfig: DesktopHostConfig | null = null;
let supervisor: ManagedServiceSupervisor | null = null;
let latestSnapshot: DesktopBootstrapSnapshot | null = null;
let latestAppHealthPayload: AppHealthPayload | null = null;
let latestAppShellPayload: AppShellPayload | null = null;
let latestRuntimeHealthPayload: RuntimeDiagnosticsHealthPayload | ReadinessPayload | null = null;
let latestProviderDiagnosticsPayload: RuntimeProviderDiagnosticsPayload | null = null;
let latestCliInventoryProbe: RuntimeCliInventoryProbe | null = null;
let latestPersistedSetupState: PersistedSetupCompletionState = {
  setupCompleteAt: null,
  productSetupCompleted: false,
};
let bootstrapPromise: Promise<DesktopBootstrapSnapshot> | null = null;
let latestBootstrapError: string | null = null;
let latestCliInventoryError: DesktopCliInventoryError | null = null;
let lateReadyRecoveryPromise: Promise<void> | null = null;
let retryCliScanPromise: Promise<DesktopBootstrapSnapshot> | null = null;
let runtimeCliInventoryPollTimer: ReturnType<typeof setTimeout> | null = null;
let runtimeCliInventoryScanPending = false;
let shuttingDown = false;
let shutdownPromise: Promise<void> | null = null;
let exitingAfterShutdown = false;
let trayController: DesktopTrayController | null = null;
let stateStore: DesktopHostStateStore | null = null;
let backgroundState: DesktopBackgroundState | null = null;
let updateState: DesktopUpdateState | null = null;
let packagingState: DesktopPackagingPlan | null = null;
let setupState: DesktopSetupState | null = null;
let diagnosticsState: DesktopHostDiagnosticsState | null = null;
let bootstrapPageVisible = false;
let bootstrapWindowRevealRequested = false;
let backgroundSetupAuditPromise: Promise<void> | null = null;
let startupLaunchContext: DesktopStartupLaunchContext | null = null;
let latestDesktopStartupPreferences: DesktopStartupPreferences = {
  startAtLogin: true,
  openWindowOnStartup: false,
  systemTrayEnabled: true,
};
let activeScreenshotOverlaySession: DesktopScreenshotOverlaySession | null = null;
let voiceCaptureController: DesktopVoiceCaptureController | null = null;
const RUNTIME_SETUP_STATE_TIMEOUT_MS = 2_000;
const RUNTIME_SETUP_SCAN_TIMEOUT_MS = 30_000;
const RUNTIME_BOOTSTRAP_SETUP_SCAN_TIMEOUT_MS = 8_000;
const RUNTIME_CLI_INVENTORY_POLL_INTERVAL_MS = 2_000;
const RUNTIME_PROVIDER_DIAGNOSTICS_TIMEOUT_MS = 5_000;
const BOOTSTRAP_CLI_INVENTORY_FAILURE_SUMMARY =
  'Cats could not confirm the local CLI inventory. Retry the startup check.';
const externalDesktopOpenDeduper = createExternalDesktopOpenDeduper();

function clearCliInventoryError(): void {
  latestCliInventoryError = null;
  if (latestBootstrapError === BOOTSTRAP_CLI_INVENTORY_FAILURE_SUMMARY) {
    latestBootstrapError = null;
  }
}

function createCliInventoryScanFailedError(): DesktopCliInventoryError {
  return {
    kind: 'scan_failed',
    summary: BOOTSTRAP_CLI_INVENTORY_FAILURE_SUMMARY,
  };
}

function isRuntimeCliInventoryScanActive(probe: RuntimeCliInventoryProbe | null): boolean {
  return probe?.state?.status === 'scanning';
}

function isRuntimeCliInventoryScanErrored(probe: RuntimeCliInventoryProbe | null): boolean {
  return probe?.state?.status === 'error';
}

function rememberRuntimeCliInventoryProbe(probe: RuntimeCliInventoryProbe | null): boolean {
  if (!probe) {
    return false;
  }
  if (probe.scan) {
    latestCliInventoryProbe = probe;
    runtimeCliInventoryScanPending = false;
    clearCliInventoryError();
    return true;
  }
  if (isRuntimeCliInventoryScanActive(probe)) {
    runtimeCliInventoryScanPending = true;
  } else if (probe.state) {
    runtimeCliInventoryScanPending = false;
  }
  return false;
}

function clearRuntimeCliInventoryPoll(): void {
  if (runtimeCliInventoryPollTimer) {
    clearTimeout(runtimeCliInventoryPollTimer);
    runtimeCliInventoryPollTimer = null;
  }
}

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

function resolveScreenshotOverlayUrl(config: DesktopHostConfig): string {
  return new URL('/desktop/overlay/index.html', config.appBaseUrl).toString();
}

function resolveScreenshotOverlayPreloadPath(config: DesktopHostConfig): string {
  return join(dirname(config.paths.preloadScript), 'screenshotOverlayPreload.cjs');
}

async function openElectronScreenshotOverlay(
  snapshots: DesktopScreenshotDisplaySnapshot[],
): Promise<DesktopScreenshotOverlayController> {
  if (!hostConfig) {
    throw new Error('Desktop host is not initialized.');
  }
  if (activeScreenshotOverlaySession) {
    throw new Error('A screenshot overlay session is already active.');
  }

  const session = new DesktopScreenshotOverlaySession(
    snapshots,
    createElectronScreenshotCropDependencies(),
  );
  activeScreenshotOverlaySession = session;

  try {
    const windows = await openScreenshotOverlayWindows(
      buildScreenshotOverlayWindowPlans({
        snapshots,
        overlayUrl: resolveScreenshotOverlayUrl(hostConfig),
        preloadPath: resolveScreenshotOverlayPreloadPath(hostConfig),
      }),
      createElectronScreenshotOverlayWindowFactory(),
      {
        onEscape: () => session.cancel('escape'),
        onWindowClosed: () => session.cancel('window_closed'),
      },
    );
    app.focus({ steal: true });

    return {
      waitForResult() {
        return session.waitForResult();
      },
      closeAll() {
        windows.closeAll();
        if (activeScreenshotOverlaySession === session) {
          activeScreenshotOverlaySession = null;
        }
      },
    };
  } catch (error) {
    if (activeScreenshotOverlaySession === session) {
      activeScreenshotOverlaySession = null;
    }
    throw error;
  }
}

async function captureNativeScreenshotRegion(
  _request: DesktopScreenshotCaptureRequest,
): Promise<DesktopScreenshotCaptureResult> {
  try {
    const permissionResult = process.platform === 'darwin'
      ? resolveDesktopScreenshotPermissionResult({
          platform: process.platform,
          mediaAccessStatus: systemPreferences.getMediaAccessStatus(
            'screen',
          ) as DesktopScreenshotMediaAccessStatus,
        })
      : null;
    if (permissionResult) {
      return permissionResult;
    }

    if (isLikelyWlrootsScreenshotSession({
      platform: process.platform,
      env: process.env,
    })) {
      const wlrootsResult = await captureWlrootsNativeScreenshotRegion({
        platform: process.platform,
        env: process.env,
        workAreas: resolveElectronScreenshotWorkAreas(),
        createFilename: createDesktopScreenshotFilename,
      });
      if (wlrootsResult.outcome !== 'platform_unsupported') {
        return wlrootsResult;
      }
    }

    return await runDesktopScreenshotRegionCapture({
      captureDisplaySnapshots() {
        return captureDesktopDisplaySnapshots(
          createElectronScreenshotCaptureDependencies(),
        );
      },
      openOverlay: openElectronScreenshotOverlay,
      createFilename: createDesktopScreenshotFilename,
    });
  } catch (error) {
    return {
      outcome: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function openExternalDesktopUrl(rawUrl: string): Promise<void> {
  const url = validateDesktopUrl(rawUrl);
  if (!externalDesktopOpenDeduper.shouldOpen(url)) {
    return;
  }
  await shell.openExternal(url);
}

function reportExternalUrlOpenFailure(error: unknown): void {
  process.stderr.write(
    `Failed to open external desktop URL: ${error instanceof Error ? error.message : String(error)}\n`,
  );
}

function resolveAllowedAppHosts(config: DesktopHostConfig): string[] {
  const appBaseHost = new URL(config.appBaseUrl).hostname;
  return Array.from(new Set([config.appHost, appBaseHost]));
}

function shouldAllowInAppNavigation(
  rawUrl: string,
  config: DesktopHostConfig,
): boolean {
  try {
    const currentAppUrl = new URL(config.appBaseUrl);
    const nextUrl = new URL(validateDesktopUrl(rawUrl, {
      allowedHosts: resolveAllowedAppHosts(config),
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
    startup: 'startup' in payload ? payload.startup : undefined,
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
  trayController?.updateMenu(
    shuttingDown
      ? buildDesktopTrayQuittingMenuState()
      : resolveDesktopTrayMenuState(enriched),
  );
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
      allowedHosts: hostConfig ? resolveAllowedAppHosts(hostConfig) : null,
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
      if (shuttingDown) {
        return;
      }
      await showMainWindow();
    },
    onNavigate: async (path) => {
      if (shuttingDown) {
        return;
      }
      if (hostConfig) {
        await showMainWindow(`${hostConfig.appBaseUrl}${path}`);
      }
    },
    onRunAction: async (actionId) => {
      if (shuttingDown) {
        return;
      }
      await runHostAction(actionId);
    },
    onQuit: () => {
      void shutdownHost();
    },
    canInteract: () => !shuttingDown,
  };
}

async function syncTrayController(): Promise<void> {
  if (shuttingDown) {
    trayController?.updateMenu(buildDesktopTrayQuittingMenuState());
    return;
  }

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
  return value === 'check'
    || value === 'apply'
    || value === 'upgrade'
    || value === 'force'
    || value === 'uninstall';
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

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T> {
  const response = await fetchWithTimeout(url, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.headers ?? {}),
    },
  }, timeoutMs);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url}.`);
  }
  return await response.json() as T;
}

function shouldRefreshRuntimeCliInventoryProbe(
  probe: RuntimeCliInventoryProbe | null,
  options: { triggerScanIfMissing?: boolean },
): boolean {
  if (options.triggerScanIfMissing !== true) {
    return false;
  }
  if (runtimeCliInventoryScanPending || isRuntimeCliInventoryScanActive(probe)) {
    return false;
  }
  if (!probe?.scan) {
    return true;
  }
  return !probe.scan.providers.some((provider) => provider.available === true);
}

async function fetchRuntimeCliInventoryProbe(
  baseUrl: string,
  options: {
    triggerScanIfMissing?: boolean;
    forceRescan?: boolean;
    setupStateTimeoutMs?: number;
    scanTimeoutMs?: number;
  } = {},
): Promise<RuntimeCliInventoryProbe | null> {
  const setupStateTimeoutMs = options.setupStateTimeoutMs ?? RUNTIME_SETUP_STATE_TIMEOUT_MS;
  const scanTimeoutMs = options.scanTimeoutMs ?? RUNTIME_SETUP_SCAN_TIMEOUT_MS;
  let probe: RuntimeCliInventoryProbe | null = null;
  const shouldReadSetupStateFirst = !options.forceRescan || runtimeCliInventoryScanPending;
  if (shouldReadSetupStateFirst) {
    try {
      probe = await fetchJsonWithTimeout<RuntimeCliInventoryProbe>(`${baseUrl}/setup-state`, {
        method: 'GET',
      }, setupStateTimeoutMs);
    } catch {
      if (options.triggerScanIfMissing !== true) {
        return null;
      }
    }
    if (probe?.scan || isRuntimeCliInventoryScanActive(probe)) {
      return probe;
    }
    if (runtimeCliInventoryScanPending) {
      return probe;
    }
    if (!options.forceRescan && !shouldRefreshRuntimeCliInventoryProbe(probe, options)) {
      return probe;
    }
  }
  // Trigger a fresh scan (none cached before setup, cached zero CLIs, or caller
  // forced rescan after install/uninstall). The runtime exposes scan progress
  // through /setup-state, so a host-side HTTP timeout means "poll later", not
  // "startup failed".
  try {
    runtimeCliInventoryScanPending = true;
    const scanResponse = await fetchWithTimeout(`${baseUrl}/setup-scan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ manual: false }),
    }, scanTimeoutMs);
    if (!scanResponse.ok) {
      runtimeCliInventoryScanPending = false;
      return probe;
    }
  } catch {
    return probe;
  }
  try {
    return await fetchJsonWithTimeout<RuntimeCliInventoryProbe>(`${baseUrl}/setup-state`, {
      method: 'GET',
    }, setupStateTimeoutMs);
  } catch {
    return probe;
  }
}

function isCliMissingBootstrapSnapshot(snapshot: DesktopBootstrapSnapshot): boolean {
  if (hostConfig?.bootstrap.onboardingMode !== 'cli_inventory_gate') {
    return false;
  }
  return Boolean(
    snapshot.phase === 'needs_prerequisites'
      && snapshot.prerequisites?.cliInventory?.source === 'runtime'
      && snapshot.prerequisites.cliInventory.total === 0,
  );
}

function buildSnapshot(lastError?: string | null): DesktopBootstrapSnapshot {
  if (!hostConfig || !supervisor) {
    throw new Error('Desktop host is not initialized.');
  }
  const effectiveLastError = resolveDesktopBootstrapError(
    latestBootstrapError ?? latestCliInventoryError?.summary ?? null,
    lastError,
  );
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
    lastError: effectiveLastError,
    background: backgroundState ?? undefined,
    updates: updateState ?? undefined,
    packaging: packagingState ?? undefined,
    setup: setupState ?? undefined,
    hostStatePath: hostConfig.paths.hostStatePath,
    cliInventory: resolveSnapshotCliInventory(),
    cliInventoryError: latestCliInventoryError,
  });
}

function hasPersistedSetupCompletion(): boolean {
  return Boolean(
    latestPersistedSetupState.setupCompleteAt || latestPersistedSetupState.productSetupCompleted,
  );
}

function resolveSnapshotCliInventory(): ReturnType<typeof buildDesktopCliInventoryFromRuntime> | null {
  if (latestCliInventoryProbe) {
    return buildDesktopCliInventoryFromRuntime(latestCliInventoryProbe);
  }
  if (hostConfig?.bootstrap.onboardingMode === 'setup_status' && !hasPersistedSetupCompletion()) {
    return buildDesktopCliInventoryFromRuntime(null);
  }
  return null;
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
  const setupCompleted = Boolean(
    effectivePersistedSetup.setupCompleteAt || effectivePersistedSetup.productSetupCompleted,
  );
  const shouldReadCliInventory =
    setupCompleted || hostConfig.bootstrap.onboardingMode === 'cli_inventory_gate';
  // /diagnostics/providers is intentionally NOT fetched on the boot critical
  // path — it's not authoritative for any phase decision before setup, and
  // for setup-complete users we kick it off in the background (see
  // scheduleBackgroundBootstrapWork) so a slow provider probe never blocks
  // the window from opening.
  const [
    appHealth,
    appShell,
    runtimeHealth,
    productDiagnostics,
    cliInventoryProbe,
  ] = await Promise.allSettled([
    fetchJson<AppHealthPayload>(`${hostConfig.appBaseUrl}/health`),
    fetchJson<AppShellPayload>(`${hostConfig.appBaseUrl}/api/app-shell`),
    fetchJson<RuntimeDiagnosticsHealthPayload | ReadinessPayload>(`${hostConfig.runtimeBaseUrl}/health`),
    fetchJson<ProductBootstrapDiagnosticsPayload>(`${hostConfig.appBaseUrl}/api/platform/bootstrap-diagnostics`),
    shouldReadCliInventory
      ? fetchRuntimeCliInventoryProbe(hostConfig.runtimeBaseUrl, {
        triggerScanIfMissing: false,
        scanTimeoutMs: setupCompleted
          ? RUNTIME_SETUP_SCAN_TIMEOUT_MS
          : RUNTIME_BOOTSTRAP_SETUP_SCAN_TIMEOUT_MS,
      })
      : Promise.resolve(null),
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
  if (cliInventoryProbe.status === 'fulfilled') {
    rememberRuntimeCliInventoryProbe(cliInventoryProbe.value);
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
    providerDiagnostics: latestProviderDiagnosticsPayload,
    persistedSetupCompleteAt: effectivePersistedSetup.setupCompleteAt,
    persistedProductSetupCompleted: effectivePersistedSetup.productSetupCompleted,
    background: backgroundState ?? undefined,
    updates: updateState ?? undefined,
    packaging: packagingState ?? undefined,
    setup: setupState ?? undefined,
    hostStatePath: hostConfig.paths.hostStatePath,
    cliInventory: resolveSnapshotCliInventory(),
    cliInventoryError: latestCliInventoryError,
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
  }, {
    publishMode: 'bootstrap-only',
    refreshBootstrap: false,
  });
}

function scheduleBackgroundSetupAudit(
  snapshot: DesktopBootstrapSnapshot,
  persistedSetup: PersistedSetupCompletionState | null = null,
): void {
  if (isDesktopBootstrapLoadingPhase(snapshot.phase) || backgroundSetupAuditPromise) {
    return;
  }
  backgroundSetupAuditPromise = maybePrimeSetupAudit(snapshot, persistedSetup)
    .catch((error) => {
      process.stderr.write(
        `Background setup audit failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    })
    .finally(() => {
      backgroundSetupAuditPromise = null;
    });
}

const BACKGROUND_CLI_SCAN_BACKOFF_MS = [2_000, 4_000];

function scheduleRuntimeCliInventoryPoll(options: {
  setupCompleted: boolean;
  delayMs?: number;
}): void {
  if (!hostConfig || runtimeCliInventoryPollTimer || shuttingDown) {
    return;
  }
  runtimeCliInventoryPollTimer = setTimeout(() => {
    runtimeCliInventoryPollTimer = null;
    void pollRuntimeCliInventory(options).catch((error) => {
      process.stderr.write(
        `Background CLI inventory poll failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      scheduleRuntimeCliInventoryPoll(options);
    });
  }, options.delayMs ?? RUNTIME_CLI_INVENTORY_POLL_INTERVAL_MS);
}

async function pollRuntimeCliInventory(options: {
  setupCompleted: boolean;
}): Promise<void> {
  if (!hostConfig) return;
  const probe = await fetchRuntimeCliInventoryProbe(hostConfig.runtimeBaseUrl, {
    triggerScanIfMissing: !runtimeCliInventoryScanPending,
    scanTimeoutMs: options.setupCompleted
      ? RUNTIME_SETUP_SCAN_TIMEOUT_MS
      : RUNTIME_BOOTSTRAP_SETUP_SCAN_TIMEOUT_MS,
  });
  if (rememberRuntimeCliInventoryProbe(probe)) {
    const snapshot = publishSnapshot(buildSnapshot());
    scheduleBackgroundSetupAudit(snapshot, latestPersistedSetupState);
    await maybeOpenApp(snapshot);
    return;
  }
  if (isRuntimeCliInventoryScanErrored(probe)) {
    latestCliInventoryError = createCliInventoryScanFailedError();
    const snapshot = publishSnapshot(buildSnapshot());
    scheduleBackgroundSetupAudit(snapshot, latestPersistedSetupState);
    return;
  }
  scheduleRuntimeCliInventoryPoll(options);
}

async function retryCliInventoryScanInBackground(options: {
  forceRescan: boolean;
  setupCompleted: boolean;
}): Promise<void> {
  if (!hostConfig) return;
  for (let attempt = 0; attempt < BACKGROUND_CLI_SCAN_BACKOFF_MS.length; attempt += 1) {
    if (!hostConfig) return;
    let probe: RuntimeCliInventoryProbe | null = null;
    try {
      probe = await fetchRuntimeCliInventoryProbe(hostConfig.runtimeBaseUrl, {
        triggerScanIfMissing: true,
        forceRescan: attempt === 0 ? options.forceRescan : false,
        scanTimeoutMs: options.setupCompleted
          ? RUNTIME_SETUP_SCAN_TIMEOUT_MS
          : RUNTIME_BOOTSTRAP_SETUP_SCAN_TIMEOUT_MS,
      });
    } catch {
      probe = null;
    }
    if (rememberRuntimeCliInventoryProbe(probe)) {
      try {
        const snapshot = publishSnapshot(buildSnapshot());
        scheduleBackgroundSetupAudit(snapshot, latestPersistedSetupState);
        await maybeOpenApp(snapshot);
      } catch {
        // host may have shut down; ignore
      }
      return;
    }
    const wait = BACKGROUND_CLI_SCAN_BACKOFF_MS[attempt];
    if (typeof wait === 'number') {
      await new Promise<void>((resolve) => setTimeout(resolve, wait));
    }
  }
  if (!options.setupCompleted && latestSnapshot && isDesktopBootstrapLoadingPhase(latestSnapshot.phase)) {
    scheduleRuntimeCliInventoryPoll({
      setupCompleted: options.setupCompleted,
    });
  }
}

async function fetchProviderDiagnosticsInBackground(): Promise<void> {
  if (!hostConfig) return;
  let payload: RuntimeProviderDiagnosticsPayload;
  try {
    payload = await fetchJsonWithTimeout<RuntimeProviderDiagnosticsPayload>(
      `${hostConfig.runtimeBaseUrl}/diagnostics/providers`,
      { method: 'GET' },
      RUNTIME_PROVIDER_DIAGNOSTICS_TIMEOUT_MS,
    );
  } catch {
    // best-effort — leave latestProviderDiagnosticsPayload as-is
    return;
  }
  latestProviderDiagnosticsPayload = payload;
  try {
    publishSnapshot(buildSnapshot());
  } catch {
    // host may have shut down; ignore
  }
}

function scheduleBackgroundBootstrapWork(
  snapshot: DesktopBootstrapSnapshot,
  persistedSetup: PersistedSetupCompletionState | null,
): void {
  const setupCompleted = Boolean(
    snapshot.app.setupCompleteAt
      ?? persistedSetup?.setupCompleteAt
      ?? persistedSetup?.productSetupCompleted,
  );

  // Prerequisite audit — Node / GitHub CLI / npm prefix detection lives in
  // the packaged readiness audit, not in cats-runtime's CLI inventory probe.
  // Fresh users without Node need this signal so the recovery panel can
  // surface install_node_lts before they fail an Install action.
  scheduleBackgroundSetupAudit(snapshot, persistedSetup);

  // CLI inventory is not part of the default first-run gate. We only probe it
  // before setup when the legacy env policy explicitly asks for that gate.
  if (setupCompleted || hostConfig?.bootstrap.onboardingMode === 'cli_inventory_gate') {
    void retryCliInventoryScanInBackground({
      forceRescan: setupCompleted,
      setupCompleted,
    }).catch((error) => {
      process.stderr.write(
        `Background CLI inventory rescan failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    });
  }

  // Provider diagnostics — only meaningful after setup is applied. Best
  // effort, single-shot; failures fall back to "Cats can still open".
  if (setupCompleted) {
    void fetchProviderDiagnosticsInBackground().catch((error) => {
      process.stderr.write(
        `Background provider diagnostics fetch failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    });
  }
}

async function maybeOpenApp(snapshot: DesktopBootstrapSnapshot): Promise<void> {
  if (!mainWindow || !hostConfig) {
    return;
  }
  const windowNavigationAllowed = shouldAllowDesktopBootstrapWindowNavigation({
    bootstrapPageVisible,
    windowRevealRequested: bootstrapWindowRevealRequested,
  });
  const shouldNavigate = shouldNavigateDesktopBootstrap({
    showWindowOnStartup:
      windowNavigationAllowed && startupLaunchContext?.showWindowOnStartup !== false,
    windowRevealRequested: bootstrapWindowRevealRequested,
  });
  const nextUrl = resolveDesktopBootstrapNavigation(snapshot, {
    appBaseUrl: hostConfig.appBaseUrl,
    showWindowOnStartup: shouldNavigate,
  });
  if (nextUrl) {
    await showMainWindow(nextUrl);
    return;
  }
  if (shouldRevealDesktopBootstrapRecovery(snapshot, {
    showWindowOnStartup:
      windowNavigationAllowed && startupLaunchContext?.showWindowOnStartup !== false,
    windowRevealRequested: bootstrapWindowRevealRequested,
  })) {
    await ensureBootstrapPageVisible();
    await showMainWindow();
  }
}

async function maybeRecoverFromLateReadyStateChange(): Promise<void> {
  if (!hostConfig || !supervisor || lateReadyRecoveryPromise) {
    return;
  }
  const services = supervisor.getSnapshots();
  if (!shouldAttemptDesktopLateReadyRecovery({
    lastError: latestBootstrapError,
    services,
  })) {
    return;
  }

  lateReadyRecoveryPromise = (async () => {
    try {
      const snapshot = await refreshBootstrapSnapshot();
      if (isDesktopBootstrapLoadingPhase(snapshot.phase)) {
        publishSnapshot(buildSnapshot());
        return;
      }

      latestBootstrapError = null;
      publishSnapshot(snapshot);
      await maybeOpenApp(snapshot);
    } catch (error) {
      process.stderr.write(
        `Failed to recover desktop host after late service readiness: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    } finally {
      lateReadyRecoveryPromise = null;
    }
  })();

  await lateReadyRecoveryPromise;
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
    latestBootstrapError = null;
    latestCliInventoryError = null;
    runtimeCliInventoryScanPending = false;
    clearRuntimeCliInventoryPoll();
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
    const snapshot = publishSnapshot(await refreshBootstrapSnapshot(persistedSetup));
    await maybeOpenApp(snapshot);
    scheduleBackgroundBootstrapWork(snapshot, persistedSetup);
    return snapshot;
  })().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    latestBootstrapError = message;
    const snapshot = publishSnapshot(buildSnapshot());
    return maybeOpenApp(snapshot).then(() => snapshot);
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
  if (actionId === 'retry_cli_scan') {
    retryCliScanPromise ??= runRetryCliScanAction()
      .finally(() => {
        retryCliScanPromise = null;
      });
    return await retryCliScanPromise;
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
    const snapshot = latestSnapshot ?? await refreshBootstrapSnapshot();
    if (isCliMissingBootstrapSnapshot(snapshot)) {
      return snapshot;
    }
    await showMainWindow(`${hostConfig.appBaseUrl}/setup`);
    return snapshot;
  }
  if (actionId === 'open_chat') {
    const snapshot = latestSnapshot ?? await refreshBootstrapSnapshot();
    if (isCliMissingBootstrapSnapshot(snapshot)) {
      return snapshot;
    }
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
    dryRun?: boolean;
  },
  options: {
    publishMode?: 'always' | 'bootstrap-only';
    refreshBootstrap?: boolean;
  } = {},
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
  // After any helper run that may have changed CLI inventory, force a
  // runtime rescan so the next snapshot reflects the new state. We don't
  // depend on the helper's runState — the rescan itself is authoritative.
  const setupCompleted = hasPersistedSetupCompletion();
  const shouldRefreshCliInventory =
    action.mode !== 'check'
      && shouldRefreshCliInventoryAfterSetupAction(action.helperId)
      && (setupCompleted || hostConfig.bootstrap.onboardingMode === 'cli_inventory_gate');
  if (shouldRefreshCliInventory) {
    const refreshedProbe = await fetchRuntimeCliInventoryProbe(hostConfig.runtimeBaseUrl, {
      forceRescan: true,
    });
    if (!rememberRuntimeCliInventoryProbe(refreshedProbe)) {
      scheduleRuntimeCliInventoryPoll({
        setupCompleted,
      });
    }
  }
  const shouldPublish = options.publishMode !== 'bootstrap-only' || bootstrapPageVisible;
  if (options.refreshBootstrap === false) {
    if (shouldPublish) {
      publishSnapshot(buildSnapshot());
    }
  } else {
    const snapshot = await refreshBootstrapSnapshot();
    if (shouldPublish) {
      publishSnapshot(snapshot);
    }
  }
  return await getSetupSnapshot();
}

function shouldRefreshCliInventoryAfterSetupAction(helperId: string): boolean {
  return helperId.endsWith('-native-installer')
    || helperId.endsWith('-local-model-installer');
}

async function runRetryCliScanAction(): Promise<DesktopBootstrapSnapshot> {
  if (!hostConfig) {
    throw new Error('Desktop host is not initialized.');
  }

  const setupCompleted = Boolean(
    latestPersistedSetupState.setupCompleteAt || latestPersistedSetupState.productSetupCompleted,
  );
  const probe = await fetchRuntimeCliInventoryProbe(hostConfig.runtimeBaseUrl, {
    triggerScanIfMissing: true,
    forceRescan: true,
    scanTimeoutMs: setupCompleted
      ? RUNTIME_SETUP_SCAN_TIMEOUT_MS
      : RUNTIME_BOOTSTRAP_SETUP_SCAN_TIMEOUT_MS,
  });
  if (rememberRuntimeCliInventoryProbe(probe)) {
    const snapshot = publishSnapshot(buildSnapshot());
    scheduleBackgroundSetupAudit(snapshot, latestPersistedSetupState);
    await maybeOpenApp(snapshot);
    return snapshot;
  }
  if (runtimeCliInventoryScanPending || isRuntimeCliInventoryScanActive(probe)) {
    clearCliInventoryError();
    const snapshot = publishSnapshot(buildSnapshot());
    scheduleRuntimeCliInventoryPoll({
      setupCompleted,
      delayMs: 0,
    });
    return snapshot;
  }

  latestCliInventoryError = createCliInventoryScanFailedError();
  const snapshot = publishSnapshot(buildSnapshot());
  scheduleBackgroundSetupAudit(snapshot, latestPersistedSetupState);
  return snapshot;
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

// Hard ceiling for graceful shutdown. The supervisor gives every managed
// service two grace windows (stdin close, then SIGTERM), so the host-level
// watchdog derives its budget from the configured per-window grace and the
// active service count, with a small buffer for app-level cleanup.
const SHUTDOWN_GRACE_WINDOWS_PER_SERVICE = 2;
const SHUTDOWN_WATCHDOG_BUFFER_MS = 3_000;

function resolveShutdownWatchdogMs(config: DesktopHostConfig, serviceCount: number): number {
  return (config.gracefulShutdownMs * SHUTDOWN_GRACE_WINDOWS_PER_SERVICE * Math.max(1, serviceCount))
    + SHUTDOWN_WATCHDOG_BUFFER_MS;
}

function waitForShutdownDeadline(ms: number): Promise<'timed_out'> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('timed_out'), ms);
    timer.unref?.();
  });
}

async function shutdownHost(): Promise<void> {
  if (shutdownPromise) {
    return shutdownPromise;
  }
  shuttingDown = true;
  clearRuntimeCliInventoryPoll();
  shutdownPromise = (async () => {
    let shutdownExitCode = 0;
    let forcedStopAttempted = false;
    const activeTrayController = trayController;
    try {
      voiceCaptureController?.dispose();
      voiceCaptureController = null;
      activeTrayController?.updateMenu(buildDesktopTrayQuittingMenuState());
      const drain = supervisor?.stopAll() ?? Promise.resolve();
      const shutdownWatchdogMs = hostConfig
        ? resolveShutdownWatchdogMs(hostConfig, supervisor?.getManagedServiceCount() ?? 0)
        : SHUTDOWN_WATCHDOG_BUFFER_MS;
      const result = await Promise.race([
        drain.then(() => 'drained' as const),
        waitForShutdownDeadline(shutdownWatchdogMs),
      ]);
      if (result === 'timed_out') {
        shutdownExitCode = 1;
        process.stderr.write(
          `Desktop host shutdown watchdog tripped after ${shutdownWatchdogMs}ms; forcing managed services down.\n`,
        );
        forcedStopAttempted = true;
        await supervisor?.forceStopAll();
        void drain.catch((error) => {
          process.stderr.write(
            `Desktop host graceful shutdown failed after watchdog: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
          );
        });
      }
    } catch (error) {
      shutdownExitCode = 1;
      process.stderr.write(
        `Desktop host shutdown failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
      );
      if (!forcedStopAttempted) {
        await supervisor?.forceStopAll().catch((forceStopError) => {
          process.stderr.write(
            `Desktop host force-stop failed during shutdown recovery: ${forceStopError instanceof Error ? forceStopError.stack ?? forceStopError.message : String(forceStopError)}\n`,
          );
        });
      }
    } finally {
      trayController = null;
      try {
        activeTrayController?.dispose();
      } catch (disposeError) {
        process.stderr.write(
          `Desktop host tray dispose failed during shutdown: ${disposeError instanceof Error ? disposeError.message : String(disposeError)}\n`,
        );
      }
      exitingAfterShutdown = true;
      app.exit(shutdownExitCode);
    }
  })();
  return shutdownPromise;
}

async function main(): Promise<void> {
  loadDesktopEnvFiles();

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
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (!mainWindow || webContents !== mainWindow.webContents) {
      callback(false);
      return;
    }
    callback(shouldAllowDesktopRendererPermission(permission));
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
        publishSnapshot(buildSnapshot());
        void maybeRecoverFromLateReadyStateChange();
      }
    },
  });
  latestSnapshot = buildSnapshot(null);
  voiceCaptureController = new DesktopVoiceCaptureController({
    config: hostConfig,
    resourcesPath: nodeProcess.resourcesPath,
    sendEvent: (event) => {
      mainWindow?.webContents.send(DESKTOP_VOICE_CAPTURE_EVENT_CHANNEL, event);
    },
  });

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
    const mode = (payload as { mode: DesktopSetupHelperMode }).mode;
    const rawDryRun = (payload as { dryRun?: unknown }).dryRun;
    let dryRun = false;
    if (rawDryRun !== undefined) {
      if (typeof rawDryRun !== 'boolean') {
        throw new Error('Invalid packaged setup helper dryRun payload.');
      }
      if (rawDryRun && mode !== 'uninstall') {
        throw new Error('dryRun is only allowed for uninstall mode.');
      }
      dryRun = rawDryRun;
    }
    return await runSetupAction({
      helperId: (payload as { helperId: string }).helperId,
      mode,
      ...(dryRun ? { dryRun: true } : {}),
    });
  });
  ipcMain.handle('cats-host:resume-setup', async () => {
    return await resumeSetupAction();
  });
  ipcMain.handle(DESKTOP_SCREENSHOT_IPC_CHANNEL, async (event, payload: unknown) => {
    assertMainWindowScreenshotIpcSender(event, mainWindow);
    return await captureScreenshotRegion({
      request: parseDesktopScreenshotCaptureRequest(payload),
      mainWindow,
      captureNativeRegion: captureNativeScreenshotRegion,
    });
  });
  ipcMain.handle(DESKTOP_VOICE_CAPTURE_START_CHANNEL, async (event, payload: unknown) => {
    assertMainWindowVoiceCaptureIpcSender(event, mainWindow);
    if (!voiceCaptureController) {
      throw new Error('Desktop voice capture is not initialized.');
    }
    await voiceCaptureController.startVoiceCapture(parseVoiceCaptureStartOptions(payload));
  });
  ipcMain.handle(DESKTOP_VOICE_CAPTURE_STOP_CHANNEL, async (event, sessionId: unknown) => {
    assertMainWindowVoiceCaptureIpcSender(event, mainWindow);
    if (!voiceCaptureController) {
      throw new Error('Desktop voice capture is not initialized.');
    }
    await voiceCaptureController.stopVoiceCapture(parseVoiceCaptureSessionId(sessionId));
  });
  ipcMain.handle(DESKTOP_VOICE_CAPTURE_CANCEL_CHANNEL, async (event, sessionId: unknown) => {
    assertMainWindowVoiceCaptureIpcSender(event, mainWindow);
    if (!voiceCaptureController) {
      throw new Error('Desktop voice capture is not initialized.');
    }
    await voiceCaptureController.cancelVoiceCapture(parseVoiceCaptureSessionId(sessionId));
  });
  ipcMain.handle(
    DESKTOP_SCREENSHOT_OVERLAY_GET_SNAPSHOT_CHANNEL,
    async (_event, displayId: unknown) => {
      if (!activeScreenshotOverlaySession) {
        throw new Error('No screenshot overlay session is active.');
      }
      return activeScreenshotOverlaySession.getSnapshot(
        parseDesktopScreenshotOverlayDisplayId(displayId),
      );
    },
  );
  ipcMain.handle(
    DESKTOP_SCREENSHOT_OVERLAY_COMPLETE_CHANNEL,
    async (_event, payload: unknown) => {
      if (!activeScreenshotOverlaySession) {
        throw new Error('No screenshot overlay session is active.');
      }
      activeScreenshotOverlaySession.completeSelection(
        parseDesktopScreenshotOverlaySelectionResult(payload),
      );
    },
  );
  ipcMain.handle(
    DESKTOP_SCREENSHOT_OVERLAY_CANCEL_CHANNEL,
    async (_event, reason: unknown) => {
      activeScreenshotOverlaySession?.cancel(
        parseDesktopScreenshotOverlayCancelReason(reason),
      );
    },
  );
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
  ipcMain.handle('cats-host:enable-mobile-pairing', async () => {
    if (!hostConfig) {
      throw new Error('Desktop host is not initialized.');
    }
    return await enableDesktopMobilePairingEnv(hostConfig);
  });
  ipcMain.handle('cats-host:relaunch', () => {
    app.relaunch();
    app.quit();
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
    if (!exitingAfterShutdown) {
      event.preventDefault();
      void shutdownHost();
    }
  });
  mainWindow.on('close', (event) => {
    // We gate on shuttingDown (not exitingAfterShutdown) on purpose: once
    // shutdownHost has flipped shuttingDown to true the user has explicitly
    // asked to quit, so any subsequent window close should fall through to
    // the real close path. Hiding to tray here would leak the window past
    // the shutdown drain. exitingAfterShutdown is reserved for the
    // before-quit handler where we explicitly want to allow the final
    // app.exit() to complete.
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
    if (shuttingDown) {
      return;
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      void showMainWindow();
    }
  });
  app.on('activate', () => {
    if (shuttingDown) {
      return;
    }
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
