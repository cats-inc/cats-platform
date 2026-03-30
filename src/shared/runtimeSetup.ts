export type RuntimeSetupStatus =
  | 'ready'
  | 'ready_to_apply'
  | 'scan_required'
  | 'attention_required'
  | 'unavailable';

export type RuntimeSetupStateStatus =
  | 'pending'
  | 'scanning'
  | 'ready'
  | 'applied'
  | 'error'
  | 'unavailable';

export interface RuntimeSetupProviderSummary {
  provider: string;
  family: string;
  remediationCount?: number;
}

export interface RuntimeSetupSummary {
  source: 'runtime' | 'assumed_ready' | 'unavailable';
  bootstrapRequired: boolean;
  status: RuntimeSetupStatus;
  stateStatus: RuntimeSetupStateStatus;
  summary: string;
  scannedAt: string | null;
  lastManualScanAt: string | null;
  appliedAt: string | null;
  providerCount: number;
  availableCount: number;
  providersReadyToApply: RuntimeSetupProviderSummary[];
  providersNeedingAttention: RuntimeSetupProviderSummary[];
  suggestedProviders: string[];
  canRunManualScan: boolean;
  canApply: boolean;
  error: string | null;
}

export interface SuiteRuntimeSetupScanInput {
  attemptId?: string | null;
  manual?: boolean;
}

export interface SuiteRuntimeSetupApplyInput {
  attemptId?: string | null;
  providers?: string[];
}
