import { randomUUID } from 'node:crypto';

import { assertPlatformAdminCredentials } from './adminCredentials.js';
import { createLocalPasswordHash } from './password.js';
import { issueBrowserSession, type BrowserSessionIssueResult } from './session.js';
import type {
  PlatformAccountRecord,
  PlatformAuthState,
  PlatformIdentityRecord,
  PlatformMembershipRecord,
} from './types.js';

/**
 * Raised when first-admin creation loses the uniqueness recheck that runs
 * inside the serialized auth-state mutation. Callers map this to a conflict
 * response instead of creating a second Account.
 */
export class PlatformFirstAdminExistsError extends Error {
  constructor() {
    super('First admin already exists.');
    this.name = 'PlatformFirstAdminExistsError';
  }
}

/**
 * SPEC-113 requirement 5: the "no Admin exists" check must run inside the same
 * serialized mutation that persists the new records. A prior setup-status read
 * is not concurrency control.
 */
export function hasExistingPlatformAdmin(state: PlatformAuthState): boolean {
  return state.accounts.length > 0
    || state.memberships.some((membership) =>
      membership.roles.some((role) => role === 'owner' || role === 'admin'),
    );
}

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
  if (hasExistingPlatformAdmin(input.state)) {
    throw new PlatformFirstAdminExistsError();
  }
  const credentials = assertPlatformAdminCredentials({
    identifier: input.identifier,
    password: input.password,
  });
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const accountId = `auth-account-${randomUUID()}`;
  const normalizedIdentifier = normalizeAccountIdentifier(credentials.identifier);
  const password = await createLocalPasswordHash(credentials.password);
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
