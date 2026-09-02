/**
 * Durable transport delivery outbox (SPEC-114 FR-32..FR-33, FR-42..FR-47).
 *
 * This is a narrow, replaceable platform interface rather than a new Core
 * record family (ADR-112 section 1). The first implementation is in-memory and
 * is the same shape a Telegram-store-backed implementation must satisfy, so the
 * storage swap is later and local.
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
  /** Flushes every non-terminal row for a work item, in sequence order. */
  flushWorkItem(workItemId: string): Promise<TransportWorkOutboxFlushResult[]>;
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
}

function isTerminalState(state: TransportWorkDeliveryState): boolean {
  return state === 'sent';
}

export function createTransportWorkOutbox(
  options: TransportWorkOutboxOptions,
): TransportWorkOutbox {
  const now = options.now ?? (() => new Date());
  const telemetry = options.telemetry;
  const rows = new Map<string, TransportWorkDeliveryV1>();
  const sequenceByWorkItem = new Map<string, number>();

  for (const row of options.initialRows ?? []) {
    rows.set(row.idempotencyKey, { ...row });
    const highest = sequenceByWorkItem.get(row.workItemId) ?? 0;
    sequenceByWorkItem.set(row.workItemId, Math.max(highest, row.sequence));
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
    if (isTerminalState(row.state)) {
      telemetry?.record('dedupe_hit', 'update');
      return { outcome: 'already_sent', row };
    }
    if (isStaleRoutine(row)) {
      const suppressed: TransportWorkDeliveryV1 = {
        ...row,
        state: 'failed',
        lastErrorCode: 'suppressed_stale',
        updatedAt: now().toISOString(),
      };
      rows.set(suppressed.idempotencyKey, suppressed);
      return { outcome: 'suppressed_stale', row: suppressed };
    }

    const sending: TransportWorkDeliveryV1 = {
      ...row,
      state: 'sending',
      attemptCount: row.attemptCount + 1,
      updatedAt: now().toISOString(),
    };
    rows.set(sending.idempotencyKey, sending);

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
      rows.set(sent.idempotencyKey, sent);
      return { outcome: 'sent', row: sent };
    }

    // An ambiguous send stays `pending`: the message may already be on the
    // wire, so the row must be reconciled rather than blindly retried.
    const failed: TransportWorkDeliveryV1 = {
      ...sending,
      state: result.ambiguous === true ? 'pending' : 'failed',
      lastErrorCode: result.errorCode ?? 'send_failed',
      updatedAt: now().toISOString(),
    };
    rows.set(failed.idempotencyKey, failed);
    telemetry?.record('delivery_receipt', result.ambiguous === true ? 'ambiguous' : 'failed');
    return { outcome: result.ambiguous === true ? 'ambiguous' : 'failed', row: failed };
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
      rows.set(row.idempotencyKey, row);
      return row;
    },

    async flush(idempotencyKey) {
      const row = rows.get(idempotencyKey);
      if (!row) {
        throw new Error(`Unknown transport work delivery key: ${idempotencyKey}`);
      }
      return flushRow(row);
    },

    async flushWorkItem(workItemId) {
      const results: TransportWorkOutboxFlushResult[] = [];
      // Sequential on purpose: causal ordering per work item is a requirement,
      // not an implementation detail (FR-33).
      for (const row of listRows(workItemId)) {
        if (isTerminalState(row.state)) {
          continue;
        }
        results.push(await flushRow(rows.get(row.idempotencyKey) ?? row));
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
