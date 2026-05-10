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

export interface LinkGoogleIdentityToAccountInput {
  state: PlatformAuthState;
  accountId: string;
  identity: PlatformVerifiedGoogleIdentity;
  now?: Date;
}

export interface LinkGoogleIdentityToAccountResult {
  state: PlatformAuthState;
  account: PlatformAccountRecord;
  identity: PlatformIdentityRecord;
  membership: PlatformMembershipRecord;
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

export function linkGoogleIdentityToAccount(
  input: LinkGoogleIdentityToAccountInput,
): LinkGoogleIdentityToAccountResult | null {
  const account = input.state.accounts.find((candidate) =>
    candidate.id === input.accountId && candidate.status === 'active',
  ) ?? null;
  const membership = account
    ? input.state.memberships.find((candidate) => candidate.accountId === account.id) ?? null
    : null;
  if (!account || !membership) {
    return null;
  }

  const identityForSubject = input.state.identities.find((candidate) =>
    candidate.provider === 'google'
    && candidate.providerSubject === input.identity.providerSubject,
  ) ?? null;
  if (identityForSubject && identityForSubject.accountId !== account.id) {
    throw new Error('Google identity is already linked to another account.');
  }

  const identityForAccount = input.state.identities.find((candidate) =>
    candidate.provider === 'google'
    && candidate.accountId === account.id,
  ) ?? null;
  if (
    identityForAccount
    && identityForAccount.providerSubject !== input.identity.providerSubject
  ) {
    throw new Error('Account already has a linked Google identity.');
  }

  const nowIso = (input.now ?? new Date()).toISOString();
  const linkedIdentity: PlatformIdentityRecord = identityForSubject
    ? {
        ...identityForSubject,
        email: input.identity.email,
        updatedAt: nowIso,
      }
    : {
        id: `auth-identity-${randomUUID()}`,
        accountId: account.id,
        provider: 'google',
        providerSubject: input.identity.providerSubject,
        email: input.identity.email,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
  const updatedAccount: PlatformAccountRecord = {
    ...account,
    email: input.identity.email,
    avatarUrl: input.identity.avatarUrl ?? account.avatarUrl,
    updatedAt: nowIso,
  };
  const nextIdentities = identityForSubject
    ? input.state.identities.map((candidate) =>
        candidate.id === identityForSubject.id ? linkedIdentity : candidate,
      )
    : [...input.state.identities, linkedIdentity];

  return {
    state: {
      ...input.state,
      updatedAt: nowIso,
      accounts: input.state.accounts.map((candidate) =>
        candidate.id === account.id ? updatedAccount : candidate,
      ),
      identities: nextIdentities,
    },
    account: updatedAccount,
    identity: linkedIdentity,
    membership: structuredClone(membership),
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
