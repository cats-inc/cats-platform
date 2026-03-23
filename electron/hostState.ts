import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type {
  DesktopBackgroundState,
  DesktopBootstrapSnapshot,
  DesktopHostPersistedState,
  DesktopPackagingPlan,
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
          hostStatePath: this.statePath,
        },
        background: normalizeBackgroundState(parsed.background, defaults.background),
        updates: isObjectRecord(parsed.updates)
          ? parsed.updates as unknown as DesktopUpdateState
          : defaults.updates,
        packaging: isObjectRecord(parsed.packaging)
          ? parsed.packaging as unknown as DesktopPackagingPlan
          : defaults.packaging,
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
  }): Promise<void> {
    const writeOperation = this.writeQueue.catch(() => undefined).then(async () => {
      await mkdir(dirname(this.statePath), { recursive: true });
      const payload: DesktopHostPersistedState = {
        snapshot: input.snapshot,
        background: input.background,
        updates: input.updates,
        packaging: input.packaging,
        savedAt: this.now().toISOString(),
      };
      await writeFile(this.statePath, JSON.stringify(payload, null, 2));
    });
    this.writeQueue = writeOperation.catch(() => undefined);

    return await writeOperation;
  }
}
