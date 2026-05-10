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

export interface CreateGoogleBrowserSessionInput {
  state: PlatformAuthState;
  identity: PlatformVerifiedGoogleIdentity;
  sessionSecret: string;
  sessionTtlMs: number;
  now?: Date;
}

export interface CreateGoogleBrowserSessionResult {
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

export function createGoogleBrowserSessionForLinkedIdentity(
  input: CreateGoogleBrowserSessionInput,
): CreateGoogleBrowserSessionResult | null {
  const providerIdentity = input.state.identities.find((candidate) =>
    candidate.provider === 'google'
    && candidate.providerSubject === input.identity.providerSubject,
  ) ?? null;
  const account = providerIdentity
    ? input.state.accounts.find((candidate) => candidate.id === providerIdentity.accountId) ?? null
    : null;
  const membership = account
    ? input.state.memberships.find((candidate) => candidate.accountId === account.id) ?? null
    : null;
  if (!providerIdentity || !account || !membership || account.status !== 'active') {
    return null;
  }

  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const session = issueBrowserSession({
    accountId: account.id,
    sessionSecret: input.sessionSecret,
    ttlMs: input.sessionTtlMs,
    now,
  });
  const updatedIdentity: PlatformIdentityRecord = {
    ...providerIdentity,
    email: input.identity.email,
    updatedAt: nowIso,
  };
  const updatedAccount: PlatformAccountRecord = {
    ...account,
    email: input.identity.email,
    avatarUrl: input.identity.avatarUrl ?? account.avatarUrl,
    updatedAt: nowIso,
  };

  return {
    state: {
      ...input.state,
      updatedAt: nowIso,
      accounts: input.state.accounts.map((candidate) =>
        candidate.id === account.id ? updatedAccount : candidate,
      ),
      identities: input.state.identities.map((candidate) =>
        candidate.id === providerIdentity.id ? updatedIdentity : candidate,
      ),
      sessions: [...input.state.sessions, session.session],
    },
    account: updatedAccount,
    identity: updatedIdentity,
    membership: structuredClone(membership),
    session,
  };
}
