import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type {
  DesktopBackgroundState,
  DesktopBootstrapEvent,
  DesktopBootstrapEventError,
  DesktopBootstrapEventReference,
  DesktopBootstrapEventStatus,
  DesktopBootstrapPhase,
  DesktopBootstrapSnapshot,
  DesktopHostDiagnosticsState,
  DesktopHostPersistedState,
  DesktopHealthStatus,
  DesktopManagedServiceLog,
  DesktopProductBootstrapDiagnostics,
  DesktopPackagingPlan,
  DesktopSetupActionRecord,
  DesktopSetupInterruption,
  DesktopSetupState,
  DesktopUpdateChannel,
  DesktopUpdateStatus,
  DesktopUpdateState,
} from './contracts.js';
import {
  DESKTOP_BOOTSTRAP_PHASES,
  DESKTOP_HOST_NAME,
  DESKTOP_UPDATE_CHANNELS,
  DESKTOP_UPDATE_STATUSES,
} from './contracts.js';
import { DESKTOP_HOST_VERSION } from './hostVersion.js';
import type { DesktopHostConfig } from './config.js';
import { createEmptyDesktopDiagnosticsState } from './bootstrapDiagnostics.js';

interface DesktopHostStateStoreDependencies {
  now?: () => Date;
}

export function createDesktopBackgroundState(
  config: DesktopHostConfig,
  overrides: Partial<DesktopBackgroundState> = {},
): DesktopBackgroundState {
  return {
    trayEnabled: config.background.trayEnabled,
    keepServicesRunning: config.background.keepServicesRunning,
    mode: 'foreground',
    closeBehavior: config.background.closeBehavior,
    windowVisible: true,
    lastHiddenAt: null,
    ...overrides,
  };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readTimestamp(value: unknown): string | null {
  const raw = readString(value);
  if (!raw) {
    return null;
  }
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizeBootstrapPhase(value: unknown): DesktopBootstrapPhase {
  return typeof value === 'string'
    && DESKTOP_BOOTSTRAP_PHASES.includes(value as DesktopBootstrapPhase)
    ? value as DesktopBootstrapPhase
    : 'checking_prerequisites';
}

function normalizeHealthStatus(value: unknown): DesktopHealthStatus {
  return value === 'ok' || value === 'degraded' || value === 'unavailable'
    ? value
    : 'degraded';
}

function normalizeUpdateChannel(
  value: unknown,
  fallback: DesktopUpdateChannel,
): DesktopUpdateChannel {
  return typeof value === 'string'
    && DESKTOP_UPDATE_CHANNELS.includes(value as DesktopUpdateChannel)
    ? value as DesktopUpdateChannel
    : fallback;
}

function normalizeUpdateStatus(
  value: unknown,
  fallback: DesktopUpdateStatus,
): DesktopUpdateStatus {
  return typeof value === 'string'
    && DESKTOP_UPDATE_STATUSES.includes(value as DesktopUpdateStatus)
    ? value as DesktopUpdateStatus
    : fallback;
}

function normalizeSha256(value: unknown): string | null {
  const digest = readString(value);
  return digest && /^[a-f0-9]{64}$/iu.test(digest) ? digest.toLowerCase() : null;
}

function normalizeBackgroundState(
  value: unknown,
  fallback: DesktopBackgroundState,
): DesktopBackgroundState {
  if (!isObjectRecord(value)) {
    return fallback;
  }

  const mode = value.mode === 'background' ? 'background' : 'foreground';

  return {
    trayEnabled: fallback.trayEnabled,
    keepServicesRunning: fallback.keepServicesRunning,
    mode,
    closeBehavior: fallback.closeBehavior,
    windowVisible: value.windowVisible !== false,
    lastHiddenAt: readString(value.lastHiddenAt),
  };
}

function normalizeUpdateState(
  value: unknown,
  fallback: DesktopUpdateState,
): DesktopUpdateState {
  if (!isObjectRecord(value)) {
    return fallback;
  }

  return {
    channel: normalizeUpdateChannel(value.channel, fallback.channel),
    status: normalizeUpdateStatus(value.status, fallback.status),
    currentVersion: readString(value.currentVersion) ?? fallback.currentVersion,
    latestVersion: readString(value.latestVersion),
    summary: readString(value.summary) ?? fallback.summary,
    lastCheckedAt: readTimestamp(value.lastCheckedAt),
    manifestUrl: readString(value.manifestUrl),
    downloadUrl: readString(value.downloadUrl),
    sha256: normalizeSha256(value.sha256),
    error: readString(value.error),
  };
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function normalizeSetupPack(value: unknown): DesktopSetupActionRecord['pack'] {
  return value === 'api_baseline'
    || value === 'native_cli_pack'
    || value === 'local_model_pack'
    || value === 'wsl_power_user_pack'
    ? value
    : null;
}

function normalizeSetupInterruptions(value: unknown): DesktopSetupInterruption[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isObjectRecord(entry)) {
      return [];
    }

    const kind = entry.kind;
    if (
      kind !== 'restart_required'
      && kind !== 'relaunch_required'
      && kind !== 'elevation_required'
      && kind !== 'auth_required'
      && kind !== 'first_wsl_boot_required'
      && kind !== 'docker_warm_up_required'
    ) {
      return [];
    }

    return [{
      kind,
      summary: readString(entry.summary) ?? 'Packaged setup follow-through is still required.',
      resumable: entry.resumable === true,
      requiresRestart: entry.requiresRestart === true,
      requiresElevation: entry.requiresElevation === true,
    }];
  });
}

