import { verifyLocalPassword } from './password.js';
import type {
  PlatformAccountRecord,
  PlatformAuthState,
  PlatformIdentityRecord,
  PlatformMembershipRecord,
} from './types.js';

export interface PlatformLocalPasswordCredentialMatch {
  identity: PlatformIdentityRecord;
  account: PlatformAccountRecord;
  membership: PlatformMembershipRecord;
}

/**
 * SPEC-113 requirement 16: step-up verifies the local-password Identity that
 * belongs to the *current* account. The caller must never be able to choose
 * which identity is checked, so this takes an account id rather than a
 * client-supplied identifier.
 */
export async function verifyPlatformLocalPasswordForAccount(
  state: PlatformAuthState,
  input: {
    accountId: string;
    password: string;
  },
): Promise<PlatformLocalPasswordCredentialMatch | null> {
  const identity = state.identities.find((candidate) =>
    candidate.provider === 'local_password'
    && candidate.accountId === input.accountId,
  ) ?? null;
  if (!identity) {
    return null;
  }
  return verifyPlatformLocalPasswordCredential(state, {
    identifier: identity.providerSubject,
    password: input.password,
  });
}

export async function verifyPlatformLocalPasswordCredential(
  state: PlatformAuthState,
  input: {
    identifier: string;
    password: string;
  },
): Promise<PlatformLocalPasswordCredentialMatch | null> {
  const identity = state.identities.find((candidate) =>
    candidate.provider === 'local_password'
    && (
      candidate.providerSubject === input.identifier
      || candidate.email?.toLowerCase() === input.identifier
    ),
  ) ?? null;
  const account = identity
    ? state.accounts.find((candidate) => candidate.id === identity.accountId) ?? null
    : null;
  const membership = account
    ? state.memberships.find((candidate) => candidate.accountId === account.id) ?? null
    : null;
  const valid = identity?.passwordHash && identity.passwordHashAlgorithm
    ? await verifyLocalPassword(input.password, {
        passwordHash: identity.passwordHash,
        passwordHashAlgorithm: identity.passwordHashAlgorithm,
      })
    : false;
  if (!identity || !account || !membership || account.status !== 'active' || !valid) {
    return null;
  }
  return {
    identity: structuredClone(identity),
    account: structuredClone(account),
    membership: structuredClone(membership),
  };
}
