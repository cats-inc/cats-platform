import { normalizePlatformAccountEmail } from './googleAccount.js';
import type { PlatformAuthState } from './types.js';

/**
 * SPEC-113 requirement 10: the authenticated auth-status projection reports
 * which login methods the current account owns. Requirement 13 makes Identity
 * records the only source; the renderer must not infer linked state from
 * account email, avatar, or a prior login result.
 */
export interface PlatformLoginMethodsSummary {
  localPassword: {
    linked: boolean;
  };
  google: {
    linked: boolean;
    email: string | null;
  };
}

export function summarizePlatformLoginMethods(
  state: PlatformAuthState,
  accountId: string,
): PlatformLoginMethodsSummary {
  const identities = state.identities.filter(
    (identity) => identity.accountId === accountId,
  );
  const googleIdentity = identities.find(
    (identity) => identity.provider === 'google',
  ) ?? null;
  return {
    localPassword: {
      linked: identities.some((identity) =>
        identity.provider === 'local_password'
        && Boolean(identity.passwordHash)
        && Boolean(identity.passwordHashAlgorithm),
      ),
    },
    google: {
      linked: googleIdentity !== null,
      email: googleIdentity
        ? normalizePlatformAccountEmail(googleIdentity.email)
        : null,
    },
  };
}
