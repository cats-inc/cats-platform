/**
 * Opaque action tokens for transport inline controls (SPEC-114 FR-13).
 *
 * Telegram `callback_data` is capped at 64 bytes and is fully attacker-editable,
 * so it must never carry entity ids, an actor, or a revision. It carries one
 * random opaque token; every authority decision is made here against
 * server-owned state.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';

import type {
  TransportWorkAction,
  TransportWorkActionTokenResolution,
  TransportWorkActionTokenV1,
} from './contracts.js';
import type { TransportWorkStateStore } from './stateStore.js';

/** Telegram's hard `callback_data` limit. */
const TELEGRAM_CALLBACK_DATA_MAX_BYTES = 64;

/** Prefix that routes a callback to the golden path, plus the token itself. */
const ACTION_TOKEN_PREFIX = 'gp:';

/** 18 random bytes -> 24 base64url chars; with the prefix that is 27 bytes. */
const ACTION_TOKEN_RANDOM_BYTES = 18;

const DEFAULT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export interface IssueTransportWorkActionTokenInput {
  bindingId: string;
  ownerActorId: string;
  externalUserRef: string;
  workItemId: string;
  proposalRevision: number;
  proposalDigest: string;
  action: TransportWorkAction;
}

/**
 * The live scope for one work item, looked up *after* the token's binding,
 * owner, and expiry have been checked.
 *
 * It is a callback rather than three plain fields because the caller cannot
 * know which work item to look up until the token has been identified, and
 * guessing (for example, by taking the first work item on the binding) silently
 * rejects valid buttons once a binding has more than one open request.
 */
export type TransportWorkActionScopeResolver = (workItemId: string) => {
  proposalRevision: number | null;
  proposalDigest: string | null;
  allowedActions: readonly TransportWorkAction[];
} | null;

export interface ResolveTransportWorkActionTokenInput {
  callbackData: string;
  /** The binding the callback actually arrived on. */
  bindingId: string;
  /** The Telegram user that pressed the button. */
  externalUserRef: string;
  /** Resolves the current scope for the work item the token names. */
  resolveScope: TransportWorkActionScopeResolver;
}

export interface TransportWorkActionTokenStore {
  issue(input: IssueTransportWorkActionTokenInput): TransportWorkActionTokenV1;
  resolve(input: ResolveTransportWorkActionTokenInput): TransportWorkActionTokenResolution;
  /** Drops every outstanding token for a work item; used when scope changes. */
  invalidateWorkItem(workItemId: string): number;
  size(): number;
}

export interface TransportWorkActionTokenStoreOptions {
  now?: () => Date;
  ttlMs?: number;
  /** Injectable for deterministic tests; must return unpredictable bytes. */
  randomToken?: () => string;
  /** Durable transport state. Production always supplies this. */
  store?: TransportWorkStateStore;
}

export function encodeTransportWorkCallbackData(token: string): string {
  return `${ACTION_TOKEN_PREFIX}${token}`;
}

export function decodeTransportWorkCallbackData(callbackData: string): string | null {
  if (!callbackData.startsWith(ACTION_TOKEN_PREFIX)) {
    return null;
  }
  const token = callbackData.slice(ACTION_TOKEN_PREFIX.length);
  return token.length > 0 ? token : null;
}

/**
 * Guards the Telegram limit at the point of construction rather than at send
 * time, where a silently-dropped keyboard looks like a product bug.
 */
export function isTransportWorkCallbackDataWithinLimit(callbackData: string): boolean {
  return Buffer.byteLength(callbackData, 'utf8') <= TELEGRAM_CALLBACK_DATA_MAX_BYTES;
}

function defaultRandomToken(): string {
  return randomBytes(ACTION_TOKEN_RANDOM_BYTES).toString('base64url');
}

/** Constant-time compare so token lookup cannot be probed by timing. */
function safeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function createTransportWorkActionTokenStore(
  options: TransportWorkActionTokenStoreOptions = {},
): TransportWorkActionTokenStore {
  const now = options.now ?? (() => new Date());
  const ttlMs = options.ttlMs ?? DEFAULT_TOKEN_TTL_MS;
  const randomToken = options.randomToken ?? defaultRandomToken;
  const tokens = new Map<string, TransportWorkActionTokenV1>(
    (options.store?.listActionTokens() ?? []).map((token) => [token.token, token]),
  );

  function removeExpired(): void {
    const timestamp = now().getTime();
    for (const [key, token] of tokens) {
      if (timestamp >= Date.parse(token.expiresAt)) {
        tokens.delete(key);
        options.store?.deleteActionToken(key);
      }
    }
  }

  function findToken(candidate: string): TransportWorkActionTokenV1 | null {
    const direct = tokens.get(candidate);
    if (direct && safeEquals(direct.token, candidate)) {
      return direct;
    }
    return null;
  }

  return {
    issue(input) {
      removeExpired();
      const issuedAt = now();
      const token: TransportWorkActionTokenV1 = {
        version: 1,
        token: randomToken(),
        bindingId: input.bindingId,
        ownerActorId: input.ownerActorId,
        externalUserRef: input.externalUserRef,
        workItemId: input.workItemId,
        proposalRevision: input.proposalRevision,
        proposalDigest: input.proposalDigest,
        action: input.action,
        issuedAt: issuedAt.toISOString(),
        expiresAt: new Date(issuedAt.getTime() + ttlMs).toISOString(),
      };
      tokens.set(token.token, token);
      options.store?.putActionToken(token);
      return token;
    },

    resolve(input) {
      const candidate = decodeTransportWorkCallbackData(input.callbackData);
      if (candidate === null) {
        return { status: 'rejected', reason: 'unknown_token' };
      }
      const token = findToken(candidate);
      if (token === null) {
        return { status: 'rejected', reason: 'unknown_token' };
      }
      // Binding and owner are checked before anything else so a cross-binding
      // replay never reveals whether the referenced scope still exists.
      if (token.bindingId !== input.bindingId) {
        return { status: 'rejected', reason: 'cross_binding' };
      }
      if (token.externalUserRef !== input.externalUserRef) {
        return { status: 'rejected', reason: 'unauthorized_owner' };
      }
      if (now().getTime() >= Date.parse(token.expiresAt)) {
        tokens.delete(token.token);
        options.store?.deleteActionToken(token.token);
        return { status: 'rejected', reason: 'expired' };
      }

      // Scope is resolved for the work item the token names, never for whatever
      // the transport guessed.
      const scope = input.resolveScope(token.workItemId);
      if (scope === null) {
        return { status: 'rejected', reason: 'unknown_token' };
      }
      if (
        scope.proposalRevision !== null
        && token.proposalRevision !== scope.proposalRevision
      ) {
        return { status: 'rejected', reason: 'stale_revision' };
      }
      if (
        scope.proposalDigest !== null
        && token.proposalDigest !== scope.proposalDigest
      ) {
        return { status: 'rejected', reason: 'digest_mismatch' };
      }
      if (!scope.allowedActions.includes(token.action)) {
        return { status: 'rejected', reason: 'action_not_allowed' };
      }
      return { status: 'resolved', token };
    },

    invalidateWorkItem(workItemId) {
      let removed = 0;
      for (const [key, token] of tokens) {
        if (token.workItemId === workItemId) {
          tokens.delete(key);
          removed += 1;
        }
      }
      options.store?.deleteActionTokensForWorkItem(workItemId);
      return removed;
    },

    size() {
      return tokens.size;
    },
  };
}
