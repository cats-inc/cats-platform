import { randomUUID } from 'node:crypto';

import { createLocalPasswordHash } from './password.js';
import { issueBrowserSession, type BrowserSessionIssueResult } from './session.js';
import type {
  PlatformAccountRecord,
  PlatformAuthState,
  PlatformIdentityRecord,
  PlatformMembershipRecord,
} from './types.js';

export interface CreateFirstAdminLocalInput {
  state: PlatformAuthState;
  displayName: string;
  identifier: string;
  password: string;
  sessionSecret: string;
  sessionTtlMs: number;
  now?: Date;
}

export interface CreateFirstAdminLocalResult {
  state: PlatformAuthState;
  account: PlatformAccountRecord;
  identity: PlatformIdentityRecord;
  membership: PlatformMembershipRecord;
  session: BrowserSessionIssueResult;
}

export async function createFirstAdminLocalAuthState(
  input: CreateFirstAdminLocalInput,
): Promise<CreateFirstAdminLocalResult> {
  if (input.state.accounts.length > 0) {
    throw new Error('First admin already exists.');
  }
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const accountId = `auth-account-${randomUUID()}`;
  const normalizedIdentifier = normalizeAccountIdentifier(input.identifier);
  const password = await createLocalPasswordHash(input.password);
  const account: PlatformAccountRecord = {
    id: accountId,
    displayName: input.displayName.trim() || 'Owner',
    email: looksLikeEmail(normalizedIdentifier) ? normalizedIdentifier : null,
    avatarUrl: null,
    status: 'active',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const identity: PlatformIdentityRecord = {
    id: `auth-identity-${randomUUID()}`,
    accountId,
    provider: 'local_password',
    providerSubject: normalizedIdentifier,
    email: account.email,
    passwordHash: password.passwordHash,
    passwordHashAlgorithm: password.passwordHashAlgorithm,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const membership: PlatformMembershipRecord = {
    id: `auth-membership-${randomUUID()}`,
    accountId,
    roles: ['owner', 'admin'],
    coreActorId: 'actor-owner',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const session = issueBrowserSession({
    accountId,
    sessionSecret: input.sessionSecret,
    ttlMs: input.sessionTtlMs,
    now,
  });

  return {
    state: {
      ...input.state,
      updatedAt: nowIso,
      accounts: [account],
      identities: [identity],
      memberships: [membership],
      sessions: [session.session],
    },
    account,
    identity,
    membership,
    session,
  };
}

export function normalizeAccountIdentifier(identifier: string): string {
  const normalized = identifier.trim().toLowerCase();
  if (!normalized) {
    throw new Error('Account identifier is required.');
  }
  return normalized;
}

function looksLikeEmail(identifier: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(identifier);
}
