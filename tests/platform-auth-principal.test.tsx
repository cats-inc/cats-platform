import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEmptyPlatformAuthState,
  createFirstAdminLocalAuthState,
  resolveBrowserPrincipalFromToken,
  revokeSession,
  summarizePlatformPrincipal,
} from '../src/platform/auth/index.ts';

const NOW = new Date('2026-05-10T00:00:00.000Z');
const SESSION_SECRET = 'test-session-secret-at-least-sixteen-chars';

test('browser principal resolver maps valid session to account and membership', async () => {
  const bootstrap = await createFirstAdminLocalAuthState({
    state: createEmptyPlatformAuthState(NOW),
    displayName: 'Owner',
    identifier: 'owner@example.test',
    password: 'correct-password',
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 60_000,
    now: NOW,
  });
  const principal = resolveBrowserPrincipalFromToken(bootstrap.state, {
    token: bootstrap.session.token,
    sessionSecret: SESSION_SECRET,
    now: NOW,
  });

  assert.ok(principal);
  assert.deepEqual(summarizePlatformPrincipal(principal), {
    accountId: bootstrap.account.id,
    displayName: 'Owner',
    email: 'owner@example.test',
    roles: ['owner', 'admin'],
    coreActorId: 'actor-owner',
    sessionId: bootstrap.session.session.id,
  });
});

test('browser principal resolver rejects inactive sessions and accounts', async () => {
  const bootstrap = await createFirstAdminLocalAuthState({
    state: createEmptyPlatformAuthState(NOW),
    displayName: 'Owner',
    identifier: 'owner@example.test',
    password: 'correct-password',
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 60_000,
    now: NOW,
  });
  assert.equal(resolveBrowserPrincipalFromToken({
    ...bootstrap.state,
    sessions: [revokeSession(bootstrap.session.session, NOW)],
  }, {
    token: bootstrap.session.token,
    sessionSecret: SESSION_SECRET,
    now: NOW,
  }), null);
  assert.equal(resolveBrowserPrincipalFromToken(bootstrap.state, {
    token: bootstrap.session.token,
    sessionSecret: SESSION_SECRET,
    now: new Date(NOW.getTime() + 60_001),
  }), null);
  assert.equal(resolveBrowserPrincipalFromToken(bootstrap.state, {
    token: bootstrap.session.token,
    sessionSecret: 'different-secret-at-least-sixteen-chars',
    now: NOW,
  }), null);
  assert.equal(resolveBrowserPrincipalFromToken({
    ...bootstrap.state,
    accounts: [{ ...bootstrap.account, status: 'disabled' }],
  }, {
    token: bootstrap.session.token,
    sessionSecret: SESSION_SECRET,
    now: NOW,
  }), null);
});
