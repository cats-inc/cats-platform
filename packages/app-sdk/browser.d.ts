/** Host-injected browser API. No imports, secrets, filesystem or general network proxy. */
export interface CatsAppBrowserSdkV1 {
  readonly sdkVersion: '1.7.0';
  readonly appId: string;
  readonly version: string;
  readonly locale: string;
  readonly theme: 'light' | 'dark';
  readonly usage: {
    getSnapshot(): Promise<UsageSnapshotV1>;
    refreshQuota(target: { provider: 'codex' | 'copilot' | 'claude' | 'antigravity' | 'kiro' | 'grok' | 'muse'; instance: string }): Promise<UsageQuotaRefreshV1>;
  };
  openLobby(): Promise<void>;
  openRemoteAccess(): Promise<void>;
  readonly clipboard: { writeText(text: string): Promise<void> };
  /**
   * An App sees one image contract, chosen by its manifest's `compatibility.appSdk` floor: below 1.7.0 schema 1
   * (Grok generation, JPEG), from 1.7.0 contract 2 (services and profiles, JPEG or PNG at measured sizes).
   */
  readonly images: {
    getCapabilities(): Promise<CatsImageCapabilitiesV1 | CatsImageCapabilitiesV2>;
    submit(input: { requestId: string; instance: string; prompt: string } | CatsImageSubmissionV2): Promise<CatsImageJob | CatsImageJobV2>;
    list(): Promise<{ jobs: Array<CatsImageJob | CatsImageJobV2> }>;
    cancel(id: string): Promise<CatsImageJob | CatsImageJobV2>;
    refresh(id: string): Promise<CatsImageJob | CatsImageJobV2>;
    /** Deletes a succeeded, failed or cancelled job and its saved image; other states reject with `image_not_deletable`, linked work with `image_in_use`. */
    delete(id: string): Promise<{ deleted: true }>;
    read(id: string): Promise<{ bytes: ArrayBuffer; mimeType: 'image/jpeg' | 'image/png' }>;
    export(id: string): Promise<{ downloaded: true }>;
  };
}
type CatsImageStatus = 'submitting' | 'running' | 'collecting' | 'succeeded' | 'failed' | 'cancelling' | 'cancelled' | 'interrupted';
export interface CatsImageCapabilitiesV1 {
  schemaVersion: 1; operation: 'image.generate'; aspectRatio: '1:1'; maxPromptLength: number; maxImageBytes: number;
  targets: Array<{ provider: 'grok'; instance: string; agentModel: string }>;
}
export interface CatsImageJob {
  schemaVersion: 1; id: string; requestId: string; prompt: string; instance: string;
  provider: 'grok'; agentModel: string | null; status: CatsImageStatus;
  createdAt: string; updatedAt: string; error: string | null;
  output: null | { mimeType: 'image/jpeg'; bytes: number; width: number; height: number; sha256: string };
}
/** Contract 2: an enabled profile per provider x operation; only generation is offered yet. */
export interface CatsImageCapabilitiesV2 {
  schemaVersion: 2; revision: string; maxPromptLength: number; maxImageBytes: number;
  targets: Array<{ id: string; provider: 'grok' | 'muse' | 'antigravity' | 'codex'; instanceLabel: string; availability: 'available' }>;
  profiles: Array<{ id: string; revision: number; operation: 'image.generate'; targetIds: string[];
    agentConfigs: Array<{ id: string; model: string; effort: string }>; inputs: { min: 0; max: 0 };
    aspectRatio: { mode: 'native'; options: [string] } | { mode: 'service' } }>;
}
export interface CatsImageSubmissionV2 {
  requestId: string; targetId: string; profileId: string; profileRevision: string; agentConfigId: string;
  operation: 'image.generate'; prompt: string; sourceIds: []; options: Record<string, never>;
}
export interface CatsImageJobV2 {
  schemaVersion: 2; id: string; requestId: string; provider: 'grok' | 'muse' | 'antigravity' | 'codex'; targetId: string; instanceLabel: string;
  operation: 'image.generate'; profileId: string; profileRevision: string; agentConfigId: string | null;
  agentModel: string | null; agentEffort: string | null; prompt: string; sources: []; options: Record<string, never>;
  status: CatsImageStatus; error: string | null; warnings: string[]; executionOutcome: 'completed' | 'stopped_after_image' | null;
  output: null | { mimeType: 'image/jpeg' | 'image/png'; bytes: number; width: number; height: number; sha256: string;
    transparency: 'opaque' | 'has-transparency' };
  createdAt: string; updatedAt: string;
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
    windows: Array<{ id: string; unit: 'percent' | 'requests' | 'credits'; used: number | null; limit: number | null; remaining: number | null; unlimited: boolean; usedPercent: number | null; remainingPercent: number | null; resetsAt: string | null; resetsOn?: string | null; resetLabel?: string | null; windowMinutes: number | null }>;
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
