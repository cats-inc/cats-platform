import { randomBytes, timingSafeEqual } from 'node:crypto';

import { hashSessionToken } from './session.js';

/**
 * Short-lived, single-use, purpose-bound step-up capability.
 *
 * ADR-111 section 3 rejects both a renderer-only password modal and a broad
 * `recentlyAuthenticatedAt` timestamp on the session: the first is not an
 * authorization boundary at all, and the second can authorize several
 * unrelated sensitive actions. A grant is therefore bound to one account, one
 * browser session, and one purpose, and is consumed on the first attempt that
 * presents it — whether or not the rest of that attempt succeeds.
 *
 * Grants live in memory only. They are five-minute capabilities that should
 * die with the process, so they are never written to the auth-state file.
 */

export const PLATFORM_AUTH_ACTION_GRANT_TTL_MS = 5 * 60 * 1000;
export const PLATFORM_AUTH_ACTION_GRANT_TOKEN_BYTES = 32;
export const MAX_PENDING_PLATFORM_AUTH_ACTION_GRANTS = 32;
export const PLATFORM_AUTH_ACTION_HEADER = 'x-cats-auth-action';

export const PLATFORM_AUTH_ACTION_GRANT_PURPOSES = [
  'link_google',
  'unlink_google',
] as const;

export type PlatformAuthActionGrantPurpose =
  (typeof PLATFORM_AUTH_ACTION_GRANT_PURPOSES)[number];

export function isPlatformAuthActionGrantPurpose(
  value: unknown,
): value is PlatformAuthActionGrantPurpose {
  return typeof value === 'string'
    && (PLATFORM_AUTH_ACTION_GRANT_PURPOSES as readonly string[]).includes(value);
}

export interface PlatformAuthActionGrantIssueInput {
  accountId: string;
  sessionId: string;
  purpose: PlatformAuthActionGrantPurpose;
  sessionSecret: string;
  ttlMs?: number;
  now?: Date;
}

export interface PlatformAuthActionGrantIssueResult {
  token: string;
  expiresAt: string;
}

export interface PlatformAuthActionGrantConsumeInput {
  token: string;
  accountId: string;
  sessionId: string;
  purpose: PlatformAuthActionGrantPurpose;
  sessionSecret: string;
  now?: Date;
}

export type PlatformAuthActionGrantRejectionReason =
  | 'missing_token'
  | 'unknown_or_expired'
  | 'purpose_mismatch'
  | 'account_mismatch'
  | 'session_mismatch';

export type PlatformAuthActionGrantConsumeOutcome =
  | { ok: true; purpose: PlatformAuthActionGrantPurpose }
  | { ok: false; reason: PlatformAuthActionGrantRejectionReason };

export interface PlatformAuthActionGrantStore {
  issue(input: PlatformAuthActionGrantIssueInput): PlatformAuthActionGrantIssueResult;
  consume(input: PlatformAuthActionGrantConsumeInput): PlatformAuthActionGrantConsumeOutcome;
  revokeForSession(sessionId: string): void;
}

interface StoredPlatformAuthActionGrant {
  tokenHash: string;
  accountId: string;
  sessionId: string;
  purpose: PlatformAuthActionGrantPurpose;
  createdAt: string;
  expiresAt: string;
}

export class MemoryPlatformAuthActionGrantStore implements PlatformAuthActionGrantStore {
  private readonly grants = new Map<string, StoredPlatformAuthActionGrant>();

  issue(input: PlatformAuthActionGrantIssueInput): PlatformAuthActionGrantIssueResult {
    const accountId = input.accountId.trim();
    const sessionId = input.sessionId.trim();
    if (!accountId || !sessionId) {
      throw new Error('Action grant account and session ids are required.');
    }
    const now = input.now ?? new Date();
    this.prune(now);

    const ttlMs = input.ttlMs ?? PLATFORM_AUTH_ACTION_GRANT_TTL_MS;
    const token = randomBytes(PLATFORM_AUTH_ACTION_GRANT_TOKEN_BYTES).toString('base64url');
    const tokenHash = hashSessionToken(token, input.sessionSecret);
    const expiresAt = new Date(now.getTime() + ttlMs).toISOString();

    // A caller that keeps requesting grants without spending them must not be
    // able to grow this map without bound. Evicting the oldest entry keeps the
    // most recent step-up usable, which is the one the operator just performed.
    if (this.grants.size >= MAX_PENDING_PLATFORM_AUTH_ACTION_GRANTS) {
      const oldest = [...this.grants.entries()].sort(
        (left, right) => Date.parse(left[1].createdAt) - Date.parse(right[1].createdAt),
      )[0];
      if (oldest) {
        this.grants.delete(oldest[0]);
      }
    }

    this.grants.set(tokenHash, {
      tokenHash,
      accountId,
      sessionId,
      purpose: input.purpose,
      createdAt: now.toISOString(),
      expiresAt,
    });

    return { token, expiresAt };
  }

  consume(input: PlatformAuthActionGrantConsumeInput): PlatformAuthActionGrantConsumeOutcome {
    const token = input.token.trim();
    if (!token) {
      return { ok: false, reason: 'missing_token' };
    }
    const now = input.now ?? new Date();
    this.prune(now);

    const tokenHash = hashSessionToken(token, input.sessionSecret);
    const stored = this.grants.get(tokenHash) ?? null;
    if (!stored || !matchesTokenHash(stored.tokenHash, tokenHash)) {
      return { ok: false, reason: 'unknown_or_expired' };
    }

    // SPEC-113 requirement 22: the grant is spent on the first matching attempt
    // even when a later check in that same attempt fails.
    this.grants.delete(tokenHash);

    if (stored.purpose !== input.purpose) {
      return { ok: false, reason: 'purpose_mismatch' };
    }
    if (stored.accountId !== input.accountId) {
      return { ok: false, reason: 'account_mismatch' };
    }
    if (stored.sessionId !== input.sessionId) {
      return { ok: false, reason: 'session_mismatch' };
    }
    return { ok: true, purpose: stored.purpose };
  }

  revokeForSession(sessionId: string): void {
    for (const [tokenHash, grant] of this.grants) {
      if (grant.sessionId === sessionId) {
        this.grants.delete(tokenHash);
      }
    }
  }

  private prune(now: Date): void {
    const nowMs = now.getTime();
    for (const [tokenHash, grant] of this.grants) {
      if (Date.parse(grant.expiresAt) <= nowMs) {
        this.grants.delete(tokenHash);
      }
    }
  }
}

function matchesTokenHash(storedHash: string, candidateHash: string): boolean {
  const stored = Buffer.from(storedHash, 'utf8');
  const candidate = Buffer.from(candidateHash, 'utf8');
  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}
