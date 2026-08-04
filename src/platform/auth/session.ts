import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

import type {
  PlatformDevicePlatform,
  PlatformSessionKind,
  PlatformSessionRecord,
} from './types.js';

const DEFAULT_TOKEN_BYTES = 32;

export interface SessionTokenMaterial {
  token: string;
  tokenHash: string;
}

export interface BrowserSessionIssueResult {
  session: PlatformSessionRecord;
  token: string;
  csrfToken: string;
}

export interface MobileDeviceSessionIssueResult {
  session: PlatformSessionRecord;
  token: string;
}

export interface CreateBrowserSessionInput {
  accountId: string;
  sessionSecret: string;
  ttlMs: number;
  sourceSessionId?: string;
  now?: Date;
}

export interface CreateMobileDeviceSessionInput extends CreateBrowserSessionInput {
  deviceLabel?: string;
  devicePlatform?: PlatformDevicePlatform;
  appVersion?: string;
  remoteAddress?: string;
}

export function generateSessionTokenMaterial(
  sessionSecret: string,
  tokenBytes = DEFAULT_TOKEN_BYTES,
): SessionTokenMaterial {
  const token = randomBytes(tokenBytes).toString('base64url');
  return {
    token,
    tokenHash: hashSessionToken(token, sessionSecret),
  };
}

export function hashSessionToken(token: string, sessionSecret: string): string {
  assertSessionSecret(sessionSecret);
  return createHmac('sha256', sessionSecret)
    .update(token)
    .digest('base64url');
}

export function verifySessionTokenHash(
  token: string,
  tokenHash: string,
  sessionSecret: string,
): boolean {
  const candidate = hashSessionToken(token, sessionSecret);
  return timingSafeEqualString(candidate, tokenHash);
}

export function issueBrowserSession(input: CreateBrowserSessionInput): BrowserSessionIssueResult {
  const now = input.now ?? new Date();
  const sourceSessionId = input.sourceSessionId?.trim();
  const issued = issueSessionRecord({
    accountId: input.accountId,
    kind: 'browser',
    sessionSecret: input.sessionSecret,
    ttlMs: input.ttlMs,
    now,
  });
  const csrf = generateSessionTokenMaterial(input.sessionSecret);
  return {
    session: {
      ...issued.session,
      csrfTokenHash: csrf.tokenHash,
      ...(sourceSessionId
        ? { sourceSessionId }
        : {}),
    },
    token: issued.token,
    csrfToken: csrf.token,
  };
}

export function issueMobileDeviceSession(
  input: CreateMobileDeviceSessionInput,
): MobileDeviceSessionIssueResult {
  const now = input.now ?? new Date();
  const issued = issueSessionRecord({
    accountId: input.accountId,
    kind: 'mobile_device',
    sessionSecret: input.sessionSecret,
    ttlMs: input.ttlMs,
    now,
  });
  return {
    session: {
      ...issued.session,
      deviceLabel: input.deviceLabel,
      devicePlatform: input.devicePlatform,
      appVersion: input.appVersion,
      lastSeenAddress: input.remoteAddress,
    },
    token: issued.token,
  };
}

export function isSessionActive(
  session: PlatformSessionRecord,
  now: Date = new Date(),
): boolean {
  return session.revokedAt === null && Date.parse(session.expiresAt) > now.getTime();
}

export function isSessionChainActive(
  sessions: PlatformSessionRecord[],
  session: PlatformSessionRecord,
  now: Date = new Date(),
): boolean {
  const visited = new Set<string>();
  let candidate: PlatformSessionRecord | undefined = session;

  while (candidate) {
    if (visited.has(candidate.id) || !isSessionActive(candidate, now)) {
      return false;
    }
    visited.add(candidate.id);
    if (!candidate.sourceSessionId) {
      return true;
    }
    const sourceSessionId: string = candidate.sourceSessionId;
    const accountId: string = candidate.accountId;
    candidate = sessions.find((source): boolean => (
      source.id === sourceSessionId
      && source.accountId === accountId
      && source.kind === 'browser'
    ));
  }

  return false;
}

export function revokeSessionFamily(
  sessions: PlatformSessionRecord[],
  sourceSessionId: string,
  now: Date = new Date(),
): PlatformSessionRecord[] {
  const sourceAccountId = sessions.find((session) => session.id === sourceSessionId)?.accountId;
  const revokedIds = new Set<string>([sourceSessionId]);
  let addedDescendant = true;
  while (addedDescendant) {
    addedDescendant = false;
    for (const session of sessions) {
      if (
        session.sourceSessionId
        && session.accountId === sourceAccountId
        && revokedIds.has(session.sourceSessionId)
        && !revokedIds.has(session.id)
      ) {
        revokedIds.add(session.id);
        addedDescendant = true;
      }
    }
  }

  return sessions.map((session) => (
    revokedIds.has(session.id) ? revokeSession(session, now) : session
  ));
}

export function revokeSession(
  session: PlatformSessionRecord,
  now: Date = new Date(),
): PlatformSessionRecord {
  return {
    ...structuredClone(session),
    revokedAt: session.revokedAt ?? now.toISOString(),
    lastSeenAt: now.toISOString(),
  };
}

export function touchSession(
  session: PlatformSessionRecord,
  input: { now?: Date; remoteAddress?: string } = {},
): PlatformSessionRecord {
  return {
    ...structuredClone(session),
    lastSeenAt: (input.now ?? new Date()).toISOString(),
    lastSeenAddress: input.remoteAddress ?? session.lastSeenAddress,
  };
}

export function findActiveSessionByToken(
  sessions: PlatformSessionRecord[],
  input: {
    token: string;
    sessionSecret: string;
    kind?: PlatformSessionKind;
    now?: Date;
  },
): PlatformSessionRecord | null {
  const tokenHash = hashSessionToken(input.token, input.sessionSecret);
  return structuredClone(sessions.find((session) =>
    session.tokenHash === tokenHash
    && (!input.kind || session.kind === input.kind)
    && isSessionActive(session, input.now ?? new Date()),
  ) ?? null);
}

function issueSessionRecord(input: {
  accountId: string;
  kind: PlatformSessionKind;
  sessionSecret: string;
  ttlMs: number;
  now: Date;
}): { session: PlatformSessionRecord; token: string } {
  const material = generateSessionTokenMaterial(input.sessionSecret);
  const nowIso = input.now.toISOString();
  return {
    token: material.token,
    session: {
      id: `auth-session-${randomUUID()}`,
      accountId: input.accountId,
      kind: input.kind,
      tokenHash: material.tokenHash,
      createdAt: nowIso,
      expiresAt: new Date(input.now.getTime() + input.ttlMs).toISOString(),
      revokedAt: null,
      lastSeenAt: nowIso,
    },
  };
}

function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf-8');
  const rightBuffer = Buffer.from(right, 'utf-8');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function assertSessionSecret(sessionSecret: string): void {
  if (sessionSecret.length < 16) {
    throw new Error('Session secret must be at least 16 characters.');
  }
}