function normalizeSetupActionRecord(value: unknown): DesktopSetupActionRecord | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const mode = value.mode;
  if (mode !== 'check' && mode !== 'apply' && mode !== 'upgrade' && mode !== 'force') {
    return null;
  }

  const runState = value.runState;
  if (runState !== 'completed' && runState !== 'failed') {
    return null;
  }

  return {
    helperId: readString(value.helperId) ?? 'unknown-helper',
    assetId: readString(value.assetId) ?? 'unknown-asset',
    label: readString(value.label) ?? 'Unknown setup helper',
    pack: normalizeSetupPack(value.pack),
    mode,
    runState,
    status: readString(value.status),
    summary: readString(value.summary) ?? 'No setup action summary recorded.',
    packagedRelativePath: readString(value.packagedRelativePath) ?? '',
    scriptPath: readString(value.scriptPath),
    requiresElevation: value.requiresElevation === true,
    resumable: value.resumable === true,
    restartRequired: value.restartRequired === true,
    startedAt: readString(value.startedAt) ?? new Date(0).toISOString(),
    completedAt: readString(value.completedAt),
    warnings: readStringArray(value.warnings),
    plannedActions: readStringArray(value.plannedActions),
    appliedChanges: readStringArray(value.appliedChanges),
    optionalFollowThroughPack: normalizeSetupPack(value.optionalFollowThroughPack),
    manualSteps: readStringArray(value.manualSteps),
    interruptions: normalizeSetupInterruptions(value.interruptions),
    error: readString(value.error),
  };
}

function normalizeSetupState(
  value: unknown,
  fallback: DesktopSetupState,
): DesktopSetupState {
  if (!isObjectRecord(value)) {
    return fallback;
  }

  return {
    lastAction: normalizeSetupActionRecord(value.lastAction),
    updatedAt: readString(value.updatedAt),
  };
}

function normalizeBootstrapEventStatus(value: unknown): DesktopBootstrapEventStatus {
  return value === 'ok'
    || value === 'degraded'
    || value === 'unavailable'
    || value === 'info'
    ? value
    : 'info';
}

function normalizeBootstrapReference(
  value: unknown,
): DesktopBootstrapEventReference | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const artifactId = readString(value.artifactId);
  const artifactPath = readString(value.artifactPath);
  const recordId = readString(value.recordId);
  const route = readString(value.route);
  if (!artifactId && !artifactPath && !recordId && !route) {
    return null;
  }
  return {
    artifactId: artifactId ?? undefined,
    artifactPath: artifactPath ?? undefined,
    recordId: recordId ?? undefined,
    route: route ?? undefined,
  };
}

function normalizeBootstrapError(
  value: unknown,
): DesktopBootstrapEventError | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const message = readString(value.message);
  if (!message) {
    return null;
  }
  return {
    message,
    code: readString(value.code) ?? undefined,
    cause: readString(value.cause) ?? undefined,
    stack: readString(value.stack) ?? undefined,
  };
}

function normalizeBootstrapEvent(value: unknown): DesktopBootstrapEvent | null {
  if (!isObjectRecord(value)) {
    return null;
  }
  const layer = value.layer;
  if (layer !== 'runtime' && layer !== 'product' && layer !== 'host') {
    return null;
  }
  const kind = readString(value.kind);
  const timestamp = readString(value.timestamp);
  const summary = readString(value.summary);
  if (!kind || !timestamp || !summary) {
    return null;
  }
  return {
    layer,
    kind,
    timestamp,
    attemptId: readString(value.attemptId),
    summary,
    status: normalizeBootstrapEventStatus(value.status),
    context: isObjectRecord(value.context) ? value.context : null,
    error: normalizeBootstrapError(value.error),
    reference: normalizeBootstrapReference(value.reference),
  };
}

