import { randomUUID } from 'node:crypto';

import { issueBrowserSession, type BrowserSessionIssueResult } from './session.js';
import type {
  PlatformAccountRecord,
  PlatformAuthState,
  PlatformIdentityRecord,
  PlatformMembershipRecord,
} from './types.js';
import type { PlatformVerifiedGoogleIdentity } from './googleVerifier.js';

export interface CreateFirstAdminGoogleInput {
  state: PlatformAuthState;
  identity: PlatformVerifiedGoogleIdentity;
  sessionSecret: string;
  sessionTtlMs: number;
  now?: Date;
}

export interface CreateFirstAdminGoogleResult {
  state: PlatformAuthState;
  account: PlatformAccountRecord;
  identity: PlatformIdentityRecord;
  membership: PlatformMembershipRecord;
  session: BrowserSessionIssueResult;
}

export function createFirstAdminGoogleAuthState(
  input: CreateFirstAdminGoogleInput,
): CreateFirstAdminGoogleResult {
  if (input.state.accounts.length > 0) {
    throw new Error('First admin already exists.');
  }
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const accountId = `auth-account-${randomUUID()}`;
  const account: PlatformAccountRecord = {
    id: accountId,
    displayName: input.identity.displayName ?? input.identity.email,
    email: input.identity.email,
    avatarUrl: input.identity.avatarUrl,
    status: 'active',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const providerIdentity: PlatformIdentityRecord = {
    id: `auth-identity-${randomUUID()}`,
    accountId,
    provider: 'google',
    providerSubject: input.identity.providerSubject,
    email: input.identity.email,
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
      identities: [providerIdentity],
      memberships: [membership],
      sessions: [session.session],
    },
    account,
    identity: providerIdentity,
    membership,
    session,
  };
}
