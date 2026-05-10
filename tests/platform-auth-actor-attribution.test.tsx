import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PlatformActorAttributionError,
  requireCoreActorIdForPrincipal,
  resolveCoreActorIdForPrincipal,
  type PlatformPrincipal,
} from '../src/platform/auth/index.ts';

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
