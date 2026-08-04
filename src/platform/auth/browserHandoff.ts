import {
  PLATFORM_RUNTIME_DASHBOARD_PATH,
  PLATFORM_RUNTIME_PLAYGROUND_PATH,
  PLATFORM_RUNTIME_SETUP_PATH,
} from '../../shared/runtimeIngressPaths.js';
export { PLATFORM_BROWSER_HANDOFF_EXCHANGE_PATH } from '../../shared/browserHandoff.js';
import {
  generateSessionTokenMaterial,
  hashSessionToken,
} from './session.js';

export const PLATFORM_BROWSER_HANDOFF_TTL_MS = 30_000;
export const MAX_PENDING_BROWSER_HANDOFFS = 32;
const RETURN_TO_BASE_URL = 'http://cats.local';
const ALLOWED_RETURN_PATHS = new Set<string>([
  PLATFORM_RUNTIME_SETUP_PATH,
  PLATFORM_RUNTIME_DASHBOARD_PATH,
  PLATFORM_RUNTIME_PLAYGROUND_PATH,
]);

export interface PlatformBrowserHandoffRecord {
  accountId: string;
  sourceSessionId: string;
  returnTo: string;
  expiresAt: string;
}

export interface PlatformBrowserHandoffIssueResult {
  token: string;
  expiresAt: string;
}

export interface PlatformBrowserHandoffStore {
  issue(input: {
    accountId: string;
    sourceSessionId: string;
    returnTo: string;
    sessionSecret: string;
    ttlMs?: number;
    now?: Date;
  }): PlatformBrowserHandoffIssueResult;
  consume(input: {
    token: string;
    sessionSecret: string;
    now?: Date;
  }): PlatformBrowserHandoffRecord | null;
}

export class PlatformBrowserHandoffCapacityError extends Error {
  constructor() {
    super('Too many browser handoffs are pending.');
    this.name = 'PlatformBrowserHandoffCapacityError';
  }
}

interface StoredPlatformBrowserHandoff extends PlatformBrowserHandoffRecord {
  tokenHash: string;
}

export class MemoryPlatformBrowserHandoffStore implements PlatformBrowserHandoffStore {
  private readonly handoffs = new Map<string, StoredPlatformBrowserHandoff>();

  issue(input: {
    accountId: string;
    sourceSessionId: string;
    returnTo: string;
    sessionSecret: string;
    ttlMs?: number;
    now?: Date;
  }): PlatformBrowserHandoffIssueResult {
    const accountId = input.accountId.trim();
    const sourceSessionId = input.sourceSessionId.trim();
    if (!accountId || !sourceSessionId) {
      throw new Error('Browser handoff account and source session ids are required.');
    }
    const now = input.now ?? new Date();
    this.prune(now);
    const returnTo = normalizePlatformBrowserHandoffReturnTo(input.returnTo);
    if (this.handoffs.size >= MAX_PENDING_BROWSER_HANDOFFS) {
      throw new PlatformBrowserHandoffCapacityError();
    }
    const material = generateSessionTokenMaterial(input.sessionSecret);
    const ttlMs = input.ttlMs ?? PLATFORM_BROWSER_HANDOFF_TTL_MS;
    const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
    this.handoffs.set(material.tokenHash, {
      tokenHash: material.tokenHash,
      accountId,
      sourceSessionId,
      returnTo,
      expiresAt,
    });
    return {
      token: material.token,
      expiresAt,
    };
  }

  consume(input: {
    token: string;
    sessionSecret: string;
    now?: Date;
  }): PlatformBrowserHandoffRecord | null {
    const token = input.token.trim();
    if (!token) {
      return null;
    }
    const now = input.now ?? new Date();
    const tokenHash = hashSessionToken(token, input.sessionSecret);
    const handoff = this.handoffs.get(tokenHash);
    if (!handoff) {
      this.prune(now);
      return null;
    }

    // Delete before checking or returning so concurrent/replayed exchanges
    // cannot turn the handoff into a reusable browser credential.
    this.handoffs.delete(tokenHash);
    if (Date.parse(handoff.expiresAt) <= now.getTime()) {
      return null;
    }
    return {
      accountId: handoff.accountId,
      sourceSessionId: handoff.sourceSessionId,
      returnTo: handoff.returnTo,
      expiresAt: handoff.expiresAt,
    };
  }

  private prune(now: Date): void {
    for (const [tokenHash, handoff] of this.handoffs) {
      if (Date.parse(handoff.expiresAt) <= now.getTime()) {
        this.handoffs.delete(tokenHash);
      }
    }
  }
}

export function normalizePlatformBrowserHandoffReturnTo(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed.startsWith('/')) {
    throw new Error('Browser handoff return path must be root-relative.');
  }
  const parsed = new URL(trimmed, RETURN_TO_BASE_URL);
  if (parsed.origin !== RETURN_TO_BASE_URL || parsed.hash) {
    throw new Error('Browser handoff return path is invalid.');
  }
  if (!ALLOWED_RETURN_PATHS.has(parsed.pathname)) {
    throw new Error('Browser handoff return path is not allowed.');
  }
  return parsed.pathname;
}
