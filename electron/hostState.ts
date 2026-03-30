import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type {
  DesktopBackgroundState,
  DesktopBootstrapSnapshot,
  DesktopHostPersistedState,
  DesktopPackagingPlan,
  DesktopSetupActionRecord,
  DesktopSetupInterruption,
  DesktopSetupState,
  DesktopUpdateState,
} from './contracts.js';
import type { DesktopHostConfig } from './config.js';

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

function normalizeBackgroundState(
  value: unknown,
  fallback: DesktopBackgroundState,
): DesktopBackgroundState {
  if (!isObjectRecord(value)) {
    return fallback;
  }

  const mode = value.mode === 'background' ? 'background' : 'foreground';
  const closeBehavior = value.closeBehavior === 'quit' ? 'quit' : fallback.closeBehavior;

  return {
    trayEnabled: value.trayEnabled === true || (value.trayEnabled !== false && fallback.trayEnabled),
    keepServicesRunning: value.keepServicesRunning === true
      || (value.keepServicesRunning !== false && fallback.keepServicesRunning),
    mode,
    closeBehavior,
    windowVisible: value.windowVisible !== false,
    lastHiddenAt: readString(value.lastHiddenAt),
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

      const snapshot = parsed.snapshot as unknown as DesktopBootstrapSnapshot;
      return {
        snapshot: {
          ...snapshot,
          background: normalizeBackgroundState(snapshot.background, defaults.background),
          updates: isObjectRecord(snapshot.updates)
            ? snapshot.updates as unknown as DesktopUpdateState
            : defaults.updates,
          packaging: isObjectRecord(snapshot.packaging)
            ? snapshot.packaging as unknown as DesktopPackagingPlan
            : defaults.packaging,
          setup: normalizeSetupState(snapshot.setup, defaults.setup),
          hostStatePath: this.statePath,
        },
        background: normalizeBackgroundState(parsed.background, defaults.background),
        updates: isObjectRecord(parsed.updates)
          ? parsed.updates as unknown as DesktopUpdateState
          : defaults.updates,
        packaging: isObjectRecord(parsed.packaging)
          ? parsed.packaging as unknown as DesktopPackagingPlan
          : defaults.packaging,
        setup: normalizeSetupState(parsed.setup, defaults.setup),
        savedAt: readString(parsed.savedAt) ?? this.now().toISOString(),
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
  }): Promise<void> {
    const writeOperation = this.writeQueue.catch(() => undefined).then(async () => {
      await mkdir(dirname(this.statePath), { recursive: true });
      const payload: DesktopHostPersistedState = {
        snapshot: input.snapshot,
        background: input.background,
        updates: input.updates,
        packaging: input.packaging,
        setup: input.setup,
        savedAt: this.now().toISOString(),
      };
      await writeFile(this.statePath, JSON.stringify(payload, null, 2));
    });
    this.writeQueue = writeOperation.catch(() => undefined);

    return await writeOperation;
  }
}
