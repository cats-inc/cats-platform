import { randomUUID } from 'node:crypto';

import { assertPlatformAdminCredentials } from './adminCredentials.js';
import { normalizePlatformAccountEmail } from './googleAccount.js';
import type { PlatformVerifiedGoogleIdentity } from './googleVerifier.js';
import { createLocalPasswordHash } from './password.js';
import { isSessionChainActive } from './session.js';
import type { PlatformAuthState } from './types.js';

export type PlatformFirstPasswordRejectionReason =
  | 'account_not_found' | 'session_inactive' | 'password_already_exists'
  | 'google_subject_mismatch' | 'email_mismatch' | 'identifier_conflict';

export class PlatformFirstPasswordError extends Error {
  constructor(public readonly reason: PlatformFirstPasswordRejectionReason) {
    super('The first password cannot be set for this account.');
    this.name = 'PlatformFirstPasswordError';
  }
}

/** Called inside authStore.updateState, after consuming the set_password proof. */
export async function addFirstLocalPasswordToAccount(input: {
  state: PlatformAuthState;
  accountId: string;
  sessionId: string;
  identity: PlatformVerifiedGoogleIdentity;
  password: unknown;
  now?: Date;
}): Promise<PlatformAuthState> {
  const { state } = input;
  const now = input.now ?? new Date();
  const account = state.accounts.find((candidate) =>
    candidate.id === input.accountId && candidate.status === 'active',
  );
  if (!account || !state.memberships.some((entry) => entry.accountId === account.id)) {
    throw new PlatformFirstPasswordError('account_not_found');
  }
  const session = state.sessions.find((candidate) =>
    candidate.id === input.sessionId && candidate.accountId === account.id
    && candidate.kind === 'browser' && isSessionChainActive(state.sessions, candidate, now),
  );
  if (!session) throw new PlatformFirstPasswordError('session_inactive');
  // Even a damaged existing credential is a repair case, never an overwrite.
  if (state.identities.some((entry) =>
    entry.accountId === account.id && entry.provider === 'local_password',
  )) throw new PlatformFirstPasswordError('password_already_exists');
  const google = state.identities.find((entry) =>
    entry.accountId === account.id && entry.provider === 'google',
  );
  if (!google || google.providerSubject !== input.identity.providerSubject
    || !(Date.parse(input.identity.expiresAt) > now.getTime())) {
    throw new PlatformFirstPasswordError('google_subject_mismatch');
  }
  const email = normalizePlatformAccountEmail(account.email);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(email)
    || email !== normalizePlatformAccountEmail(google.email)
    || email !== normalizePlatformAccountEmail(input.identity.email)) {
    throw new PlatformFirstPasswordError('email_mismatch');
  }
  if (state.identities.some((entry) =>
    entry.provider === 'local_password' && entry.providerSubject.trim().toLowerCase() === email,
  )) throw new PlatformFirstPasswordError('identifier_conflict');
  const credentials = assertPlatformAdminCredentials({ identifier: email, password: input.password });
  const password = await createLocalPasswordHash(credentials.password);
  const nowIso = now.toISOString();
  return {
    ...state,
    updatedAt: nowIso,
    identities: [...state.identities, {
      id: `auth-identity-${randomUUID()}`,
      accountId: account.id,
      provider: 'local_password',
      providerSubject: email,
      email,
      ...password,
      createdAt: nowIso,
      updatedAt: nowIso,
    }],
  };
}
