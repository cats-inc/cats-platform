/**
 * Counters for the transport work delivery path (SPEC-114, PLAN-105 Phase 6).
 *
 * The question these answer is "is the golden path healthy?" without anyone
 * having to read a transcript. That framing is also the constraint: an operator
 * metric that carries a goal, a summary, a chat id, or a token would turn a
 * diagnostics surface into a second copy of the conversation.
 *
 * So the shape is deliberately closed. Every counter is keyed by a value from a
 * fixed set declared here, and `record` refuses anything else at runtime rather
 * than trusting call sites to pass enums. Free text cannot reach a counter name
 * even by mistake, which is what makes "no message bodies or secrets" a property
 * of the module rather than a rule people have to remember.
 *
 * Latency is kept as a count and a total per bucket, not as a list of samples: a
 * sample list is a timeline of one owner's activity, and averages answer the
 * operational question just as well.
 */

export const TRANSPORT_WORK_COUNTERS = {
  /** Admission refused because a prerequisite was missing. */
  readiness_failure: ['not_ready'],
  /** A Telegram update or callback that had already been handled. */
  dedupe_hit: ['update', 'callback'],
  admission_result: ['admitted', 'already_admitted', 'blocked', 'rejected'],
  run_terminal_state: ['completed', 'blocked', 'failed', 'cancelled'],
  outbox_retry: ['attempt', 'exhausted'],
  delivery_receipt: ['sent', 'failed', 'ambiguous'],
} as const;

export type TransportWorkCounterName = keyof typeof TRANSPORT_WORK_COUNTERS;
export type TransportWorkCounterLabel<TName extends TransportWorkCounterName> =
  (typeof TRANSPORT_WORK_COUNTERS)[TName][number];

/** Coarse buckets for how long an owner decision was outstanding. */
export const DECISION_LATENCY_BUCKETS = ['under_1m', 'under_10m', 'under_1h', 'over_1h'] as const;
export type TransportWorkDecisionLatencyBucket = (typeof DECISION_LATENCY_BUCKETS)[number];

export interface TransportWorkTelemetrySnapshot {
  counters: Record<string, number>;
  decisionLatency: Record<
    TransportWorkDecisionLatencyBucket,
    { count: number; totalMs: number }
  >;
}

export interface TransportWorkTelemetry {
  record<TName extends TransportWorkCounterName>(
    name: TName,
    label: TransportWorkCounterLabel<TName>,
  ): void;
  /** Records how long an owner decision was outstanding, in buckets. */
  recordDecisionLatency(elapsedMs: number): void;
  snapshot(): TransportWorkTelemetrySnapshot;
}

export function resolveDecisionLatencyBucket(
  elapsedMs: number,
): TransportWorkDecisionLatencyBucket {
  if (elapsedMs < 60_000) {
    return 'under_1m';
  }
  if (elapsedMs < 600_000) {
    return 'under_10m';
  }
  if (elapsedMs < 3_600_000) {
    return 'under_1h';
  }
  return 'over_1h';
}

export function createTransportWorkTelemetry(): TransportWorkTelemetry {
  const counters = new Map<string, number>();
  const decisionLatency = new Map<
    TransportWorkDecisionLatencyBucket,
    { count: number; totalMs: number }
  >();

  return {
    record(name, label) {
      const allowed = TRANSPORT_WORK_COUNTERS[name] as readonly string[] | undefined;
      // Refuse rather than record: an unknown label is either a bug or a value
      // that came from somewhere it should not have.
      if (allowed === undefined || !allowed.includes(label as string)) {
        return;
      }
      const key = `${name}.${label}`;
      counters.set(key, (counters.get(key) ?? 0) + 1);
    },

    recordDecisionLatency(elapsedMs: number) {
      if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
        return;
      }
      const bucket = resolveDecisionLatencyBucket(elapsedMs);
      const existing = decisionLatency.get(bucket) ?? { count: 0, totalMs: 0 };
      decisionLatency.set(bucket, {
        count: existing.count + 1,
        totalMs: existing.totalMs + elapsedMs,
      });
    },

    snapshot() {
      const latency = {} as TransportWorkTelemetrySnapshot['decisionLatency'];
      for (const bucket of DECISION_LATENCY_BUCKETS) {
        latency[bucket] = decisionLatency.get(bucket) ?? { count: 0, totalMs: 0 };
      }
      return {
        counters: Object.fromEntries([...counters.entries()].sort()),
        decisionLatency: latency,
      };
    },
  };
}
