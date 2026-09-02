/**
 * Durable state owned by the transport work-delivery boundary.
 *
 * Cats Core remains the work ledger. This store contains only the transport
 * details Core deliberately does not own: opaque callback grants and outbound
 * delivery intents/receipts. Both families share one atomic file so a token or
 * receipt update cannot overwrite the other family with a stale snapshot.
 */

import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import type {
  TransportWorkActionTokenV1,
  TransportWorkDeliveryV1,
} from './contracts.js';

interface PersistedTransportWorkState {
  version: 1;
  deliveries: TransportWorkDeliveryV1[];
  actionTokens: TransportWorkActionTokenV1[];
}

export interface TransportWorkStateStore {
  listDeliveries(): TransportWorkDeliveryV1[];
  putDelivery(row: TransportWorkDeliveryV1): void;
  listActionTokens(): TransportWorkActionTokenV1[];
  putActionToken(token: TransportWorkActionTokenV1): void;
  deleteActionToken(token: string): boolean;
  deleteActionTokensForWorkItem(workItemId: string): number;
}

const DELIVERY_PURPOSES = new Set([
  'ack',
  'proposal',
  'progress',
  'decision',
  'result',
  'publish_result',
]);
const DELIVERY_STATES = new Set(['pending', 'sending', 'sent', 'failed', 'ambiguous']);
const ACTIONS = new Set([
  'start_work',
  'cancel',
  'approve',
  'deny',
  'retry',
  'resume',
  'publish',
  'view',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return typeof value === 'string' || value === null;
}

function isDelivery(value: unknown): value is TransportWorkDeliveryV1 {
  if (!isRecord(value) || !isRecord(value.payload) || !Array.isArray(value.payload.actions)) {
    return false;
  }
  return value.version === 1
    && typeof value.idempotencyKey === 'string'
    && typeof value.bindingId === 'string'
    && typeof value.externalConversationRef === 'string'
    && typeof value.workItemId === 'string'
    && isStringOrNull(value.taskId)
    && isStringOrNull(value.runId)
    && typeof value.purpose === 'string'
    && DELIVERY_PURPOSES.has(value.purpose)
    && typeof value.payload.text === 'string'
    && isStringOrNull(value.payload.deepLink)
    && typeof value.state === 'string'
    && DELIVERY_STATES.has(value.state)
    && isStringOrNull(value.externalMessageRef)
    && typeof value.attemptCount === 'number'
    && isStringOrNull(value.lastErrorCode)
    && typeof value.sequence === 'number'
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string'
    && isStringOrNull(value.sentAt);
}

function isActionToken(value: unknown): value is TransportWorkActionTokenV1 {
  return isRecord(value)
    && value.version === 1
    && typeof value.token === 'string'
    && typeof value.bindingId === 'string'
    && typeof value.ownerActorId === 'string'
    && typeof value.externalUserRef === 'string'
    && typeof value.workItemId === 'string'
    && typeof value.proposalRevision === 'number'
    && typeof value.proposalDigest === 'string'
    && typeof value.action === 'string'
    && ACTIONS.has(value.action)
    && typeof value.issuedAt === 'string'
    && typeof value.expiresAt === 'string';
}

function emptyState(): PersistedTransportWorkState {
  return { version: 1, deliveries: [], actionTokens: [] };
}

function readState(statePath: string): PersistedTransportWorkState {
  if (!existsSync(statePath)) {
    return emptyState();
  }
  try {
    const value: unknown = JSON.parse(readFileSync(statePath, 'utf8'));
    if (!isRecord(value) || value.version !== 1) {
      throw new Error('unsupported or missing state version');
    }
    if (!Array.isArray(value.deliveries) || !value.deliveries.every(isDelivery)) {
      throw new Error('invalid delivery row');
    }
    if (!Array.isArray(value.actionTokens) || !value.actionTokens.every(isActionToken)) {
      throw new Error('invalid action token');
    }
    return {
      version: 1,
      deliveries: value.deliveries,
      actionTokens: value.actionTokens,
    };
  } catch (error) {
    throw new Error(
      `Cannot read durable transport-work state at ${statePath}: `
      + (error instanceof Error ? error.message : String(error)),
      { cause: error },
    );
  }
}

function writeState(statePath: string, state: PersistedTransportWorkState): void {
  const directory = path.dirname(statePath);
  mkdirSync(directory, { recursive: true });
  const tempPath = path.join(
    directory,
    `.${path.basename(statePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    writeFileSync(tempPath, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
    renameSync(tempPath, statePath);
  } finally {
    if (existsSync(tempPath)) {
      rmSync(tempPath, { force: true });
    }
  }
}

class MemoryTransportWorkStateStore implements TransportWorkStateStore {
  protected readonly deliveries = new Map<string, TransportWorkDeliveryV1>();
  protected readonly actionTokens = new Map<string, TransportWorkActionTokenV1>();

  constructor(initial: PersistedTransportWorkState = emptyState()) {
    for (const row of initial.deliveries) {
      this.deliveries.set(row.idempotencyKey, structuredClone(row));
    }
    for (const token of initial.actionTokens) {
      this.actionTokens.set(token.token, { ...token });
    }
  }

  listDeliveries(): TransportWorkDeliveryV1[] {
    return [...this.deliveries.values()].map((row) => structuredClone(row));
  }

  putDelivery(row: TransportWorkDeliveryV1): void {
    this.deliveries.set(row.idempotencyKey, structuredClone(row));
    this.changed();
  }

  listActionTokens(): TransportWorkActionTokenV1[] {
    return [...this.actionTokens.values()].map((token) => ({ ...token }));
  }

  putActionToken(token: TransportWorkActionTokenV1): void {
    this.actionTokens.set(token.token, { ...token });
    this.changed();
  }

  deleteActionToken(token: string): boolean {
    const removed = this.actionTokens.delete(token);
    if (removed) {
      this.changed();
    }
    return removed;
  }

  deleteActionTokensForWorkItem(workItemId: string): number {
    let removed = 0;
    for (const [key, token] of this.actionTokens) {
      if (token.workItemId === workItemId) {
        this.actionTokens.delete(key);
        removed += 1;
      }
    }
    if (removed > 0) {
      this.changed();
    }
    return removed;
  }

  protected changed(): void {}

  protected snapshot(): PersistedTransportWorkState {
    return {
      version: 1,
      deliveries: this.listDeliveries(),
      actionTokens: this.listActionTokens(),
    };
  }
}

class FileTransportWorkStateStore extends MemoryTransportWorkStateStore {
  constructor(private readonly statePath: string) {
    super(readState(statePath));
  }

  protected override changed(): void {
    writeState(this.statePath, this.snapshot());
  }
}

export function createMemoryTransportWorkStateStore(): TransportWorkStateStore {
  return new MemoryTransportWorkStateStore();
}

export function createFileTransportWorkStateStore(statePath: string): TransportWorkStateStore {
  return new FileTransportWorkStateStore(statePath);
}

export function resolveTransportWorkStatePath(platformStateDir: string): string {
  return path.join(platformStateDir, 'transport-work-delivery.json');
}
