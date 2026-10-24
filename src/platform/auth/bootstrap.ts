import { randomUUID } from 'node:crypto';

import { assertPlatformAdminCredentials } from './adminCredentials.js';
import { createLocalPasswordHash, type LocalPasswordHashResult } from './password.js';
import type { PlatformVerifiedGoogleIdentity } from './googleVerifier.js';
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
    || state.memberships.length > 0
    || state.identities.length > 0
    || state.sessions.length > 0;
}

export type PlatformFirstAdminCredential =
  | { provider: 'local_password'; identifier: string; password: string }
  | { provider: 'google'; identity: PlatformVerifiedGoogleIdentity };

export interface CreateFirstAdminInput {
  state: PlatformAuthState;
  displayName: string;
  credential: PlatformFirstAdminCredential;
  sessionSecret: string;
  sessionTtlMs: number;
  now?: Date;
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

export interface CreateFirstAdminResult {
  state: PlatformAuthState;
  account: PlatformAccountRecord;
  identity: PlatformIdentityRecord;
  membership: PlatformMembershipRecord;
  session: BrowserSessionIssueResult;
}

export interface CreateFirstAdminLocalResult extends CreateFirstAdminResult {}

export async function createFirstAdminLocalAuthState(
  input: CreateFirstAdminLocalInput,
): Promise<CreateFirstAdminLocalResult> {
  return createFirstAdminAuthState({
    ...input,
    credential: { provider: 'local_password', identifier: input.identifier, password: input.password },
  });
}

/** Trusted domain input. HTTP must consume a bound Google proof before calling. */
export async function createFirstAdminAuthState(
  input: CreateFirstAdminInput,
): Promise<CreateFirstAdminResult> {
  if (hasExistingPlatformAdmin(input.state)) {
    throw new PlatformFirstAdminExistsError();
  }
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const accountId = `auth-account-${randomUUID()}`;
  const credential = input.credential;
  let email: string | null;
  let providerSubject: string;
  let passwordFields: Partial<LocalPasswordHashResult> = {};
  if (credential.provider === 'local_password') {
    const credentials = assertPlatformAdminCredentials(credential);
    providerSubject = normalizeAccountIdentifier(credentials.identifier);
    email = looksLikeEmail(providerSubject) ? providerSubject : null;
    passwordFields = await createLocalPasswordHash(credentials.password);
  } else {
    providerSubject = credential.identity.providerSubject.trim();
    email = credential.identity.email.trim().toLowerCase();
    if (!providerSubject || !looksLikeEmail(email)
      || !(Date.parse(credential.identity.expiresAt) > now.getTime())) {
      throw new Error('A current verified Google identity is required.');
    }
  }
  const account: PlatformAccountRecord = {
    id: accountId,
    displayName: input.displayName.trim() || 'Owner',
    email,
    avatarUrl: credential.provider === 'google' ? credential.identity.avatarUrl : null,
    status: 'active',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const identity: PlatformIdentityRecord = {
    id: `auth-identity-${randomUUID()}`,
    accountId,
    provider: credential.provider,
    providerSubject,
    email: account.email,
    ...passwordFields,
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
