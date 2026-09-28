/** Host-injected browser API. No imports, secrets, filesystem or general network proxy. */
export interface CatsAppBrowserSdkV1 {
  readonly sdkVersion: '1.3.0';
  readonly appId: string;
  readonly version: string;
  readonly locale: string;
  readonly theme: 'light' | 'dark';
  readonly usage: {
    getSnapshot(): Promise<UsageSnapshotV1>;
    refreshQuota(target: { provider: 'codex' | 'copilot' | 'claude' | 'antigravity'; instance: string }): Promise<UsageQuotaRefreshV1>;
  };
  openLobby(): Promise<void>;
  readonly images: {
    getCapabilities(): Promise<{ schemaVersion: 1; operation: 'image.generate'; aspectRatio: '1:1';
      maxPromptLength: number; maxImageBytes: number;
      targets: Array<{ provider: 'grok'; instance: string; agentModel: string }> }>;
    submit(input: { requestId: string; instance: string; prompt: string }): Promise<CatsImageJob>;
    list(): Promise<{ jobs: CatsImageJob[] }>;
    cancel(id: string): Promise<CatsImageJob>;
    refresh(id: string): Promise<CatsImageJob>;
    read(id: string): Promise<{ bytes: ArrayBuffer; mimeType: 'image/jpeg' }>;
    export(id: string): Promise<{ downloaded: true }>;
  };
}
export interface CatsImageJob {
  schemaVersion: 1; id: string; requestId: string; prompt: string; instance: string;
  provider: 'grok'; agentModel: string | null;
  status: 'submitting' | 'running' | 'collecting' | 'succeeded' | 'failed' | 'cancelling' | 'cancelled' | 'interrupted';
  createdAt: string; updatedAt: string; error: string | null;
  output: null | { mimeType: 'image/jpeg'; bytes: number; width: number; height: number; sha256: string };
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
    scope: 'provider_reported_during_runtime_execution' | 'provider_account_query'; automaticRefresh: false;
    limitId: string | null;
    refreshSupported: boolean;
    windows: Array<{ id: string; unit: 'percent' | 'requests' | 'credits'; used: number | null; limit: number | null; remaining: number | null; unlimited: boolean; usedPercent: number | null; remainingPercent: number | null; resetsAt: string | null; windowMinutes: number | null }>;
  } }>;
  sessions: Array<UsageTargetV1 & { sessionId: string; usage: UsageTotalsV1 }>;
  incidents: Array<UsageTargetV1 & { id: string; classification: string; scope: string; observedAt: string; retryAt: string | null }>;
  guardrails: UsageGuardrailV1[];
}
declare global { var catsApp: CatsAppBrowserSdkV1; }
export interface UsageQuotaRefreshV1 {
  status: 'updated' | 'cooldown' | 'busy' | 'auth_required' | 'unsupported' | 'unavailable' | 'timeout' | 'error';
  nextRefreshAt: string | null;
  snapshot: UsageSnapshotV1;
}
