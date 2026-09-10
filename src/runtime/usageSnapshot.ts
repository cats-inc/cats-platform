// Public telemetry projection. Unknown upstream fields never cross the App bridge.
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown, max: number): unknown[] => Array.isArray(value) ? value.slice(0, max) : [];
const text = (value: unknown, max = 100): string | null => typeof value === 'string' ? value.slice(0, max) : null;
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const time = (value: unknown): string | null => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const target = (value: unknown) => {
  const v = record(value);
  return { provider: text(v.provider), instance: text(v.instance), backend: v.backend === 'cli' || v.backend === 'api' ? v.backend : null };
};
const usage = (value: unknown) => {
  const v = record(value); const confidence = record(v.confidence);
  return { observations: number(v.observations), inputTokens: number(v.inputTokens), outputTokens: number(v.outputTokens), totalTokens: number(v.totalTokens),
    costs: list(v.costs, 32).map((item) => { const cost = record(item); return { currency: text(cost.currency, 8), amount: number(cost.amount), observations: number(cost.observations) }; }),
    confidence: Object.fromEntries(['reported', 'aggregated', 'estimated', 'unknown'].map((key) => [key, number(confidence[key]) ?? 0])), lastObservedAt: time(v.lastObservedAt) };
};
const guardrail = (value: unknown) => {
  const v = record(value);
  return { ...target(v), outcome: text(v.outcome, 30), scope: text(v.scope, 30), sessionId: text(v.sessionId, 200), observedAt: time(v.observedAt), cooldownUntil: time(v.cooldownUntil) };
};

export function projectUsageSnapshot(value: unknown): Record<string, unknown> {
  const v = record(value); const runtime = record(v.runtime); const coverage = record(v.coverage);
  if (v.schemaVersion !== 1 || runtime.status !== 'available' || !text(runtime.epoch) || !time(v.generatedAt)
    || !Array.isArray(v.targets) || !Array.isArray(v.sessions) || !Array.isArray(record(v.totals).costs)
    || coverage.mode !== 'memory') throw new Error('Unsupported runtime usage snapshot.');
  return { schemaVersion: 1, generatedAt: time(v.generatedAt), runtime: { status: 'available', epoch: text(runtime.epoch) },
    coverage: { mode: 'memory', scope: 'runtime_observed_results', startedAt: time(coverage.startedAt), firstRetainedAt: time(coverage.firstRetainedAt), lastObservedAt: time(coverage.lastObservedAt),
      retainedRecords: number(coverage.retainedRecords), droppedRecords: number(coverage.droppedRecords), droppedQuotaTargets: number(coverage.droppedQuotaTargets), targetCount: number(coverage.targetCount), sessionCount: number(coverage.sessionCount),
      truncated: coverage.truncated !== false || v.targets.length > 200 || v.sessions.length > 200, historyAvailable: false },
    totals: usage(v.totals),
    targets: list(v.targets, 200).map((item) => {
      const t = record(item); const q = record(t.quota);
      return { ...target(t), usage: usage(t.usage), guardrails: list(t.guardrails, 100).map(guardrail), quota: {
        status: ['available', 'unsupported'].includes(String(q.status)) ? q.status : 'unavailable',
        freshness: ['fresh', 'stale'].includes(String(q.freshness)) ? q.freshness : 'unknown',
        source: ['claude.rate_limit_event', 'codex.account/rateLimits/updated'].includes(String(q.source)) ? q.source : null,
        observedAt: time(q.observedAt), accountId: null, accountLinkage: 'unverified', scope: 'provider_reported_during_runtime_execution', automaticRefresh: false,
        windows: list(q.windows, 20).map((item) => {
          const window = record(item); const used = number(window.usedPercent); const usedPercent = used !== null && used <= 100 ? used : null;
          return { id: text(window.id, 64), unit: 'percent', usedPercent, remainingPercent: usedPercent === null ? null : 100 - usedPercent, resetsAt: time(window.resetsAt), windowMinutes: number(window.windowMinutes) };
        }),
      } };
    }),
    sessions: list(v.sessions, 200).map((item) => { const session = record(item); return { ...target(session), sessionId: text(session.sessionId, 200), usage: usage(session.usage) }; }),
    incidents: list(v.incidents, 20).map((item) => { const incident = record(item); return { ...target(incident), id: text(incident.id), classification: text(incident.classification, 50), scope: text(incident.scope, 50), observedAt: time(incident.observedAt), retryAt: time(incident.retryAt) }; }),
    guardrails: list(v.guardrails, 100).map(guardrail),
  };
}
