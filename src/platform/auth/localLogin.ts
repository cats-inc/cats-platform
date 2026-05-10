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
