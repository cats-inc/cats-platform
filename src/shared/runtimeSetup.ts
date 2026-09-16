export type RuntimeSetupStatus =
  | 'ready'
  | 'selection_required'
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

export interface RuntimeSelectedProviderTarget {
  provider: string;
  backend: 'cli' | 'api' | 'local' | 'agent';
  instance: string;
}

export interface RuntimeProviderSelection {
  state: 'missing' | 'invalid' | 'empty' | 'selected';
  revision: string;
  targets: RuntimeSelectedProviderTarget[];
  nativeSetupTargets: RuntimeSelectedProviderTarget[];
  diskChanged: boolean;
  error: string | null;
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
  providersReady: RuntimeSetupProviderSummary[];
  providersNeedingAttention: RuntimeSetupProviderSummary[];
  selectedProviders: string[];
  canRunManualScan: boolean;
  canManageSelection: boolean;
  error: string | null;
}
