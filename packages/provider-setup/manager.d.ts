export interface ProviderTarget {
  provider: string;
  backend: 'cli' | 'api' | 'local' | 'agent';
  instance: string;
  endpoint?: string;
}
export interface ProviderSelection {
  state: 'missing' | 'invalid' | 'empty' | 'selected';
  revision: string;
  targets: ProviderTarget[];
  nativeSetupTargets: ProviderTarget[];
  diskChanged: boolean;
  error: string | null;
}
export interface ProviderObservation extends ProviderTarget {
  commandStatus: string;
  available: boolean;
  version?: string | null;
  authStatus?: string;
  observedAt: string;
  configurationStatus: 'unchanged' | 'changed' | 'not_selected';
  connectionStatus?: 'connected' | 'failed' | 'not_checked';
  detail?: string;
}
export interface ProviderSetupHelper {
  id: string;
  available: boolean;
  supported: boolean;
  supportsApply: boolean;
  supportsUpgrade: boolean;
  supportsForce: boolean;
  supportsUninstall: boolean;
}
export interface ProviderSetupOutcome {
  source?: 'installer' | 'detection';
  status: string | null;
  summary: string;
  manualSteps: string[];
  warnings: string[];
  plannedActions: string[];
  runState: string;
}
export interface ProviderManagerSnapshot {
  runtime: {
    bootstrapRequired?: boolean;
    selection: ProviderSelection;
    universe: Array<ProviderTarget & { familyLabel: string; binaryName: string;
      install?: { auth?: { hint?: string; docsUrl?: string }; install?: { docsUrl?: string } } | null }>;
    observations?: ProviderObservation[];
    connections?: Array<ProviderTarget & { endpoint: string; editable: boolean; source?: string }>;
    state?: { status?: string; error?: string | null } | null;
  };
  helpers: ProviderSetupHelper[];
  platform: 'windows' | 'macos' | 'linux';
  operations: Array<{ targets: ProviderTarget[]; stage: string }>;
  outcomes: Record<string, ProviderSetupOutcome>;
  preview?: { target: ProviderTarget; result: ProviderSetupOutcome; revision: string };
}
export interface ProviderManagerBridge {
  getProviderSetup(context?: 'onboarding' | 'settings'): Promise<ProviderManagerSnapshot>;
  applyProviderSetup(input: { targets: ProviderTarget[]; expectedRevision: string;
    detectAfter: boolean; reload?: boolean }): Promise<ProviderManagerSnapshot>;
  runProviderSetup(input: { action: 'detect' | 'install' | 'upgrade' | 'repair' | 'uninstall' | 'preview_uninstall';
    targets: ProviderTarget[]; expectedRevision: string }): Promise<ProviderManagerSnapshot>;
}
export function mountProviderManager(root: HTMLElement, bridge: ProviderManagerBridge, options?: {
  context?: 'onboarding' | 'settings';
  locale?: string;
  onContinue?: () => void | Promise<void>;
  onFeedback?: (message: string) => void;
}): { refresh(): Promise<void>; destroy(): void };
