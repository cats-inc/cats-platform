/**
 * Durable transport delivery outbox (SPEC-114 FR-32..FR-33, FR-42..FR-47).
 *
 * This is a narrow, replaceable platform interface rather than a new Core
 * record family (ADR-112 section 1). Production supplies a transport state
 * store; isolated tests may keep using the in-memory form.
 *
 * Three invariants earn this module its existence:
 *
 *  1. one `idempotencyKey` sends at most one external message, across duplicate
 *     callbacks, retries, and process restarts;
 *  2. messages for one work item are sent in causal order;
 *  3. a routine progress message that lost its race against a newer decision or
 *     terminal message is dropped rather than delivered late.
 */

import type {
  TransportWorkDeliveryPayload,
  TransportWorkDeliveryPurpose,
  TransportWorkDeliveryState,
  TransportWorkDeliveryV1,
} from './contracts.js';
import type { TransportWorkTelemetry } from './telemetry.js';
import type { TransportWorkStateStore } from './stateStore.js';

/** Purposes that must never be suppressed by a newer message. */
const PRIORITY_PURPOSES: ReadonlySet<TransportWorkDeliveryPurpose> = new Set([
  'decision',
  'result',
  'publish_result',
]);

/** Purposes that are routine and may be coalesced away when stale. */
const ROUTINE_PURPOSES: ReadonlySet<TransportWorkDeliveryPurpose> = new Set([
  'progress',
]);

export interface TransportWorkOutboxEnqueueInput {
  idempotencyKey: string;
  bindingId: string;
  externalConversationRef: string;
  workItemId: string;
  taskId?: string | null;
  runId?: string | null;
  purpose: TransportWorkDeliveryPurpose;
  payload: TransportWorkDeliveryPayload;
}

export interface TransportWorkOutboxSendResult {
  ok: boolean;
  externalMessageRef: string | null;
  errorCode?: string | null;
  /**
   * Set when the transport call failed in a way that cannot prove whether the
   * message was delivered (timeout, aborted socket). FR-47 keeps such a row
   * out of `failed` so recovery reconciles instead of double-sending.
   */
  ambiguous?: boolean;
}

export type TransportWorkOutboxSender = (
  row: TransportWorkDeliveryV1,
) => Promise<TransportWorkOutboxSendResult>;

export type TransportWorkOutboxFlushOutcome =
  | 'sent'
  | 'already_sent'
  | 'suppressed_stale'
  | 'failed'
  | 'ambiguous';

export interface TransportWorkOutboxFlushResult {
  outcome: TransportWorkOutboxFlushOutcome;
  row: TransportWorkDeliveryV1;
}

export interface TransportWorkOutbox {
  /** Idempotent: an existing key returns the stored row untouched. */
  enqueue(input: TransportWorkOutboxEnqueueInput): TransportWorkDeliveryV1;
  flush(idempotencyKey: string): Promise<TransportWorkOutboxFlushResult>;
  /** Explicit owner retry; this is the only operation allowed to re-drive ambiguity. */
  retry(idempotencyKey: string): Promise<TransportWorkOutboxFlushResult>;
  /** Flushes every non-terminal row for a work item, in sequence order. */
  flushWorkItem(workItemId: string): Promise<TransportWorkOutboxFlushResult[]>;
  /** Startup recovery sends only rows that were safely pending before a crash. */
  recoverPending(): Promise<TransportWorkOutboxFlushResult[]>;
  get(idempotencyKey: string): TransportWorkDeliveryV1 | null;
  list(workItemId: string): TransportWorkDeliveryV1[];
  /** True once a `result` or `publish_result` row reached `sent`. */
  hasDeliveredResult(workItemId: string): boolean;
}

export interface TransportWorkOutboxOptions {
  send: TransportWorkOutboxSender;
  now?: () => Date;
  /** Seeds durable rows recovered from disk after a restart. */
  initialRows?: readonly TransportWorkDeliveryV1[];
  /** Optional counters. Absent means the path runs unmeasured, never broken. */
  telemetry?: TransportWorkTelemetry;
  /** Durable storage for intents, attempts, and receipts. */
  store?: TransportWorkStateStore;
}

function isTerminalState(state: TransportWorkDeliveryState): boolean {
  return state === 'sent' || state === 'ambiguous';
}

