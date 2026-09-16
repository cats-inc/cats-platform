import type { RuntimeClient } from './client.js';
import type { RuntimeSetupSummary } from '../shared/runtimeSetup.js';
import type { RuntimeProviderSelection, RuntimeSelectedProviderTarget } from '../shared/runtimeSetup.js';

type RawRuntimeSetupStateStatus =
  | 'pending'
  | 'scanning'
  | 'ready'
  | 'applied'
  | 'error';

export interface RuntimeSetupScanProviderEntry extends RuntimeSelectedProviderTarget {
  family: string;
  commandStatus: string;
  commandPath: string | null;
  version: string | null;
  authStatus: string;
  available: boolean;
}

export interface RuntimeSetupScanSummary {
  revision: string;
  scannedAt: string;
  scanType: 'auto' | 'manual';
  providers: RuntimeSetupScanProviderEntry[];
  providerCount: number;
  availableCount: number;
}

export interface RuntimeSetupReadModel {
  bootstrapRequired: boolean;
  selection: RuntimeProviderSelection;
  universe: Array<RuntimeSelectedProviderTarget & { familyLabel: string; binaryName: string }>;
  state: {
    status: RawRuntimeSetupStateStatus;
    lastScanAt: string | null;
    lastManualScanAt: string | null;
    appliedAt: string | null;
    appliedConfigPath: string | null;
    error: string | null;
  };
  scan: RuntimeSetupScanSummary | null;
  manualScan: RuntimeSetupScanSummary | null;
  repair: {
    status: 'ready' | 'selection_required' | 'scan_required' | 'attention_required';
    summary: string;
    preferredScan: {
      source: 'scan' | 'manualScan' | 'none';
      scannedAt: string | null;
      providerCount: number;
      availableCount: number;
      unavailableCount: number;
      remediationCount: number;
    };
    providersReady: Array<{
      provider: string;
      family: string;
    }>;
    providersNeedingAttention: Array<{
      provider: string;
      family: string;
      remediationCount: number;
    }>;
  };
}

function readRuntimeSetupError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export function createAssumedReadyRuntimeSetupSummary(): RuntimeSetupSummary {
  return {
    source: 'assumed_ready',
    bootstrapRequired: false,
    status: 'ready',
    stateStatus: 'ready',
    summary: 'Cats Runtime is ready.',
    scannedAt: null,
    lastManualScanAt: null,
    appliedAt: null,
    providerCount: 0,
    availableCount: 0,
    providersReady: [],
    providersNeedingAttention: [],
    selectedProviders: [],
    canRunManualScan: false,
    canManageSelection: false,
    error: null,
  };
}

export function createUnavailableRuntimeSetupSummary(
  error: unknown,
): RuntimeSetupSummary {
  return {
    source: 'unavailable',
    bootstrapRequired: true,
    status: 'unavailable',
    stateStatus: 'unavailable',
    summary: 'Cats Runtime setup is currently unavailable.',
    scannedAt: null,
    lastManualScanAt: null,
    appliedAt: null,
    providerCount: 0,
    availableCount: 0,
    providersReady: [],
    providersNeedingAttention: [],
    selectedProviders: [],
    canRunManualScan: false,
    canManageSelection: false,
    error: readRuntimeSetupError(error, 'Cats Runtime setup is currently unavailable.'),
  };
}

export function summarizeRuntimeSetupReadModel(
  readModel: RuntimeSetupReadModel,
): RuntimeSetupSummary {
  const providersReady = readModel.repair.providersReady.map((provider) => ({
    provider: provider.provider,
    family: provider.family,
  }));
  const providersNeedingAttention = readModel.repair.providersNeedingAttention.map((provider) => ({
    provider: provider.provider,
    family: provider.family,
    remediationCount: provider.remediationCount,
  }));
  const selectedProviders = [...new Set(readModel.selection.targets.map((target) => target.provider))];
  const status = readModel.bootstrapRequired ? 'selection_required' : 'ready';
  const summary = readModel.bootstrapRequired
    ? readModel.repair.summary
    : readModel.state.appliedAt
      ? 'Runtime provider config is applied and Cats Runtime is ready.'
      : 'Cats Runtime is ready.';

  return {
    source: 'runtime',
    bootstrapRequired: readModel.bootstrapRequired,
    status,
    stateStatus: readModel.state.status,
    summary,
    scannedAt: readModel.repair.preferredScan.scannedAt,
    lastManualScanAt: readModel.state.lastManualScanAt,
    appliedAt: readModel.state.appliedAt,
    providerCount: readModel.selection.targets.length,
    availableCount: readModel.repair.preferredScan.availableCount,
    providersReady,
    providersNeedingAttention,
    selectedProviders,
    canRunManualScan: readModel.selection.state === 'selected',
    canManageSelection: true,
    error: readModel.state.error,
  };
}

export async function readRuntimeSetupSummary(
  runtimeClient: RuntimeClient,
): Promise<RuntimeSetupSummary> {
  if (typeof runtimeClient.getSetupState !== 'function') {
    return createAssumedReadyRuntimeSetupSummary();
  }

  try {
    const readModel = await runtimeClient.getSetupState();
    return summarizeRuntimeSetupReadModel(readModel);
  } catch (error) {
    return createUnavailableRuntimeSetupSummary(error);
  }
}

export function isRuntimeSetupReady(summary: RuntimeSetupSummary): boolean {
  return summary.status === 'ready' && summary.bootstrapRequired === false;
}