function normalizeManagedServiceLog(
  value: unknown,
  fallbackService: DesktopManagedServiceLog['service'],
): DesktopManagedServiceLog {
  if (!isObjectRecord(value)) {
    return {
      service: fallbackService,
      logPath: null,
      lastOutput: null,
      lastOutputAt: null,
    };
  }

  const service = value.service === 'cats-runtime' || value.service === 'cats-platform'
    ? value.service
    : fallbackService;
  return {
    service,
    logPath: readString(value.logPath),
    lastOutput: readString(value.lastOutput),
    lastOutputAt: readString(value.lastOutputAt),
  };
}

function normalizeProductDiagnostics(
  value: unknown,
): DesktopProductBootstrapDiagnostics | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const generatedAt = readString(value.generatedAt);
  const summary = readString(value.summary);
  if (!generatedAt || !summary) {
    return null;
  }

  return {
    generatedAt,
    attemptId: readString(value.attemptId),
    status: normalizeBootstrapEventStatus(value.status),
    summary,
    historyPath: readString(value.historyPath),
    latestReference: normalizeBootstrapReference(value.latestReference),
    events: Array.isArray(value.events)
      ? value.events
        .map((entry) => normalizeBootstrapEvent(entry))
        .filter((entry): entry is DesktopBootstrapEvent => Boolean(entry))
      : [],
  };
}

function normalizeDiagnosticsState(
  value: unknown,
  fallback: DesktopHostDiagnosticsState,
): DesktopHostDiagnosticsState {
  if (!isObjectRecord(value)) {
    return fallback;
  }

  const defaultLogs = new Map(
    fallback.serviceLogs.map((entry) => [entry.service, entry] as const),
  );
  const logs = Array.isArray(value.serviceLogs)
    ? value.serviceLogs.map((entry) => {
      const service = isObjectRecord(entry)
        && (entry.service === 'cats-runtime' || entry.service === 'cats-platform')
        ? entry.service
        : 'cats-runtime';
      return normalizeManagedServiceLog(entry, service);
    })
    : fallback.serviceLogs;

  const mergedLogs: DesktopManagedServiceLog[] = [];
  for (const service of ['cats-runtime', 'cats-platform'] as const) {
    const normalized = logs.find((entry) => entry.service === service);
    mergedLogs.push(normalized ?? defaultLogs.get(service) ?? {
      service,
      logPath: null,
      lastOutput: null,
      lastOutputAt: null,
    });
  }

  const aggregation = isObjectRecord(value.aggregation) ? value.aggregation : null;
  const aggregationLayers = isObjectRecord(aggregation?.layers) ? aggregation.layers : null;
  const runtimeLayer = isObjectRecord(aggregationLayers?.runtime) ? aggregationLayers.runtime : null;
  const productLayer = isObjectRecord(aggregationLayers?.product) ? aggregationLayers.product : null;
  const hostLayer = isObjectRecord(aggregationLayers?.host) ? aggregationLayers.host : null;

  return {
    activeAttemptId: readString(value.activeAttemptId),
    hostEvents: Array.isArray(value.hostEvents)
      ? value.hostEvents
        .map((entry) => normalizeBootstrapEvent(entry))
        .filter((entry): entry is DesktopBootstrapEvent => Boolean(entry))
      : fallback.hostEvents,
    runtimeEvents: Array.isArray(value.runtimeEvents)
      ? value.runtimeEvents
        .map((entry) => normalizeBootstrapEvent(entry))
        .filter((entry): entry is DesktopBootstrapEvent => Boolean(entry))
      : fallback.runtimeEvents,
    product: normalizeProductDiagnostics(value.product),
    aggregation: aggregation
      ? {
        generatedAt: readString(aggregation.generatedAt) ?? new Date(0).toISOString(),
        attemptId: readString(aggregation.attemptId),
        layers: {
          runtime: {
            status: normalizeBootstrapEventStatus(runtimeLayer?.status),
            summary: readString(runtimeLayer?.summary)
              ?? 'Runtime diagnostics are not available yet.',
            latestTimestamp: readString(runtimeLayer?.latestTimestamp),
            latestReference: normalizeBootstrapReference(runtimeLayer?.latestReference),
          },
          product: {
            status: normalizeBootstrapEventStatus(productLayer?.status),
            summary: readString(productLayer?.summary)
              ?? 'Product diagnostics are not available yet.',
            latestTimestamp: readString(productLayer?.latestTimestamp),
            latestReference: normalizeBootstrapReference(productLayer?.latestReference),
          },
          host: {
            status: normalizeBootstrapEventStatus(hostLayer?.status),
            summary: readString(hostLayer?.summary)
              ?? 'Host diagnostics are not available yet.',
            latestTimestamp: readString(hostLayer?.latestTimestamp),
            latestReference: normalizeBootstrapReference(hostLayer?.latestReference),
          },
        },
        chronology: Array.isArray(aggregation.chronology)
          ? aggregation.chronology
            .map((entry) => normalizeBootstrapEvent(entry))
            .filter((entry): entry is DesktopBootstrapEvent => Boolean(entry))
          : [],
      }
      : fallback.aggregation,
    serviceLogs: mergedLogs,
    updatedAt: readString(value.updatedAt),
  };
}

