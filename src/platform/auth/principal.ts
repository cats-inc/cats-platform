import { hashSessionToken, isSessionActive } from './session.js';
import type {
  PlatformAccountRecord,
  PlatformAuthState,
  PlatformMembershipRecord,
  PlatformPrincipal,
  PlatformSessionRecord,
  PlatformSessionKind,
} from './types.js';

export interface PlatformPrincipalSummary {
  accountId: string;
  displayName: string;
  email: string | null;
  roles: PlatformMembershipRecord['roles'];
  coreActorId: string | null;
  sessionId: string;
}

export function resolveBrowserPrincipalFromToken(
  state: PlatformAuthState,
  input: {
    token: string;
    sessionSecret: string;
    now?: Date;
  },
): PlatformPrincipal | null {
  return resolvePrincipalFromToken(state, {
    ...input,
    kind: 'browser',
  });
}

export function resolveMobilePrincipalFromBearerToken(
  state: PlatformAuthState,
  input: {
    token: string;
    sessionSecret: string;
    now?: Date;
  },
): PlatformPrincipal | null {
  return resolvePrincipalFromToken(state, {
    ...input,
    kind: 'mobile_device',
  });
}

function resolvePrincipalFromToken(
  state: PlatformAuthState,
  input: {
    token: string;
    sessionSecret: string;
    kind: PlatformSessionKind;
    now?: Date;
  },
): PlatformPrincipal | null {
  const tokenHash = hashSessionToken(input.token, input.sessionSecret);
  const session = state.sessions.find((candidate) =>
    candidate.kind === input.kind
    && candidate.tokenHash === tokenHash
    && isSessionActive(candidate, input.now ?? new Date()),
  ) ?? null;
  if (!session) {
    return null;
  }
  return resolvePrincipalForSession(state, session);
}

export function summarizePlatformPrincipal(
  principal: PlatformPrincipal,
): PlatformPrincipalSummary {
  return {
    accountId: principal.account.id,
    displayName: principal.account.displayName,
    email: principal.account.email,
    roles: [...principal.membership.roles],
    coreActorId: principal.membership.coreActorId,
    sessionId: principal.session.id,
  };
}

function resolvePrincipalForSession(
  state: PlatformAuthState,
  session: PlatformSessionRecord,
): PlatformPrincipal | null {
  const account = state.accounts.find((candidate) =>
    candidate.id === session.accountId && candidate.status === 'active',
  ) ?? null;
  const membership = account
    ? state.memberships.find((candidate) => candidate.accountId === account.id) ?? null
    : null;
  return account && membership
    ? {
        account: structuredClone(account) as PlatformAccountRecord,
        membership: structuredClone(membership),
        session: structuredClone(session),
      }
    : null;
}
