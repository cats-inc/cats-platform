import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEmptyPlatformAuthState,
  createFirstAdminLocalAuthState,
  verifyPlatformLocalPasswordCredential,
} from '../src/platform/auth/index.ts';

const NOW = new Date('2026-05-10T00:00:00.000Z');
const SESSION_SECRET = 'test-session-secret-at-least-sixteen-chars';

test('local password credential helper resolves active local identity', async () => {
  const bootstrap = await createFirstAdminLocalAuthState({
    state: createEmptyPlatformAuthState(NOW),
    displayName: 'Owner',
    identifier: 'owner@example.test',
    password: 'correct-password',
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 60_000,
    now: NOW,
  });

  const credential = await verifyPlatformLocalPasswordCredential(bootstrap.state, {
    identifier: 'owner@example.test',
    password: 'correct-password',
  });

  assert.ok(credential);
  assert.equal(credential.account.id, bootstrap.account.id);
  assert.equal(credential.membership.coreActorId, 'actor-owner');
});

test('local password credential helper rejects wrong password and disabled accounts', async () => {
  const bootstrap = await createFirstAdminLocalAuthState({
    state: createEmptyPlatformAuthState(NOW),
    displayName: 'Owner',
    identifier: 'owner@example.test',
    password: 'correct-password',
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 60_000,
    now: NOW,
  });

  assert.equal(await verifyPlatformLocalPasswordCredential(bootstrap.state, {
    identifier: 'owner@example.test',
    password: 'wrong-password',
  }), null);
  assert.equal(await verifyPlatformLocalPasswordCredential({
    ...bootstrap.state,
    accounts: [{ ...bootstrap.account, status: 'disabled' }],
  }, {
    identifier: 'owner@example.test',
    password: 'correct-password',
  }), null);
});
