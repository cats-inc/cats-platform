import { createHash, randomBytes } from 'node:crypto';

import {
  NATIVE_GOOGLE_CALLBACK_PATH,
  NATIVE_GOOGLE_TRANSACTION_TTL_MS,
  type NativeGoogleAuthBinding,
  type NativeGoogleAuthCompleteInput,
  type NativeGoogleAuthProof,
  type NativeGoogleAuthStartResult,
} from '../../shared/nativeGoogleAuth.js';
import {
  verifyPlatformGoogleIdentityToken,
  type PlatformGoogleIdTokenVerifier,
  type PlatformVerifiedGoogleIdentity,
} from './googleVerifier.js';

export const MAX_PENDING_PLATFORM_GOOGLE_TRANSACTIONS = 32;

export type PlatformGoogleProofErrorCode =
  | 'not_configured' | 'invalid_binding' | 'invalid_callback' | 'capacity'
  | 'unknown_or_expired' | 'transaction_mismatch' | 'invalid_identity' | 'binding_mismatch';

export class PlatformGoogleProofError extends Error {
  constructor(public readonly code: PlatformGoogleProofErrorCode) {
    super('Google confirmation is not valid for this action.');
    this.name = 'PlatformGoogleProofError';
  }
}

export interface PlatformGoogleProofStore {
  consume(input: {
    token: string;
    binding: NativeGoogleAuthBinding;
  }): PlatformVerifiedGoogleIdentity;
  revokeForSession(sessionId: string): void;
  clearForReset(): void;
}

interface PendingTransaction {
  binding: NativeGoogleAuthBinding;
  start: NativeGoogleAuthStartResult;
  phase: 'pending' | 'verifying' | 'ready';
  proofHash?: string;
  identity?: PlatformVerifiedGoogleIdentity;
  actionToken?: string;
}

/**
 * One instance per running profile. begin/complete are trusted private-host
 * operations, deliberately absent from public HTTP. The consumer-facing store
 * can only consume capabilities. No tokens or transactions survive restart.
 */
export class MemoryPlatformGoogleProofStore implements PlatformGoogleProofStore {
  private readonly transactions = new Map<string, PendingTransaction>();
  private readonly now: () => Date;
  private readonly clientId: string | null;
  private readonly hostedDomains: readonly string[];
  private readonly verifier: PlatformGoogleIdTokenVerifier;

  constructor(options: {
    clientId: string | null;
    verifier: PlatformGoogleIdTokenVerifier;
    hostedDomains?: readonly string[];
    now?: () => Date;
  }) {
    this.now = options.now ?? (() => new Date());
    this.clientId = options.clientId?.trim() || null;
    this.hostedDomains = [...options.hostedDomains ?? []];
    this.verifier = options.verifier;
  }

  begin(input: {
    binding: NativeGoogleAuthBinding;
    callbackUrl: string;
    actionToken?: string;
  }): NativeGoogleAuthStartResult {
    if (!this.clientId) throw new PlatformGoogleProofError('not_configured');
    assertBinding(input.binding);
    assertCallback(input.callbackUrl);
    this.prune();
    // One current transaction per host window. Replacement also invalidates
    // an in-flight verification or a previously completed provisional proof.
    this.cancelContext(input.binding.contextId);
    if (this.transactions.size >= MAX_PENDING_PLATFORM_GOOGLE_TRANSACTIONS) {
      throw new PlatformGoogleProofError('capacity');
    }
    const start: NativeGoogleAuthStartResult = {
      transactionId: randomToken(),
      state: randomToken(),
      nonce: randomToken(),
      callbackUrl: input.callbackUrl,
      expiresAt: new Date(this.now().getTime() + NATIVE_GOOGLE_TRANSACTION_TTL_MS).toISOString(),
    };
    this.transactions.set(start.transactionId, {
      binding: structuredClone(input.binding), start, phase: 'pending',
      actionToken: input.actionToken,
    });
    return { ...start };
  }

  /** Trusted issuer metadata only; never part of the consumer/renderer interface. */
  readTransaction(id: string): { binding: NativeGoogleAuthBinding; actionToken?: string } {
    this.prune();
    const transaction = this.transactions.get(id);
    if (!transaction) throw new PlatformGoogleProofError('unknown_or_expired');
    return { binding: structuredClone(transaction.binding), actionToken: transaction.actionToken };
  }

