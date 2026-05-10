import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PlatformActorAttributionError,
  createEmptyPlatformAuthState,
  createFirstAdminLocalAuthState,
  issueBrowserSession,
  requireCoreActorIdForPrincipal,
  resolveBrowserPrincipalFromToken,
  resolveCoreActorIdForPrincipal,
  type PlatformPrincipal,
} from '../src/platform/auth/index.ts';

const SESSION_SECRET = 'test-session-secret-00000000000000000000';
const SESSION_TTL_MS = 60 * 60 * 1_000;
const NOW = new Date('2026-05-10T00:00:00.000Z');

test('actor attribution resolves explicit first-admin core actor mapping', () => {
  const principal = createPrincipal('actor-owner');
  const decision = resolveCoreActorIdForPrincipal(principal);

  assert.deepEqual(decision, { ok: true, coreActorId: 'actor-owner' });
  assert.equal(requireCoreActorIdForPrincipal(principal), 'actor-owner');
});

test('actor attribution fails closed for memberships without core actor mapping', () => {
  const principal = createPrincipal(null);
  const decision = resolveCoreActorIdForPrincipal(principal);

  assert.deepEqual(decision, { ok: false, reason: 'missing_core_actor_mapping' });
  assert.throws(
    () => requireCoreActorIdForPrincipal(principal),
    (error) =>
      error instanceof PlatformActorAttributionError
      && error.reason === 'missing_core_actor_mapping',
  );
});

test('actor attribution does not let a later admin inherit actor-owner', async () => {
  const firstAdmin = await createFirstAdminLocalAuthState({
    state: createEmptyPlatformAuthState(NOW),
    displayName: 'Owner',
    identifier: 'owner@example.test',
    password: 'correct horse battery staple',
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: SESSION_TTL_MS,
    now: NOW,
  });
  const laterAdminSession = issueBrowserSession({
    accountId: 'auth-account-second-admin',
    sessionSecret: SESSION_SECRET,
    ttlMs: SESSION_TTL_MS,
    now: NOW,
  });
  const state = {
    ...firstAdmin.state,
    accounts: [
      ...firstAdmin.state.accounts,
      {
        id: 'auth-account-second-admin',
        displayName: 'Second Admin',
        email: 'second-admin@example.test',
        avatarUrl: null,
        status: 'active' as const,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ],
    memberships: [
      ...firstAdmin.state.memberships,
      {
        id: 'auth-membership-second-admin',
        accountId: 'auth-account-second-admin',
        roles: ['admin' as const],
        coreActorId: null,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ],
    sessions: [...firstAdmin.state.sessions, laterAdminSession.session],
  };

  const firstPrincipal = resolveBrowserPrincipalFromToken(state, {
    token: firstAdmin.session.token,
    sessionSecret: SESSION_SECRET,
    now: NOW,
  });
  const laterPrincipal = resolveBrowserPrincipalFromToken(state, {
    token: laterAdminSession.token,
    sessionSecret: SESSION_SECRET,
    now: NOW,
  });

  assert.ok(firstPrincipal);
  assert.ok(laterPrincipal);
  assert.equal(requireCoreActorIdForPrincipal(firstPrincipal), 'actor-owner');
  assert.equal(laterPrincipal.account.id, 'auth-account-second-admin');
  assert.deepEqual(resolveCoreActorIdForPrincipal(laterPrincipal), {
    ok: false,
    reason: 'missing_core_actor_mapping',
  });
  assert.throws(
    () => requireCoreActorIdForPrincipal(laterPrincipal),
    (error) =>
      error instanceof PlatformActorAttributionError
      && error.reason === 'missing_core_actor_mapping',
  );
});

function createPrincipal(coreActorId: string | null): PlatformPrincipal {
  return {
    account: {
      id: 'auth-account-1',
      displayName: 'Owner',
      email: 'owner@example.test',
      avatarUrl: null,
      status: 'active',
      createdAt: '2026-05-10T00:00:00.000Z',
      updatedAt: '2026-05-10T00:00:00.000Z',
    },
    membership: {
      id: 'auth-membership-1',
      accountId: 'auth-account-1',
      roles: ['admin'],
      coreActorId,
      createdAt: '2026-05-10T00:00:00.000Z',
      updatedAt: '2026-05-10T00:00:00.000Z',
    },
    session: {
      id: 'auth-session-1',
      accountId: 'auth-account-1',
      kind: 'browser',
      tokenHash: 'token-hash',
      csrfTokenHash: 'csrf-hash',
      createdAt: '2026-05-10T00:00:00.000Z',
      expiresAt: '2026-05-10T01:00:00.000Z',
      revokedAt: null,
      lastSeenAt: '2026-05-10T00:00:00.000Z',
    },
  };
}
