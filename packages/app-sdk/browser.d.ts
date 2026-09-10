/** Host-injected browser API. No imports, secrets, filesystem or general network proxy. */
export interface CatsAppBrowserSdkV1 {
  readonly sdkVersion: '1.0.0';
  readonly appId: string;
  readonly version: string;
  readonly locale: string;
  readonly theme: 'light' | 'dark';
  readonly usage: { getSnapshot(): Promise<UsageSnapshotV1> };
  openLobby(): Promise<void>;
}
export interface UsageTotalsV1 {
  observations: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costs: Array<{ currency: string; amount: number; observations: number }>;
  confidence: { reported: number; aggregated: number; estimated: number; unknown: number };
  lastObservedAt: string | null;
}
export interface UsageTargetV1 { provider: string; instance: string; backend: 'cli' | 'api' }
export interface UsageGuardrailV1 {
  provider: string | null; instance: string | null; backend: 'cli' | 'api' | null;
  outcome: string; scope: string; sessionId: string | null; observedAt: string; cooldownUntil: string | null;
}
export interface UsageSnapshotV1 {
  schemaVersion: 1; generatedAt: string; runtime: { status: 'available'; epoch: string };
  coverage: { mode: 'memory'; scope: 'runtime_observed_results'; startedAt: string;
    firstRetainedAt: string | null; lastObservedAt: string | null; retainedRecords: number; droppedRecords: number;
    droppedQuotaTargets: number; targetCount: number; sessionCount: number; truncated: boolean; historyAvailable: false };
  totals: UsageTotalsV1;
  targets: Array<UsageTargetV1 & { usage: UsageTotalsV1; guardrails: UsageGuardrailV1[]; quota: {
    status: 'available' | 'unavailable' | 'unsupported'; freshness: 'fresh' | 'stale' | 'unknown';
    source: string | null; observedAt: string | null; accountId: null; accountLinkage: 'unverified';
    scope: 'provider_reported_during_runtime_execution'; automaticRefresh: false;
    windows: Array<{ id: string; unit: 'percent'; usedPercent: number | null; remainingPercent: number | null; resetsAt: string | null; windowMinutes: number | null }>;
  } }>;
  sessions: Array<UsageTargetV1 & { sessionId: string; usage: UsageTotalsV1 }>;
  incidents: Array<UsageTargetV1 & { id: string; classification: string; scope: string; observedAt: string; retryAt: string | null }>;
  guardrails: UsageGuardrailV1[];
}
declare global { var catsApp: CatsAppBrowserSdkV1; }