  async complete(input: NativeGoogleAuthCompleteInput): Promise<NativeGoogleAuthProof> {
    this.prune();
    const pending = this.transactions.get(input.transactionId);
    if (!pending || pending.phase !== 'pending') {
      throw new PlatformGoogleProofError('unknown_or_expired');
    }
    if (input.state !== pending.start.state || input.callbackUrl !== pending.start.callbackUrl) {
      this.transactions.delete(input.transactionId);
      throw new PlatformGoogleProofError('transaction_mismatch');
    }
    pending.phase = 'verifying';
    try {
      const identity = await verifyPlatformGoogleIdentityToken({
        token: input.idToken,
        audiences: [this.clientId!],
        hostedDomains: this.hostedDomains,
        expectedNonce: pending.start.nonce,
        verifier: this.verifier,
        now: this.now(),
        clockSkewMs: 0,
      });
      // Cancellation/reset/replacement/expiry during asynchronous verification
      // must never resurrect a proof. Also cap it at the verified JWT expiry.
      this.prune();
      if (this.transactions.get(input.transactionId) !== pending) {
        throw new PlatformGoogleProofError('unknown_or_expired');
      }
      const expiresAt = new Date(Math.min(
        Date.parse(pending.start.expiresAt), Date.parse(identity.expiresAt),
      )).toISOString();
      if (Date.parse(expiresAt) <= this.now().getTime()) {
        throw new PlatformGoogleProofError('unknown_or_expired');
      }
      const proofToken = randomToken();
      pending.start.expiresAt = expiresAt;
      pending.identity = identity;
      pending.proofHash = hashProof(proofToken);
      pending.phase = 'ready';
      return { proofToken, expiresAt };
    } catch (error) {
      this.transactions.delete(input.transactionId);
      // An upstream verifier's raw errors can contain provider material.
      throw error instanceof PlatformGoogleProofError
        ? error : new PlatformGoogleProofError('invalid_identity');
    }
  }

  consume(input: { token: string; binding: NativeGoogleAuthBinding }): PlatformVerifiedGoogleIdentity {
    this.prune();
    const hash = hashProof(input.token);
    const found = [...this.transactions.entries()].find(([, pending]) =>
      pending.phase === 'ready' && pending.proofHash === hash,
    );
    if (!found) throw new PlatformGoogleProofError('unknown_or_expired');
    const [id, pending] = found;
    // Spend even on a wrong account/session/purpose/attempt/context.
    this.transactions.delete(id);
    if (!sameBinding(pending.binding, input.binding)) {
      throw new PlatformGoogleProofError('binding_mismatch');
    }
    return structuredClone(pending.identity!);
  }

  cancelContext(contextId: string): void {
    for (const [id, pending] of this.transactions) {
      if (pending.binding.contextId === contextId) this.transactions.delete(id);
    }
  }

  cancelTransaction(id: string, contextId: string): void {
    if (this.transactions.get(id)?.binding.contextId === contextId) this.transactions.delete(id);
  }

  revokeForSession(sessionId: string): void {
    for (const [id, pending] of this.transactions) {
      if ('sessionId' in pending.binding && pending.binding.sessionId === sessionId) {
        this.transactions.delete(id);
      }
    }
  }

  clearForReset(): void { this.transactions.clear(); }

  private prune(): void {
    for (const [id, pending] of this.transactions) {
      if (Date.parse(pending.start.expiresAt) <= this.now().getTime()) this.transactions.delete(id);
    }
  }
}

function assertBinding(binding: NativeGoogleAuthBinding): void {
  const required = [binding.contextId];
  switch (binding.purpose) {
    case 'bootstrap': required.push(binding.attemptId); break;
    case 'login': break;
    case 'link_google':
    case 'set_password': required.push(binding.accountId, binding.sessionId); break;
    default: throw new PlatformGoogleProofError('invalid_binding');
  }
  if (required.some((value) => typeof value !== 'string' || !value.trim())) {
    throw new PlatformGoogleProofError('invalid_binding');
  }
}

function sameBinding(left: NativeGoogleAuthBinding, right: NativeGoogleAuthBinding): boolean {
  if (left.contextId !== right.contextId || left.purpose !== right.purpose) return false;
  if (left.purpose === 'bootstrap') {
    return right.purpose === 'bootstrap' && left.attemptId === right.attemptId;
  }
  if (left.purpose === 'login') return true;
  return 'accountId' in right && left.accountId === right.accountId
    && left.sessionId === right.sessionId;
}

function assertCallback(value: string): void {
  let url: URL;
  try { url = new URL(value); } catch { throw new PlatformGoogleProofError('invalid_callback'); }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || Number(url.port) < 1
    || url.pathname !== NATIVE_GOOGLE_CALLBACK_PATH || url.search || url.hash
    || url.username || url.password || url.href !== value) {
    throw new PlatformGoogleProofError('invalid_callback');
  }
}

function randomToken(): string { return randomBytes(32).toString('base64url'); }
function hashProof(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}
