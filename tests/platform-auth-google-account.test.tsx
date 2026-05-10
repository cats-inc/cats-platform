import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEmptyPlatformAuthState,
  createFirstAdminGoogleAuthState,
  createGoogleBrowserSessionForLinkedIdentity,
  hashSessionToken,
  type PlatformVerifiedGoogleIdentity,
} from '../src/platform/auth/index.ts';

const NOW = new Date('2026-05-10T00:00:00.000Z');
const SESSION_SECRET = 'test-session-secret-at-least-sixteen-chars';

const GOOGLE_IDENTITY = {
  providerSubject: 'google-subject-1',
  email: 'owner@example.test',
  hostedDomain: 'example.test',
  displayName: 'Owner',
  avatarUrl: 'https://example.test/avatar.png',
  audience: 'browser-client-id',
  issuer: 'https://accounts.google.com',
  expiresAt: '2026-05-10T01:00:00.000Z',
} satisfies PlatformVerifiedGoogleIdentity;

test('google first-admin helper creates account identity membership and browser session', () => {
  const created = createFirstAdminGoogleAuthState({
    state: createEmptyPlatformAuthState(NOW),
    identity: GOOGLE_IDENTITY,
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 60_000,
    now: NOW,
  });

  assert.equal(created.account.email, 'owner@example.test');
  assert.equal(created.account.displayName, 'Owner');
  assert.equal(created.account.avatarUrl, 'https://example.test/avatar.png');
  assert.equal(created.identity.provider, 'google');
  assert.equal(created.identity.providerSubject, 'google-subject-1');
  assert.equal(created.identity.passwordHash, undefined);
  assert.deepEqual(created.membership.roles, ['owner', 'admin']);
  assert.equal(created.membership.coreActorId, 'actor-owner');
  assert.equal(
    created.state.sessions[0]?.tokenHash,
    hashSessionToken(created.session.token, SESSION_SECRET),
  );
  assert.equal(typeof created.state.sessions[0]?.csrfTokenHash, 'string');
});

test('google first-admin helper refuses to overwrite existing accounts', () => {
  const first = createFirstAdminGoogleAuthState({
    state: createEmptyPlatformAuthState(NOW),
    identity: GOOGLE_IDENTITY,
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 60_000,
    now: NOW,
  });

  assert.throws(() => createFirstAdminGoogleAuthState({
    state: first.state,
    identity: GOOGLE_IDENTITY,
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 60_000,
    now: NOW,
  }), /First admin already exists/u);
});

test('google linked-identity helper issues browser session for active account', () => {
  const first = createFirstAdminGoogleAuthState({
    state: createEmptyPlatformAuthState(NOW),
    identity: GOOGLE_IDENTITY,
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 60_000,
    now: NOW,
  });
  const login = createGoogleBrowserSessionForLinkedIdentity({
    state: {
      ...first.state,
      sessions: [],
    },
    identity: {
      ...GOOGLE_IDENTITY,
      email: 'new-owner@example.test',
      avatarUrl: 'https://example.test/new-avatar.png',
    },
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 60_000,
    now: new Date(NOW.getTime() + 1_000),
  });

  assert.ok(login);
  assert.equal(login.account.id, first.account.id);
  assert.equal(login.account.email, 'new-owner@example.test');
  assert.equal(login.account.avatarUrl, 'https://example.test/new-avatar.png');
  assert.equal(login.identity.email, 'new-owner@example.test');
  assert.equal(login.state.sessions.length, 1);
  assert.equal(
    login.state.sessions[0]?.tokenHash,
    hashSessionToken(login.session.token, SESSION_SECRET),
  );
});

test('google linked-identity helper rejects unknown or disabled accounts', () => {
  const first = createFirstAdminGoogleAuthState({
    state: createEmptyPlatformAuthState(NOW),
    identity: GOOGLE_IDENTITY,
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 60_000,
    now: NOW,
  });

  assert.equal(createGoogleBrowserSessionForLinkedIdentity({
    state: first.state,
    identity: { ...GOOGLE_IDENTITY, providerSubject: 'unknown-subject' },
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 60_000,
    now: NOW,
  }), null);
  assert.equal(createGoogleBrowserSessionForLinkedIdentity({
    state: {
      ...first.state,
      accounts: [{ ...first.account, status: 'disabled' }],
    },
    identity: GOOGLE_IDENTITY,
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 60_000,
    now: NOW,
  }), null);
});
