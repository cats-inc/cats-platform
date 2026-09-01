import { randomUUID } from 'node:crypto';

import {
  issueBrowserSession,
  revokeSession,
  type BrowserSessionIssueResult,
} from './session.js';
import type {
  PlatformAccountRecord,
  PlatformAuthState,
  PlatformIdentityRecord,
  PlatformMembershipRecord,
} from './types.js';
import type { PlatformVerifiedGoogleIdentity } from './googleVerifier.js';

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
  adoptedAccountEmail: boolean;
}

export type GoogleIdentityLinkRejectionReason =
  | 'account_not_found'
  | 'email_mismatch'
  | 'subject_owned_by_other_account'
  | 'account_has_other_google_identity';

export type LinkGoogleIdentityToAccountOutcome =
  | { ok: true; result: LinkGoogleIdentityToAccountResult }
  | { ok: false; reason: GoogleIdentityLinkRejectionReason };

export interface UnlinkGoogleIdentityFromAccountInput {
  state: PlatformAuthState;
  accountId: string;
  keepSessionId: string;
  now?: Date;
}

export interface UnlinkGoogleIdentityFromAccountResult {
  state: PlatformAuthState;
  account: PlatformAccountRecord;
  membership: PlatformMembershipRecord;
  revokedSessionIds: string[];
}

export type GoogleIdentityUnlinkRejectionReason =
  | 'account_not_found'
  | 'google_not_linked'
  | 'local_fallback_missing';

export type UnlinkGoogleIdentityFromAccountOutcome =
  | { ok: true; result: UnlinkGoogleIdentityFromAccountResult }
  | { ok: false; reason: GoogleIdentityUnlinkRejectionReason };

/**
 * ADR-111 section 4: trim and lowercase only. Cats deliberately does not apply
 * Gmail alias, dot, or plus-address canonicalization, so two addresses Google
 * may route to one mailbox stay distinct here.
 */
export function normalizePlatformAccountEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

export function linkGoogleIdentityToAccount(
  input: LinkGoogleIdentityToAccountInput,
): LinkGoogleIdentityToAccountOutcome {
  const account = input.state.accounts.find((candidate) =>
    candidate.id === input.accountId && candidate.status === 'active',
  ) ?? null;
  const membership = account
    ? input.state.memberships.find((candidate) => candidate.accountId === account.id) ?? null
    : null;
  if (!account || !membership) {
    return { ok: false, reason: 'account_not_found' };
  }

  const identityForSubject = input.state.identities.find((candidate) =>
    candidate.provider === 'google'
    && candidate.providerSubject === input.identity.providerSubject,
  ) ?? null;
  if (identityForSubject && identityForSubject.accountId !== account.id) {
    return { ok: false, reason: 'subject_owned_by_other_account' };
  }

  const identityForAccount = input.state.identities.find((candidate) =>
    candidate.provider === 'google'
    && candidate.accountId === account.id,
  ) ?? null;
  if (
    identityForAccount
    && identityForAccount.providerSubject !== input.identity.providerSubject
  ) {
    return { ok: false, reason: 'account_has_other_google_identity' };
  }

  // SPEC-113 requirements 28 and 29: an account that already carries an email
  // must match it exactly. Only an email-less local-handle account may adopt
  // the verified Google address, and only through this step-up-protected path.
  const accountEmail = normalizePlatformAccountEmail(account.email);
  const verifiedEmail = normalizePlatformAccountEmail(input.identity.email);
  if (accountEmail && accountEmail !== verifiedEmail) {
    return { ok: false, reason: 'email_mismatch' };
  }

  const nowIso = (input.now ?? new Date()).toISOString();
  const linkedIdentity: PlatformIdentityRecord = identityForSubject
    ? {
        ...identityForSubject,
        email: verifiedEmail,
        updatedAt: nowIso,
      }
    : {
        id: `auth-identity-${randomUUID()}`,
        accountId: account.id,
        provider: 'google',
        providerSubject: input.identity.providerSubject,
        email: verifiedEmail,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
  const adoptedAccountEmail = accountEmail === null && verifiedEmail !== null;
  const updatedAccount: PlatformAccountRecord = {
    ...account,
    email: adoptedAccountEmail ? verifiedEmail : account.email,
    avatarUrl: input.identity.avatarUrl ?? account.avatarUrl,
    updatedAt: nowIso,
  };
  const nextIdentities = identityForSubject
    ? input.state.identities.map((candidate) =>
        candidate.id === identityForSubject.id ? linkedIdentity : candidate,
      )
    : [...input.state.identities, linkedIdentity];

  return {
    ok: true,
    result: {
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
      adoptedAccountEmail,
    },
  };
}

/**
 * ADR-111 section 6: unlinking must preserve a usable local login and must not
 * leave ambient access behind. Session records do not retain which identity
 * established them, so every other browser and mobile session for the account
 * is revoked and only the step-up-verified session survives.
 */
export function unlinkGoogleIdentityFromAccount(
  input: UnlinkGoogleIdentityFromAccountInput,
): UnlinkGoogleIdentityFromAccountOutcome {
  const account = input.state.accounts.find((candidate) =>
    candidate.id === input.accountId && candidate.status === 'active',
  ) ?? null;
  const membership = account
    ? input.state.memberships.find((candidate) => candidate.accountId === account.id) ?? null
    : null;
  if (!account || !membership) {
    return { ok: false, reason: 'account_not_found' };
  }

  const googleIdentity = input.state.identities.find((candidate) =>
    candidate.provider === 'google' && candidate.accountId === account.id,
  ) ?? null;
  if (!googleIdentity) {
    return { ok: false, reason: 'google_not_linked' };
  }

  const hasLocalFallback = input.state.identities.some((candidate) =>
    candidate.provider === 'local_password'
    && candidate.accountId === account.id
    && Boolean(candidate.passwordHash)
    && Boolean(candidate.passwordHashAlgorithm),
  );
  if (!hasLocalFallback) {
    return { ok: false, reason: 'local_fallback_missing' };
  }

  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const revokedSessionIds: string[] = [];
  const sessions = input.state.sessions.map((session) => {
    if (
      session.accountId !== account.id
      || session.id === input.keepSessionId
      || session.revokedAt !== null
    ) {
      return session;
    }
    revokedSessionIds.push(session.id);
    return revokeSession(session, now);
  });

  return {
    ok: true,
    result: {
      state: {
        ...input.state,
        updatedAt: nowIso,
        identities: input.state.identities.filter(
          (candidate) => candidate.id !== googleIdentity.id,
        ),
        sessions,
      },
      account: structuredClone(account),
      membership: structuredClone(membership),
      revokedSessionIds,
    },
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
    email: normalizePlatformAccountEmail(input.identity.email),
    updatedAt: nowIso,
  };
  const updatedAccount: PlatformAccountRecord = {
    ...account,
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
