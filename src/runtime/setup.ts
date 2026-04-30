import type { RuntimeClient } from './client.js';
import type { RuntimeSetupSummary } from '../shared/runtimeSetup.js';

type RawRuntimeSetupStateStatus =
  | 'pending'
  | 'scanning'
  | 'ready'
  | 'applied'
  | 'error';

export interface RuntimeSetupScanProviderEntry {
  provider: string;
  family: string;
  commandStatus: string;
  commandPath: string | null;
  version: string | null;
  authStatus: string;
  available: boolean;
}

export interface RuntimeSetupScanSummary {
  scannedAt: string;
  scanType: 'auto' | 'manual';
  providers: RuntimeSetupScanProviderEntry[];
  providerCount: number;
  availableCount: number;
}

export interface RuntimeSetupReadModel {
  bootstrapRequired: boolean;
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
    status: 'ready' | 'scan_required' | 'attention_required';
    summary: string;
    preferredScan: {
      source: 'scan' | 'manualScan' | 'none';
      scannedAt: string | null;
      providerCount: number;
      availableCount: number;
      unavailableCount: number;
      remediationCount: number;
    };
    providersReadyToApply: Array<{
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
    providersReadyToApply: [],
    providersNeedingAttention: [],
    suggestedProviders: [],
    canRunManualScan: false,
    canApply: false,
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
    providersReadyToApply: [],
    providersNeedingAttention: [],
    suggestedProviders: [],
    canRunManualScan: false,
    canApply: false,
    error: readRuntimeSetupError(error, 'Cats Runtime setup is currently unavailable.'),
  };
}

export function summarizeRuntimeSetupReadModel(
  readModel: RuntimeSetupReadModel,
): RuntimeSetupSummary {
  const providersReadyToApply = readModel.repair.providersReadyToApply.map((provider) => ({
    provider: provider.provider,
    family: provider.family,
  }));
  const providersNeedingAttention = readModel.repair.providersNeedingAttention.map((provider) => ({
    provider: provider.provider,
    family: provider.family,
    remediationCount: provider.remediationCount,
  }));
  const suggestedProviders = providersReadyToApply.map((provider) => provider.provider);
  const status = readModel.bootstrapRequired
    ? readModel.repair.status === 'ready'
      ? 'ready_to_apply'
      : readModel.repair.status
    : 'ready';
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
    providerCount: readModel.repair.preferredScan.providerCount,
    availableCount: readModel.repair.preferredScan.availableCount,
    providersReadyToApply,
    providersNeedingAttention,
    suggestedProviders,
    canRunManualScan: readModel.bootstrapRequired,
    canApply: readModel.bootstrapRequired && suggestedProviders.length > 0,
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