export function createTransportWorkOutbox(
  options: TransportWorkOutboxOptions,
): TransportWorkOutbox {
  const now = options.now ?? (() => new Date());
  const telemetry = options.telemetry;
  const rows = new Map<string, TransportWorkDeliveryV1>();
  const sequenceByWorkItem = new Map<string, number>();
  const inFlight = new Map<string, Promise<TransportWorkOutboxFlushResult>>();

  const recoveredRows = [
    ...(options.store?.listDeliveries() ?? []),
    ...(options.initialRows ?? []),
  ];
  for (const recovered of recoveredRows) {
    // A process that died while `send` was in flight cannot know whether the
    // transport accepted the message. Preserve that uncertainty; never turn it
    // into an automatic duplicate after restart.
    const wasInterrupted = recovered.state === 'sending';
    const row: TransportWorkDeliveryV1 = wasInterrupted
      ? {
        ...recovered,
        state: 'ambiguous',
        lastErrorCode: recovered.lastErrorCode ?? 'interrupted_send',
        updatedAt: now().toISOString(),
      }
      : { ...recovered };
    rows.set(row.idempotencyKey, row);
    if (wasInterrupted) {
      options.store?.putDelivery(row);
    }
    const highest = sequenceByWorkItem.get(row.workItemId) ?? 0;
    sequenceByWorkItem.set(row.workItemId, Math.max(highest, row.sequence));
  }

  function put(row: TransportWorkDeliveryV1): void {
    rows.set(row.idempotencyKey, row);
    options.store?.putDelivery(row);
  }

  function nextSequence(workItemId: string): number {
    const next = (sequenceByWorkItem.get(workItemId) ?? 0) + 1;
    sequenceByWorkItem.set(workItemId, next);
    return next;
  }

  function listRows(workItemId: string): TransportWorkDeliveryV1[] {
    return [...rows.values()]
      .filter((row) => row.workItemId === workItemId)
      .sort((left, right) => left.sequence - right.sequence);
  }

  /**
   * A routine progress row is stale once a priority row with a higher sequence
   * exists, whether or not that row has been sent yet. Waiting for the newer
   * row to send first would let a slow decision message unblock an obsolete
   * progress message behind it.
   */
  function isStaleRoutine(row: TransportWorkDeliveryV1): boolean {
    if (!ROUTINE_PURPOSES.has(row.purpose)) {
      return false;
    }
    return listRows(row.workItemId).some((candidate) =>
      candidate.sequence > row.sequence
      && (PRIORITY_PURPOSES.has(candidate.purpose) || candidate.purpose === 'progress'),
    );
  }

  async function flushRow(row: TransportWorkDeliveryV1): Promise<TransportWorkOutboxFlushResult> {
    if (row.state === 'sent') {
      telemetry?.record('dedupe_hit', 'update');
      return { outcome: 'already_sent', row };
    }
    if (row.state === 'ambiguous') {
      return { outcome: 'ambiguous', row };
    }
    if (isStaleRoutine(row)) {
      const suppressed: TransportWorkDeliveryV1 = {
        ...row,
        state: 'failed',
        lastErrorCode: 'suppressed_stale',
        updatedAt: now().toISOString(),
      };
      put(suppressed);
      return { outcome: 'suppressed_stale', row: suppressed };
    }

    const sending: TransportWorkDeliveryV1 = {
      ...row,
      state: 'sending',
      attemptCount: row.attemptCount + 1,
      updatedAt: now().toISOString(),
    };
    put(sending);

    let result: TransportWorkOutboxSendResult;
    try {
      result = await options.send(sending);
    } catch (error) {
      result = {
        ok: false,
        externalMessageRef: null,
        errorCode: error instanceof Error ? error.name : 'send_threw',
        ambiguous: true,
      };
    }

    if (sending.attemptCount > 1) {
      telemetry?.record('outbox_retry', 'attempt');
    }

    if (result.ok) {
      telemetry?.record('delivery_receipt', 'sent');
      const sent: TransportWorkDeliveryV1 = {
        ...sending,
        state: 'sent',
        externalMessageRef: result.externalMessageRef,
        lastErrorCode: null,
        updatedAt: now().toISOString(),
        sentAt: now().toISOString(),
      };
      put(sent);
      return { outcome: 'sent', row: sent };
    }

    // Ambiguity is terminal for automatic recovery. Only an explicit owner
    // retry may move it back to pending, because the message may be on the wire.
    const failed: TransportWorkDeliveryV1 = {
      ...sending,
      state: result.ambiguous === true ? 'ambiguous' : 'failed',
      lastErrorCode: result.errorCode ?? 'send_failed',
      updatedAt: now().toISOString(),
    };
    put(failed);
    telemetry?.record('delivery_receipt', result.ambiguous === true ? 'ambiguous' : 'failed');
    return { outcome: result.ambiguous === true ? 'ambiguous' : 'failed', row: failed };
  }

  function flushOne(idempotencyKey: string): Promise<TransportWorkOutboxFlushResult> {
    const active = inFlight.get(idempotencyKey);
    if (active) {
      return active;
    }
    const row = rows.get(idempotencyKey);
    if (!row) {
      return Promise.reject(
        new Error(`Unknown transport work delivery key: ${idempotencyKey}`),
      );
    }
    const started = flushRow(row).finally(() => {
      if (inFlight.get(idempotencyKey) === started) {
        inFlight.delete(idempotencyKey);
      }
    });
    inFlight.set(idempotencyKey, started);
    return started;
  }

  return {
    enqueue(input) {
      const existing = rows.get(input.idempotencyKey);
      if (existing) {
        return existing;
      }
      const timestamp = now().toISOString();
      const row: TransportWorkDeliveryV1 = {
        version: 1,
        idempotencyKey: input.idempotencyKey,
        bindingId: input.bindingId,
        externalConversationRef: input.externalConversationRef,
        workItemId: input.workItemId,
        taskId: input.taskId ?? null,
        runId: input.runId ?? null,
        purpose: input.purpose,
        payload: input.payload,
        state: 'pending',
        externalMessageRef: null,
        attemptCount: 0,
        lastErrorCode: null,
        sequence: nextSequence(input.workItemId),
        createdAt: timestamp,
        updatedAt: timestamp,
        sentAt: null,
      };
      put(row);
      return row;
    },

    flush(idempotencyKey) {
      return flushOne(idempotencyKey);
    },

    async retry(idempotencyKey) {
      const active = inFlight.get(idempotencyKey);
      if (active) {
        return active;
      }
      const row = rows.get(idempotencyKey);
      if (!row) {
        throw new Error(`Unknown transport work delivery key: ${idempotencyKey}`);
      }
      if (row.state === 'sent') {
        return { outcome: 'already_sent', row };
      }
      const pending: TransportWorkDeliveryV1 = {
        ...row,
        state: 'pending',
        updatedAt: now().toISOString(),
      };
      put(pending);
      return flushOne(idempotencyKey);
    },

    async flushWorkItem(workItemId) {
      const results: TransportWorkOutboxFlushResult[] = [];
      // Sequential on purpose: causal ordering per work item is a requirement,
      // not an implementation detail (FR-33).
      for (const row of listRows(workItemId)) {
        if (isTerminalState(row.state)) {
          continue;
        }
        results.push(await flushOne(row.idempotencyKey));
      }
      return results;
    },

    async recoverPending() {
      const results: TransportWorkOutboxFlushResult[] = [];
      const pending = [...rows.values()]
        .filter((row) => row.state === 'pending')
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt)
          || left.sequence - right.sequence);
      for (const row of pending) {
        results.push(await flushOne(row.idempotencyKey));
      }
      return results;
    },

    get(idempotencyKey) {
      return rows.get(idempotencyKey) ?? null;
    },

    list(workItemId) {
      return listRows(workItemId);
    },

    hasDeliveredResult(workItemId) {
      return listRows(workItemId).some((row) =>
        row.state === 'sent'
        && (row.purpose === 'result' || row.purpose === 'publish_result'),
      );
    },
  };
}

/**
 * Stable idempotency key for one outbound message.
 *
 * Every input is either an authoritative id or an owner-visible revision, so
 * the same logical message recomputes the same key after a restart.
 */
export function buildTransportWorkDeliveryKey(input: {
  bindingId: string;
  workItemId: string;
  purpose: TransportWorkDeliveryPurpose;
  discriminator: string;
}): string {
  return [
    'twd',
    input.bindingId,
    input.workItemId,
    input.purpose,
    input.discriminator,
  ].join(':');
}