function normalizeBootstrapSnapshotMetadata(
  value: unknown,
  options: {
    fallbackTimestamp: string;
    hostStatePath: string;
  },
): DesktopBootstrapSnapshot {
  const snapshot = isObjectRecord(value)
    ? value as unknown as DesktopBootstrapSnapshot
    : {} as DesktopBootstrapSnapshot;

  return {
    ...snapshot,
    service: DESKTOP_HOST_NAME,
    version: readString(snapshot.version) ?? DESKTOP_HOST_VERSION,
    timestamp: readTimestamp(snapshot.timestamp) ?? options.fallbackTimestamp,
    phase: normalizeBootstrapPhase(snapshot.phase),
    status: normalizeHealthStatus(snapshot.status),
    summary: readString(snapshot.summary)
      ?? 'Restored desktop host state is incomplete; rechecking desktop services.',
    hostStatePath: options.hostStatePath,
  };
}

export class DesktopHostStateStore {
  private writeQueue = Promise.resolve();

  private readonly now: () => Date;

  constructor(
    private readonly statePath: string,
    dependencies: DesktopHostStateStoreDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async load(
    config: DesktopHostConfig,
    defaults: {
      background: DesktopBackgroundState;
      updates: DesktopUpdateState;
      packaging: DesktopPackagingPlan;
      setup: DesktopSetupState;
    },
  ): Promise<DesktopHostPersistedState | null> {
    try {
      const raw = await readFile(this.statePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (!isObjectRecord(parsed) || !isObjectRecord(parsed.snapshot)) {
        return null;
      }

      const savedAt = readTimestamp(parsed.savedAt) ?? this.now().toISOString();
      const snapshot = normalizeBootstrapSnapshotMetadata(parsed.snapshot, {
        fallbackTimestamp: savedAt,
        hostStatePath: this.statePath,
      });
      const diagnosticsFallback = createEmptyDesktopDiagnosticsState(['cats-runtime', 'cats-platform']);
      return {
        snapshot: {
          ...snapshot,
          background: normalizeBackgroundState(snapshot.background, defaults.background),
          updates: normalizeUpdateState(snapshot.updates, defaults.updates),
          packaging: isObjectRecord(snapshot.packaging)
            ? snapshot.packaging as unknown as DesktopPackagingPlan
            : defaults.packaging,
          setup: normalizeSetupState(snapshot.setup, defaults.setup),
          diagnostics: normalizeDiagnosticsState(snapshot.diagnostics, diagnosticsFallback),
          hostStatePath: this.statePath,
        },
        background: normalizeBackgroundState(parsed.background, defaults.background),
        updates: normalizeUpdateState(parsed.updates, defaults.updates),
        packaging: isObjectRecord(parsed.packaging)
          ? parsed.packaging as unknown as DesktopPackagingPlan
          : defaults.packaging,
        setup: normalizeSetupState(parsed.setup, defaults.setup),
        diagnostics: normalizeDiagnosticsState(parsed.diagnostics, diagnosticsFallback),
        savedAt,
      };
    } catch {
      return null;
    }
  }

  async save(input: {
    snapshot: DesktopBootstrapSnapshot;
    background: DesktopBackgroundState;
    updates: DesktopUpdateState;
    packaging: DesktopPackagingPlan;
    setup: DesktopSetupState;
    diagnostics: DesktopHostDiagnosticsState | null;
  }): Promise<void> {
    const writeOperation = this.writeQueue.catch(() => undefined).then(async () => {
      await mkdir(dirname(this.statePath), { recursive: true });
      const payload: DesktopHostPersistedState = {
        snapshot: input.snapshot,
        background: input.background,
        updates: input.updates,
        packaging: input.packaging,
        setup: input.setup,
        diagnostics: input.diagnostics,
        savedAt: this.now().toISOString(),
      };
      await writeFile(this.statePath, JSON.stringify(payload, null, 2));
    });
    this.writeQueue = writeOperation.catch(() => undefined);

    return await writeOperation;
  }
}
