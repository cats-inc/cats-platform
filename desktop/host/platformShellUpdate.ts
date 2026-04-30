import { createEmptyDesktopSetupState, isSetupAuditHelperId } from './setupBridge.js';
import type { AppShellPayload, RuntimeProviderDiagnosticsPayload } from './readiness.js';
import type { PersistedSetupCompletionState } from './persistedSetupState.js';
import type { DesktopSetupState } from './contracts.js';

export interface DesktopHostPlatformShellProduct {
  id?: string;
  productName?: string;
  routePrefix?: string;
  installState?: string;
  setup?: {
    selectable?: boolean;
    disabledReason?: string;
  } | null;
}

export interface DesktopHostPlatformShellUpdate {
  bootstrapAttemptId: string | null;
  setupCompleteAt: string | null;
  products: DesktopHostPlatformShellProduct[];
}

export interface DesktopHostPlatformShellState {
  appShell: AppShellPayload | null;
  persistedSetup: PersistedSetupCompletionState;
  providerDiagnostics: RuntimeProviderDiagnosticsPayload | null;
  setup: DesktopSetupState;
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeProducts(value: unknown): DesktopHostPlatformShellProduct[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const setupRecord = typeof record.setup === 'object' && record.setup !== null
      ? record.setup as Record<string, unknown>
      : null;

    return [{
      id: normalizeString(record.id) ?? undefined,
      productName: normalizeString(record.productName) ?? undefined,
      routePrefix: normalizeString(record.routePrefix) ?? undefined,
      installState: normalizeString(record.installState) ?? undefined,
      setup: setupRecord
        ? {
          selectable: setupRecord.selectable === true,
          disabledReason: normalizeString(setupRecord.disabledReason) ?? undefined,
        }
        : null,
    }];
  });
}

export function parseDesktopHostPlatformShellUpdate(
  value: unknown,
): DesktopHostPlatformShellUpdate {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid desktop platform shell payload.');
  }

  const record = value as Record<string, unknown>;
  return {
    bootstrapAttemptId: normalizeString(record.bootstrapAttemptId),
    setupCompleteAt: normalizeString(record.setupCompleteAt),
    products: normalizeProducts(record.products),
  };
}

export function applyDesktopHostPlatformShellUpdate(
  state: DesktopHostPlatformShellState,
  update: DesktopHostPlatformShellUpdate,
): DesktopHostPlatformShellState {
  const setupCompleteAt = update.setupCompleteAt;
  const setupCompleted = Boolean(setupCompleteAt || state.persistedSetup.productSetupCompleted);
  const setup = normalizePlatformShellSetupState(state.setup, setupCompleted);

  return {
    appShell: {
      ...(state.appShell ?? {}),
      bootstrapAttemptId: update.bootstrapAttemptId,
      setupCompleteAt,
      products: update.products,
    },
    persistedSetup: {
      setupCompleteAt,
      productSetupCompleted: Boolean(setupCompleteAt),
    },
    providerDiagnostics: setupCompleteAt
      ? null
      : state.providerDiagnostics,
    setup,
  };
}

export function normalizePlatformShellSetupState(
  setup: DesktopSetupState,
  setupCompleted: boolean,
): DesktopSetupState {
  if (!setupCompleted) {
    return setup;
  }

  const helperId = setup.lastAction?.helperId;
  if (!isSetupAuditHelperId(helperId)) {
    return setup;
  }

  return createEmptyDesktopSetupState();
}
