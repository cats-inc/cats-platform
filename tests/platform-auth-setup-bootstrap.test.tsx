import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';

import { loadConfig } from '../src/config.ts';
import { createDefaultCoreState } from '../src/core/model/index.ts';
import { createServer } from '../src/app/server/index.ts';
import {
  AUTH_SESSION_COOKIE_NAME,
  createFileBackedPlatformAuthStore,
  hashSessionToken,
  MemoryPlatformAuthStore,
  MemoryPlatformGoogleProofStore,
  type PlatformGoogleIdTokenClaims,
  type PlatformGoogleProofStore,
  type PlatformGoogleIdTokenVerifier,
  type PlatformAuthStore,
} from '../src/platform/auth/index.ts';
import type { NativeGoogleAuthBinding } from '../src/shared/nativeGoogleAuth.ts';
import { MemoryChatStore } from '../src/products/chat/state/store.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import { waitForGuideCatAssistRefreshIdle } from '../src/products/chat/api/guideCatAssist.ts';

const NOW = new Date('2026-05-10T00:00:00.000Z');
const SESSION_SECRET = 'test-session-secret-at-least-sixteen-chars';

function testGoogleProvider() {
  const claims = new Map<string, PlatformGoogleIdTokenClaims>();
  const store = new MemoryPlatformGoogleProofStore({
    clientId: 'desktop-test-client', now: () => NOW,
    verifier: { async verifyIdToken({ token }) {
      const value = claims.get(token);
      if (!value) throw new Error('Invalid fixture token.');
      return value;
    } },
  });
  return {
    store,
    async proof(binding: NativeGoogleAuthBinding, overrides: Partial<PlatformGoogleIdTokenClaims> = {}) {
      const start = store.begin({
        binding, callbackUrl: 'http://127.0.0.1:34567/oauth/google/callback',
      });
      claims.set(start.transactionId, {
        sub: 'google-owner', email: 'owner@example.test', email_verified: true,
        iss: 'https://accounts.google.com', aud: 'desktop-test-client',
        exp: NOW.getTime() / 1000 + 3600, nonce: start.nonce, ...overrides,
      });
      return (await store.complete({ ...start, idToken: start.transactionId })).proofToken;
    },
  };
}

test('Google bootstrap and fresh-proof password completion preserve account and owner', async (t) => {
  const google = testGoogleProvider();
  const f = await createSetupFixture(t, { googleProofStore: google.store, authPersistence: 'file' });
  const setup = await request(f.server, '/api/platform/setup/complete', {
    method: 'POST', origin: 'http://localhost:5173',
    googleProof: await google.proof({ purpose: 'bootstrap', contextId: 'window', attemptId: 'setup' }),
    desktopContext: 'window',
    body: { ownerDisplayName: 'Owner', createGuideCat: false, adminMethod: 'google', attemptId: 'setup' },
  });
  assert.equal(setup.status, 200);
  const before = await f.authStore.readState();
  assert.equal(before.accounts.length, 1);
  assert.equal(before.identities[0]?.provider, 'google');
  const core = await f.chatStore.readCore();
  const cookie = setup.setCookie!.split(';')[0]!;
  const status = await request(f.server, '/api/auth/status', { cookie });
  const binding = { purpose: 'set_password', contextId: 'window',
    accountId: before.accounts[0]!.id, sessionId: before.sessions[0]!.id } as const;
  const proof = await google.proof(binding);
  const completed = await request(f.server, '/api/auth/password/first', {
    method: 'POST', origin: 'http://localhost:5173', cookie,
    csrfToken: status.payload?.csrfToken, googleProof: proof, desktopContext: 'window',
    body: { password: 'correct-password' },
  });
  assert.equal(completed.status, 200);
  assert.equal(completed.payload?.loginMethods.localPassword.linked, true);
  assert.equal(completed.payload?.loginMethods.google.linked, true);
  const after = await f.authStore.readState();
  assert.deepEqual(after.accounts, before.accounts);
  assert.deepEqual(after.memberships, before.memberships);
  assert.deepEqual(await f.chatStore.readCore(), core);
  assert.equal(after.identities.length, 2);
  assert.equal(after.identities[1]?.providerSubject, 'owner@example.test');
  assert.notEqual(completed.payload?.csrfToken, status.payload?.csrfToken);
  const replay = await request(f.server, '/api/auth/password/first', {
    method: 'POST', origin: 'http://localhost:5173', cookie,
    csrfToken: completed.payload?.csrfToken, googleProof: proof, desktopContext: 'window',
    body: { password: 'overwrite-password' },
  });
  assert.equal(replay.status, 403);
  const login = await request(f.server, '/api/auth/login', {
    method: 'POST', origin: 'http://localhost:5173',
    body: { identifier: 'owner@example.test', password: 'correct-password' },
  });
  assert.equal(login.status, 200);
  assert.equal(login.payload?.principal.accountId, before.accounts[0]!.id);
});

test('concurrent Google and local setup has exactly one winner and session', async (t) => {
  const google = testGoogleProvider();
  const f = await createSetupFixture(t, { googleProofStore: google.store });
  const [a, b] = await Promise.all([
    request(f.server, '/api/platform/setup/complete', {
      method: 'POST', origin: 'http://localhost:5173', desktopContext: 'window',
      googleProof: await google.proof({ purpose: 'bootstrap', contextId: 'window', attemptId: 'setup' }),
      body: { adminMethod: 'google', attemptId: 'setup', ownerDisplayName: 'Google' },
    }),
    request(f.server, '/api/platform/setup/complete', {
      method: 'POST', origin: 'http://localhost:5173',
      body: { ownerDisplayName: 'Local', adminIdentifier: 'local@example.test',
        adminPassword: 'correct-password' },
    }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const state = await f.authStore.readState();
  assert.equal(state.accounts.length, 1);
  assert.equal(state.identities.length, 1);
  assert.equal(state.memberships.length, 1);
  assert.equal(state.sessions.length, 1);
  assert.equal((a.status === 409 ? a : b).setCookie, null);
});

test('Google setup rolls back on snapshot failure and requires a new proof for retry', async (t) => {
  const google = testGoogleProvider();
  const f = await createSetupFixture(t, { googleProofStore: google.store });
  const original = f.chatStore.writeSnapshot.bind(f.chatStore);
  let fail = true;
  f.chatStore.writeSnapshot = async (...args) => {
    if (fail) { fail = false; throw new Error('snapshot failure'); }
    return original(...args);
  };
  const binding = { purpose: 'bootstrap', contextId: 'window', attemptId: 'setup' } as const;
  const proof = await google.proof(binding);
  const submit = (googleProof: string) => request(f.server, '/api/platform/setup/complete', {
    method: 'POST', origin: 'http://localhost:5173', googleProof, desktopContext: 'window',
    body: { adminMethod: 'google', attemptId: 'setup', ownerDisplayName: 'Owner' },
  });
  assert.equal((await submit(proof)).status, 500);
  assert.equal((await f.authStore.readState()).accounts.length, 0);
  assert.equal((await f.chatStore.readCore()).setupCompleteAt, null);
  assert.equal((await submit(proof)).status, 403);
  assert.equal((await submit(await google.proof(binding))).status, 200);
});

test('Google assertion or wrong-attempt proof alone cannot authorize bootstrap', async (t) => {
  const google = testGoogleProvider();
  const f = await createSetupFixture(t, { googleProofStore: google.store });
  const proof = await google.proof({ purpose: 'bootstrap', contextId: 'window', attemptId: 'original' });
  const submit = (googleProof?: string) => request(f.server, '/api/platform/setup/complete', {
    method: 'POST', origin: 'http://localhost:5173', googleProof, desktopContext: 'window',
    body: { adminMethod: 'google', attemptId: 'different', ownerDisplayName: 'Owner',
      credential: 'arbitrary-id-token', email: 'owner@example.test' },
  });
  assert.equal((await submit()).status, 400);
  assert.equal((await submit('arbitrary-id-token')).status, 403);
  assert.equal((await submit(proof)).status, 403);
  assert.equal((await f.authStore.readState()).accounts.length, 0);
  assert.equal((await f.chatStore.readCore()).setupCompleteAt, null);
});

test('first-password mutation rejects a session without fresh Google and wrong linked subject',
  async (t) => {
    const google = testGoogleProvider();
    const f = await createSetupFixture(t, { googleProofStore: google.store });
    const setup = await request(f.server, '/api/platform/setup/complete', {
      method: 'POST', origin: 'http://localhost:5173', desktopContext: 'window',
      googleProof: await google.proof({ purpose: 'bootstrap', contextId: 'window', attemptId: 'setup' }),
      body: { adminMethod: 'google', attemptId: 'setup', ownerDisplayName: 'Owner' },
    });
    const cookie = setup.setCookie!.split(';')[0]!;
    const status = await request(f.server, '/api/auth/status', { cookie });
    const state = await f.authStore.readState();
    const binding = { purpose: 'set_password', contextId: 'window',
      accountId: state.accounts[0]!.id, sessionId: state.sessions[0]!.id } as const;
    const submit = (googleProof?: string, csrfToken: unknown = status.payload?.csrfToken) =>
      request(f.server, '/api/auth/password/first', {
        method: 'POST', origin: 'http://localhost:5173', cookie, csrfToken,
        googleProof, desktopContext: 'window', body: { password: 'correct-password' },
      });
    assert.equal((await submit()).status, 403);
    const wrong = await google.proof(binding, { sub: 'other-google-same-email' });
    assert.equal((await submit(wrong)).status, 403);
    const csrfProof = await google.proof(binding);
    assert.equal((await submit(csrfProof, null)).status, 403);
    const original = f.authStore.updateState.bind(f.authStore);
    let fail = true;
    f.authStore.updateState = (mutate) => original(async (current) => {
      const next = await mutate(current);
      if (fail) { fail = false; throw new Error('sensitive persistence detail'); }
      return next;
    });
    const failure = await submit(csrfProof);
    assert.equal(failure.status, 503);
    assert.doesNotMatch(JSON.stringify(failure.payload), /sensitive persistence detail/u);
    assert.equal((await f.authStore.readState()).identities.length, 1);
    assert.equal((await submit(csrfProof)).status, 403, 'failed write spends proof');
    assert.equal((await submit(await google.proof(binding))).status, 200);
  });

for (const client of ['web', 'mobile'] as const) {
  test(`concurrent ${client} Google login preserves a newly committed first password`, async (t) => {
    const google = testGoogleProvider();
    const f = await createSetupFixture(t, {
      googleProofStore: google.store,
      env: { CATS_AUTH_GOOGLE_CLIENT_ID: 'web-client',
        CATS_AUTH_GOOGLE_MOBILE_AUDIENCES: 'mobile-client' },
      googleVerifier: { async verifyIdToken() { return {
        sub: 'google-owner', email: 'owner@example.test', email_verified: true,
        iss: 'https://accounts.google.com', aud: ['web-client', 'mobile-client'],
        exp: NOW.getTime() / 1000 + 3600, nonce: 'mobile-nonce',
      }; } },
    });
    const setup = await request(f.server, '/api/platform/setup/complete', {
      method: 'POST', origin: 'http://localhost:5173', desktopContext: 'window',
      googleProof: await google.proof({ purpose: 'bootstrap', contextId: 'window', attemptId: 'setup' }),
      body: { adminMethod: 'google', attemptId: 'setup', ownerDisplayName: 'Owner' },
    });
    const cookie = setup.setCookie!.split(';')[0]!;
    const status = await request(f.server, '/api/auth/status', { cookie });
    const before = await f.authStore.readState();
    const proof = await google.proof({ purpose: 'set_password', contextId: 'window',
      accountId: before.accounts[0]!.id, sessionId: before.sessions[0]!.id });
    let pause = true;
    let entered!: () => void;
    const paused = new Promise<void>((resolve) => { entered = resolve; });
    let release!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    async function barrier() {
      if (pause) { pause = false; entered(); await hold; }
    }
    const update = f.authStore.updateState.bind(f.authStore);
    const write = f.authStore.writeState.bind(f.authStore);
    f.authStore.updateState = async (mutate) => { await barrier(); return update(mutate); };
    f.authStore.writeState = async (state) => { await barrier(); return write(state); };
    const login = request(f.server, client === 'web'
      ? '/api/auth/google/login' : '/api/mobile/auth/google/login', {
      method: 'POST', origin: 'http://localhost:5173', cookie: 'g_csrf_token=gis-token',
      body: client === 'web' ? { credential: 'id-token', csrfToken: 'gis-token' }
        : { idToken: 'id-token', nonce: 'mobile-nonce' },
    });
    let completed: Awaited<ReturnType<typeof request>>;
    try {
      await paused;
      completed = await request(f.server, '/api/auth/password/first', {
        method: 'POST', origin: 'http://localhost:5173', cookie,
        csrfToken: status.payload?.csrfToken, googleProof: proof, desktopContext: 'window',
        body: { password: 'correct-password' },
      });
      assert.equal(completed.status, 200);
    } finally { release(); }
    assert.equal((await login).status, 200);
    const after = await f.authStore.readState();
    assert.equal(after.identities.filter((identity) => identity.provider === 'local_password').length, 1);
    assert.equal(after.sessions.length, 2);
    const preserved = await request(f.server, '/api/auth/password/first', {
      method: 'POST', origin: 'http://localhost:5173', cookie,
      csrfToken: completed.payload?.csrfToken, googleProof: proof, desktopContext: 'window',
      body: { password: 'overwrite-password' },
    });
    assert.equal(preserved.status, 403);
  });
}

test('session revocation immediately before password mutation cannot be bypassed by a fresh proof',
  async (t) => {
    const google = testGoogleProvider();
    const f = await createSetupFixture(t, { googleProofStore: google.store });
    const setup = await request(f.server, '/api/platform/setup/complete', {
      method: 'POST', origin: 'http://localhost:5173', desktopContext: 'window',
      googleProof: await google.proof({ purpose: 'bootstrap', contextId: 'window', attemptId: 'setup' }),
      body: { adminMethod: 'google', attemptId: 'setup', ownerDisplayName: 'Owner' },
    });
    const cookie = setup.setCookie!.split(';')[0]!;
    const status = await request(f.server, '/api/auth/status', { cookie });
    const state = await f.authStore.readState();
    const proof = await google.proof({ purpose: 'set_password', contextId: 'window',
      accountId: state.accounts[0]!.id, sessionId: state.sessions[0]!.id });
    const update = f.authStore.updateState.bind(f.authStore);
    let revoke = true;
    f.authStore.updateState = async (mutate) => {
      if (revoke) {
        revoke = false;
        await update((current) => ({ ...current, sessions: current.sessions.map((session) =>
          ({ ...session, revokedAt: NOW.toISOString() })) }));
      }
      return update(mutate);
    };
    const response = await request(f.server, '/api/auth/password/first', {
      method: 'POST', origin: 'http://localhost:5173', cookie,
      csrfToken: status.payload?.csrfToken, googleProof: proof, desktopContext: 'window',
      body: { password: 'correct-password' },
    });
    assert.equal(response.status, 403);
    const after = await f.authStore.readState();
    assert.equal(after.identities.length, 1);
    assert.equal(after.sessions[0]?.revokedAt, NOW.toISOString());
  });

test('platform setup can create first local admin and browser session', async (t) => {
  const fixture = await createSetupFixture(t);
  const response = await request(fixture.server, '/api/platform/setup/complete', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: {
      ownerDisplayName: 'Owner',
      createGuideCat: false,
      adminIdentifier: 'owner@example.test',
      adminPassword: 'correct-password',
    },
  });

  assert.equal(response.status, 200);
  assert.match(response.setCookie ?? '', new RegExp(`${AUTH_SESSION_COOKIE_NAME}=`, 'u'));
  const token = readCookieValue(response.setCookie ?? '', AUTH_SESSION_COOKIE_NAME);
  assert.ok(token, 'setup response should return a browser session cookie');

  const authState = await fixture.authStore.readState();
  assert.equal(authState.accounts.length, 1);
  assert.equal(authState.identities.length, 1);
  assert.equal(authState.memberships.length, 1);
  assert.equal(authState.sessions.length, 1);
  assert.equal(authState.accounts[0]?.email, 'owner@example.test');
  assert.equal(authState.identities[0]?.provider, 'local_password');
  assert.equal(authState.identities[0]?.providerSubject, 'owner@example.test');
  assert.equal(authState.identities[0]?.passwordHash?.includes('correct-password'), false);
  assert.deepEqual(authState.memberships[0]?.roles, ['owner', 'admin']);
  assert.equal(authState.memberships[0]?.coreActorId, 'actor-owner');
  assert.equal(authState.sessions[0]?.tokenHash, hashSessionToken(token, SESSION_SECRET));
  assert.equal(typeof authState.sessions[0]?.csrfTokenHash, 'string');

  const core = await fixture.chatStore.readCore();
  assert.equal(core.ownerProfile.displayName, 'Owner');
  assert.ok(core.setupCompleteAt);
});

// The packaged clean-install regression lived exactly here: the wizard always
// submits admin credentials, so a host that starts the platform sidecar without
// its session secret cannot finish first-admin setup. Desktop provisions the
// secret before startAll(); this pins the safe server-side failure seam if an
// upstream host stops doing that.
test('platform setup cannot create the first admin without a session secret', async (t) => {
  const fixture = await createSetupFixture(t, { sessionSecret: null });
  const response = await request(fixture.server, '/api/platform/setup/complete', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: {
      ownerDisplayName: 'Owner',
      createGuideCat: false,
      adminIdentifier: 'owner@example.test',
      adminPassword: 'correct-password',
    },
  });

  assert.equal(response.status, 503);
  assert.equal(response.payload?.error?.code, 'configuration_error');
  assert.equal(
    response.payload?.error?.message,
    'Authentication is not configured for first-admin setup.',
  );
  assert.doesNotMatch(response.payload?.error?.message ?? '', /CATS_/u);
  assert.equal(response.setCookie, null);
  assert.equal((await fixture.authStore.readState()).accounts.length, 0);
  assert.equal((await fixture.chatStore.readCore()).setupCompleteAt, null);
});

test('platform setup keeps unexpected pre-auth failures out of the response', async (t) => {
  const fixture = await createSetupFixture(t);
  Object.defineProperty(fixture.chatStore, 'writeSnapshot', {
    value: async () => {
      throw new Error('sensitive store failure at C:\\Users\\owner\\private-state.json');
    },
  });
  const response = await request(fixture.server, '/api/platform/setup/complete', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: {
      ownerDisplayName: 'Owner',
      createGuideCat: false,
      adminIdentifier: 'owner@example.test',
      adminPassword: 'correct-password',
    },
  });

  assert.equal(response.status, 500);
  assert.equal(response.payload?.error?.code, 'internal_error');
  assert.equal(response.payload?.error?.message, 'Setup could not be completed.');
  assert.doesNotMatch(response.payload?.error?.message ?? '', /private-state/u);
  assert.equal(response.setCookie, null);
  assert.equal((await fixture.authStore.readState()).accounts.length, 0);
  assert.equal((await fixture.chatStore.readCore()).setupCompleteAt, null);
});

test('platform setup also hides failures before the transactional setup block', async (t) => {
  const fixture = await createSetupFixture(t);
  const initialCore = await fixture.chatStore.readCore();
  let readCount = 0;
  Object.defineProperty(fixture.chatStore, 'readCore', {
    value: async () => {
      readCount += 1;
      if (readCount === 1) {
        return initialCore;
      }
      throw new Error('sensitive early read failure at C:\\Users\\owner\\chat-state.json');
    },
  });
  const response = await request(fixture.server, '/api/platform/setup/complete', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: {
      ownerDisplayName: 'Owner',
      createGuideCat: false,
      adminIdentifier: 'owner@example.test',
      adminPassword: 'correct-password',
    },
  });

  assert.equal(response.status, 500);
  assert.equal(response.payload?.error?.code, 'internal_error');
  assert.equal(response.payload?.error?.message, 'Setup could not be completed.');
  assert.doesNotMatch(response.payload?.error?.message ?? '', /chat-state/u);
  assert.equal(response.setCookie, null);
  assert.equal((await fixture.authStore.readState()).accounts.length, 0);
});

test('server-level failures do not expose raw auth-gate errors', async (t) => {
  const fixture = await createSetupFixture(t);
  Object.defineProperty(fixture.chatStore, 'readCore', {
    value: async () => {
      throw new Error('sensitive auth gate failure at C:\\Users\\owner\\auth-state.json');
    },
  });
  const response = await request(fixture.server, '/api/platform/setup/complete', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: {
      ownerDisplayName: 'Owner',
      createGuideCat: false,
      adminIdentifier: 'owner@example.test',
      adminPassword: 'correct-password',
    },
  });

  assert.equal(response.status, 500);
  assert.equal(response.payload?.error?.code, 'internal_error');
  assert.equal(response.payload?.error?.message, 'Unexpected server error');
  assert.doesNotMatch(response.payload?.error?.message ?? '', /auth-state/u);
  assert.equal(response.setCookie, null);
  assert.equal((await fixture.authStore.readState()).accounts.length, 0);
});

test('platform setup rejects partial first-admin credentials before completion', async (t) => {
  const fixture = await createSetupFixture(t);
  const response = await request(fixture.server, '/api/platform/setup/complete', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: {
      ownerDisplayName: 'Owner',
      createGuideCat: false,
      adminIdentifier: 'owner@example.test',
    },
  });

  assert.equal(response.status, 400);
  assert.equal(response.payload?.error?.code, 'invalid_admin_credentials');
  assert.equal(response.payload?.error?.reason, 'password_required');
  assert.equal((await fixture.authStore.readState()).accounts.length, 0);
  assert.equal((await fixture.chatStore.readCore()).setupCompleteAt, null);
});

test('platform setup requires admin credentials rather than falling through to repair', async (t) => {
  const fixture = await createSetupFixture(t);
  const response = await request(fixture.server, '/api/platform/setup/complete', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: {
      ownerDisplayName: 'Owner',
      createGuideCat: false,
    },
  });

  assert.equal(response.status, 400);
  assert.equal(response.payload?.error?.code, 'invalid_admin_credentials');
  assert.equal(response.payload?.error?.reason, 'identifier_required');
  // Requirement 2: setup must not complete without an Admin.
  assert.equal((await fixture.chatStore.readCore()).setupCompleteAt, null);
  assert.equal((await fixture.authStore.readState()).accounts.length, 0);
});

test('platform setup enforces the shared admin password policy', async (t) => {
  const fixture = await createSetupFixture(t);
  const tooShort = await request(fixture.server, '/api/platform/setup/complete', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: {
      ownerDisplayName: 'Owner',
      createGuideCat: false,
      adminIdentifier: 'owner@example.test',
      adminPassword: 'sevench',
    },
  });
  assert.equal(tooShort.status, 400);
  assert.equal(tooShort.payload?.error?.reason, 'password_too_short');

  const tooLong = await request(fixture.server, '/api/platform/setup/complete', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: {
      ownerDisplayName: 'Owner',
      createGuideCat: false,
      adminIdentifier: 'owner@example.test',
      adminPassword: 'a'.repeat(257),
    },
  });
  assert.equal(tooLong.status, 400);
  assert.equal(tooLong.payload?.error?.reason, 'password_too_long');

  // Eight code points with no uppercase, digit, or symbol is valid.
  const accepted = await request(fixture.server, '/api/platform/setup/complete', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: {
      ownerDisplayName: 'Owner',
      createGuideCat: false,
      adminIdentifier: 'owner@example.test',
      adminPassword: 'eightchr',
    },
  });
  assert.equal(accepted.status, 200);
  assert.equal((await fixture.authStore.readState()).accounts.length, 1);
});

test('concurrent first-admin submissions create exactly one admin', async (t) => {
  const fixture = await createSetupFixture(t);
  const submit = (identifier: string) =>
    request(fixture.server, '/api/platform/setup/complete', {
      method: 'POST',
      origin: 'http://localhost:5173',
      secFetchSite: 'same-origin',
      body: {
        ownerDisplayName: 'Owner',
        createGuideCat: false,
        adminIdentifier: identifier,
        adminPassword: 'correct-password',
      },
    });

  const [first, second] = await Promise.all([
    submit('first@example.test'),
    submit('second@example.test'),
  ]);

  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, [200, 409]);

  const authState = await fixture.authStore.readState();
  assert.equal(authState.accounts.length, 1);
  assert.equal(authState.identities.length, 1);
  assert.equal(authState.memberships.length, 1);
  // Requirement 6: the loser gets no session of its own.
  assert.equal(authState.sessions.length, 1);

  const winner = first.status === 200 ? first : second;
  const loser = first.status === 200 ? second : first;
  assert.match(winner.setCookie ?? '', new RegExp(`${AUTH_SESSION_COOKIE_NAME}=`, 'u'));
  assert.equal(loser.setCookie, null);
  assert.equal(loser.payload?.error?.code, 'already_complete');
});

test('a chat snapshot failure rolls the first admin back out of auth state', async (t) => {
  const fixture = await createSetupFixture(t);
  const originalWriteSnapshot = fixture.chatStore.writeSnapshot.bind(fixture.chatStore);
  let failNext = true;
  fixture.chatStore.writeSnapshot = async (state, core) => {
    if (failNext) {
      failNext = false;
      throw new Error('injected snapshot failure');
    }
    return originalWriteSnapshot(state, core);
  };

  const failed = await request(fixture.server, '/api/platform/setup/complete', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: {
      ownerDisplayName: 'Owner',
      createGuideCat: false,
      adminIdentifier: 'owner@example.test',
      adminPassword: 'correct-password',
    },
  });

  assert.equal(failed.status, 500);
  // Requirement 7: no partial auth state and no setupCompleteAt.
  const rolledBack = await fixture.authStore.readState();
  assert.equal(rolledBack.accounts.length, 0);
  assert.equal(rolledBack.identities.length, 0);
  assert.equal(rolledBack.memberships.length, 0);
  assert.equal(rolledBack.sessions.length, 0);
  assert.equal((await fixture.chatStore.readCore()).setupCompleteAt, null);

  // The rollback leaves the workspace able to complete setup on a retry.
  const retried = await request(fixture.server, '/api/platform/setup/complete', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: {
      ownerDisplayName: 'Owner',
      createGuideCat: false,
      adminIdentifier: 'owner@example.test',
      adminPassword: 'correct-password',
    },
  });
  assert.equal(retried.status, 200);
  assert.equal((await fixture.authStore.readState()).accounts.length, 1);
});

test('an auth persistence failure leaves setup incomplete', async (t) => {
  const fixture = await createSetupFixture(t);
  const originalUpdateState = fixture.authStore.updateState.bind(fixture.authStore);
  let failNext = true;
  fixture.authStore.updateState = async (mutator) => {
    if (failNext) {
      failNext = false;
      throw new Error('injected auth persistence failure');
    }
    return originalUpdateState(mutator);
  };

  const failed = await request(fixture.server, '/api/platform/setup/complete', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: {
      ownerDisplayName: 'Owner',
      createGuideCat: false,
      adminIdentifier: 'owner@example.test',
      adminPassword: 'correct-password',
    },
  });

  assert.equal(failed.status, 500);
  // Auth is written first, so a failure there must not have set setupCompleteAt.
  assert.equal((await fixture.chatStore.readCore()).setupCompleteAt, null);
  assert.equal((await fixture.authStore.readState()).accounts.length, 0);
});

test('platform setup rejects first-admin creation without allowlisted origin', async (t) => {
  const fixture = await createSetupFixture(t);
  const missingOrigin = await request(fixture.server, '/api/platform/setup/complete', {
    method: 'POST',
    body: {
      ownerDisplayName: 'Owner',
      createGuideCat: false,
      adminIdentifier: 'owner@example.test',
      adminPassword: 'correct-password',
    },
  });
  assert.equal(missingOrigin.status, 403);
  assert.equal(missingOrigin.payload?.error?.code, 'E_FORBIDDEN');

  const crossSite = await request(fixture.server, '/api/platform/setup/complete', {
    method: 'POST',
    origin: 'http://evil.example.test',
    secFetchSite: 'cross-site',
    body: {
      ownerDisplayName: 'Owner',
      createGuideCat: false,
      adminIdentifier: 'owner@example.test',
      adminPassword: 'correct-password',
    },
  });
  assert.equal(crossSite.status, 403);
  assert.equal(crossSite.payload?.error?.code, 'E_FORBIDDEN');
  assert.equal((await fixture.authStore.readState()).accounts.length, 0);
  assert.equal((await fixture.chatStore.readCore()).setupCompleteAt, null);
});

test('setup reset requires authenticated admin csrf after setup is complete', async (t) => {
  const fixture = await createSetupFixture(t);
  const setup = await request(fixture.server, '/api/platform/setup/complete', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: {
      ownerDisplayName: 'Owner',
      createGuideCat: false,
      adminIdentifier: 'owner@example.test',
      adminPassword: 'correct-password',
    },
  });
  assert.equal(setup.status, 200);
  const cookie = (setup.setCookie ?? '').split(';')[0]!;

  const unauthenticated = await request(fixture.server, '/api/setup/reset', {
    method: 'POST',
  });
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.payload?.error?.code, 'E_UNAUTHENTICATED');

  const missingCsrf = await request(fixture.server, '/api/setup/reset', {
    method: 'POST',
    cookie,
  });
  assert.equal(missingCsrf.status, 403);
  assert.equal(missingCsrf.payload?.error?.code, 'E_CSRF_MISMATCH');
  assert.ok((await fixture.chatStore.readCore()).setupCompleteAt);

  const status = await request(fixture.server, '/api/auth/status', { cookie });
  const reset = await request(fixture.server, '/api/setup/reset', {
    method: 'POST',
    cookie,
    csrfToken: status.payload?.csrfToken,
  });
  assert.equal(reset.status, 200);
  assert.equal((await fixture.chatStore.readCore()).setupCompleteAt, null);
  const clearedAuth = await fixture.authStore.readState();
  assert.deepEqual(clearedAuth.accounts, []);
  assert.deepEqual(clearedAuth.identities, []);
  assert.deepEqual(clearedAuth.memberships, []);
  assert.deepEqual(clearedAuth.sessions, []);
  assert.deepEqual(clearedAuth.loginFailures, []);
  assert.deepEqual(clearedAuth.loginCooldowns, []);
});

for (const createGuideCat of [false, true]) {
  test(`setup can complete again after reset (Guide Cat: ${createGuideCat})`, async (t) => {
    const fixture = await createSetupFixture(t, { authPersistence: 'file' });
    const setup = await request(fixture.server, '/api/platform/setup/complete', {
      method: 'POST',
      origin: 'http://localhost:5173',
      secFetchSite: 'same-origin',
      body: {
        ownerDisplayName: 'Original owner',
        createGuideCat,
        adminIdentifier: 'original@example.test',
        adminPassword: 'original-password',
      },
    });
    assert.equal(setup.status, 200);
    const oldCookie = (setup.setCookie ?? '').split(';')[0]!;
    const oldAuth = await fixture.authStore.readState();
    const status = await request(fixture.server, '/api/auth/status', { cookie: oldCookie });

    const reset = await request(fixture.server, '/api/setup/reset', {
      method: 'POST',
      cookie: oldCookie,
      csrfToken: status.payload?.csrfToken,
    });
    assert.equal(reset.status, 200);
    assert.equal(reset.payload?.setupCompleteAt, null);
    assert.equal(reset.payload?.guideCat, null);

    const repeated = await request(fixture.server, '/api/platform/setup/complete', {
      method: 'POST',
      origin: 'http://localhost:5173',
      secFetchSite: 'same-origin',
      body: {
        ownerDisplayName: 'New owner',
        createGuideCat,
        adminIdentifier: 'new@example.test',
        adminPassword: 'new-password',
      },
    });
    assert.equal(repeated.status, 200);
    assert.ok(repeated.payload?.setupCompleteAt);
    assert.equal(repeated.payload?.ownerDisplayName, 'New owner');
    assert.equal(Boolean(repeated.payload?.guideCat), createGuideCat);
    assert.match(reset.setCookie ?? '', /cats_session=;.*Max-Age=0/u);

    const newAuth = await fixture.authStore.readState();
    assert.equal(newAuth.accounts.length, 1);
    assert.equal(newAuth.identities.length, 1);
    assert.equal(newAuth.memberships.length, 1);
    assert.equal(newAuth.sessions.length, 1);
    assert.equal(newAuth.accounts[0]?.email, 'new@example.test');
    assert.notEqual(newAuth.accounts[0]?.id, oldAuth.accounts[0]?.id);
    assert.notEqual(newAuth.sessions[0]?.id, oldAuth.sessions[0]?.id);

    const oldStatus = await request(fixture.server, '/api/auth/status', { cookie: oldCookie });
    assert.equal(oldStatus.payload?.authenticated, false);
    const newCookie = (repeated.setCookie ?? '').split(';')[0]!;
    const newStatus = await request(fixture.server, '/api/auth/status', { cookie: newCookie });
    assert.equal(newStatus.payload?.authenticated, true);
    const shell = await request(fixture.server, '/api/app-shell', { cookie: newCookie });
    assert.equal(shell.status, 200);
    assert.equal(shell.payload?.setupCompleteAt, repeated.payload?.setupCompleteAt);
    assert.equal(shell.payload?.ownerDisplayName, 'New owner');
  });
}

for (const failedStore of ['chat', 'auth'] as const) {
  test(`setup reset preserves the workspace when ${failedStore} persistence fails`, async (t) => {
    const fixture = await createSetupFixture(t);
    const setup = await request(fixture.server, '/api/platform/setup/complete', {
      method: 'POST',
      origin: 'http://localhost:5173',
      secFetchSite: 'same-origin',
      body: {
        ownerDisplayName: 'Original owner',
        createGuideCat: false,
        adminIdentifier: 'owner@example.test',
        adminPassword: 'correct-password',
      },
    });
    assert.equal(setup.status, 200);
    const cookie = (setup.setCookie ?? '').split(';')[0]!;
    const status = await request(fixture.server, '/api/auth/status', { cookie });
    const previousCore = await fixture.chatStore.readCore();
    const previousChat = await fixture.chatStore.read();
    const previousAuth = await fixture.authStore.readState();

    let failNext = true;
    if (failedStore === 'chat') {
      const writeSnapshot = fixture.chatStore.writeSnapshot.bind(fixture.chatStore);
      fixture.chatStore.writeSnapshot = async (chat, core) => {
        if (failNext) {
          failNext = false;
          throw new Error('injected chat reset failure');
        }
        return writeSnapshot(chat, core);
      };
    } else {
      const writeState = fixture.authStore.writeState.bind(fixture.authStore);
      fixture.authStore.writeState = async (state) => {
        if (failNext) {
          failNext = false;
          throw new Error('injected auth reset failure');
        }
        return writeState(state);
      };
    }

    const reset = () => request(fixture.server, '/api/setup/reset', {
      method: 'POST',
      cookie,
      csrfToken: status.payload?.csrfToken,
    });
    const failed = await reset();
    assert.equal(failed.status, 500);
    assert.deepEqual(failed.payload?.error, {
      code: 'internal_error',
      message: 'Platform data could not be fully reset. Retry to finish removing the remaining data.',
    });
    assert.equal(failed.setCookie, null);
    const restoredCore = await fixture.chatStore.readCore();
    // The store stamps updatedAt again when restoring a snapshot.
    assert.deepEqual({ ...restoredCore, updatedAt: previousCore.updatedAt }, previousCore);
    assert.deepEqual(await fixture.chatStore.read(), previousChat);
    assert.deepEqual(await fixture.authStore.readState(), previousAuth);

    const retried = await reset();
    assert.equal(retried.status, 200);
    assert.equal((await fixture.chatStore.readCore()).setupCompleteAt, null);
    assert.deepEqual((await fixture.authStore.readState()).accounts, []);
  });
}

test('setup reset still requires an Admin when the setup timestamp is missing', async (t) => {
  const fixture = await createSetupFixture(t);
  const setup = await request(fixture.server, '/api/platform/setup/complete', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: {
      ownerDisplayName: 'Owner',
      createGuideCat: false,
      adminIdentifier: 'owner@example.test',
      adminPassword: 'correct-password',
    },
  });
  assert.equal(setup.status, 200);
  const cookie = (setup.setCookie ?? '').split(';')[0]!;
  const status = await request(fixture.server, '/api/auth/status', { cookie });
  const originalAuth = await fixture.authStore.readState();
  // Reproduce the incomplete state left by the previous reset implementation.
  await fixture.chatStore.writeSnapshot(createDefaultChatState(), createDefaultCoreState());

  const unauthorized = await request(fixture.server, '/api/setup/reset', { method: 'POST' });
  assert.equal(unauthorized.status, 401);
  const missingCsrf = await request(fixture.server, '/api/setup/reset', { method: 'POST', cookie });
  assert.equal(missingCsrf.status, 403);
  await fixture.authStore.updateState((state) => ({
    ...state,
    memberships: state.memberships.map((membership) => ({ ...membership, roles: ['member'] })),
  }));
  const notAdmin = await request(fixture.server, '/api/setup/reset', {
    method: 'POST',
    cookie,
    csrfToken: status.payload?.csrfToken,
  });
  assert.equal(notAdmin.status, 403);
  assert.equal(notAdmin.payload?.error?.code, 'E_FORBIDDEN');
  assert.equal((await fixture.authStore.readState()).accounts.length, 1);

  await fixture.authStore.writeState(originalAuth);
  const reset = await request(fixture.server, '/api/setup/reset', {
    method: 'POST',
    cookie,
    csrfToken: status.payload?.csrfToken,
  });
  assert.equal(reset.status, 200);
  assert.deepEqual((await fixture.authStore.readState()).accounts, []);
});

test('setup completion waits for an in-flight reset to clear the previous Admin', async (t) => {
  const fixture = await createSetupFixture(t);
  const submit = (identifier: string) => request(fixture.server, '/api/platform/setup/complete', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: {
      ownerDisplayName: 'Owner',
      createGuideCat: false,
      adminIdentifier: identifier,
      adminPassword: 'correct-password',
    },
  });
  const setup = await submit('original@example.test');
  assert.equal(setup.status, 200);
  const cookie = (setup.setCookie ?? '').split(';')[0]!;
  const status = await request(fixture.server, '/api/auth/status', { cookie });

  let releaseReset!: () => void;
  const resetPaused = new Promise<void>((resolve) => { releaseReset = resolve; });
  let notifyResetStarted!: () => void;
  const resetStarted = new Promise<void>((resolve) => { notifyResetStarted = resolve; });
  const writeState = fixture.authStore.writeState.bind(fixture.authStore);
  fixture.authStore.writeState = async (state) => {
    if (state.accounts.length === 0) {
      notifyResetStarted();
      await resetPaused;
    }
    return writeState(state);
  };

  const reset = request(fixture.server, '/api/setup/reset', {
    method: 'POST',
    cookie,
    csrfToken: status.payload?.csrfToken,
  });
  let repeated: ReturnType<typeof submit> | undefined;
  try {
    await resetStarted;
    assert.equal((await fixture.chatStore.readCore()).setupCompleteAt, null);
    repeated = submit('new@example.test');
    const resultWhileResetting = await Promise.race([
      repeated.then(() => 'completed'),
      new Promise<string>((resolve) => setTimeout(() => resolve('waiting'), 100)),
    ]);
    assert.equal(resultWhileResetting, 'waiting');
  } finally {
    releaseReset();
    await reset;
    await repeated;
  }
  assert.equal((await reset).status, 200);
  assert.equal((await repeated)?.status, 200);
  assert.ok((await fixture.chatStore.readCore()).setupCompleteAt);
  const auth = await fixture.authStore.readState();
  assert.equal(auth.accounts.length, 1);
  assert.equal(auth.accounts[0]?.email, 'new@example.test');
});

async function createSetupFixture(
  t: TestContext,
  options: {
    sessionSecret?: string | null;
    authPersistence?: 'memory' | 'file';
    googleProofStore?: PlatformGoogleProofStore;
    googleVerifier?: PlatformGoogleIdTokenVerifier;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<{
  server: ReturnType<typeof createServer>;
  authStore: PlatformAuthStore;
  chatStore: MemoryChatStore;
}> {
  const sessionSecret = options.sessionSecret === undefined
    ? SESSION_SECRET
    : options.sessionSecret;
  const tempDir = await mkdtemp(path.join(tmpdir(), 'cats-auth-setup-'));
  const config = loadConfig({
    HOME: tempDir,
    CATS_PLATFORM_DIR: path.join(tempDir, 'platform'),
    ...(sessionSecret === null ? {} : { CATS_AUTH_SESSION_SECRET: sessionSecret }),
    ...options.env,
  });
  const authStore = options.authPersistence === 'file'
    ? createFileBackedPlatformAuthStore(config.chatStatePath, () => NOW)
    : new MemoryPlatformAuthStore(undefined, () => NOW);
  const chatStore = new MemoryChatStore();
  const server = createServer({
    shared: {
      config,
      runtimeClient: createRuntimeStub() as never,
      authStore,
      googleProofStore: options.googleProofStore,
      googleVerifier: options.googleVerifier,
      now: () => NOW,
    },
    chat: {
      chatStore,
    },
  });
  await listen(server);
  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await waitForGuideCatAssistRefreshIdle(config.chatStatePath);
    await rm(tempDir, { recursive: true, force: true });
  });
  return { server, authStore, chatStore };
}

function createRuntimeStub() {
  return {
    async getHealth() {
      return {
        baseUrl: 'http://127.0.0.1:3110',
        reachable: true,
        status: 'ok',
        service: 'cats-runtime',
      };
    },
  };
}

async function listen(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
}

async function request(
  server: ReturnType<typeof createServer>,
  pathname: string,
  options: {
    method?: string;
    body?: unknown;
    origin?: string;
    secFetchSite?: string;
    cookie?: string;
    csrfToken?: unknown;
    googleProof?: string;
    desktopContext?: string;
  } = {},
): Promise<{
  status: number;
  setCookie: string | null;
  payload: Record<string, any> | null;
}> {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Server is not listening.');
  }
  const headers: Record<string, string> = {};
  if (pathname === '/api/setup/reset' && options.method === 'POST' && options.body === undefined) {
    options = { ...options, body: { confirmation: 'RESET', resetRuntime: false } };
  }
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (options.origin) {
    headers.origin = options.origin;
  }
  if (options.secFetchSite) {
    headers['sec-fetch-site'] = options.secFetchSite;
  }
  if (options.cookie) {
    headers.cookie = options.cookie;
  }
  if (typeof options.csrfToken === 'string') {
    headers['x-cats-csrf-token'] = options.csrfToken;
  }
  if (options.googleProof) headers['x-cats-google-proof'] = options.googleProof;
  if (options.desktopContext) headers['x-cats-desktop-auth-context'] = options.desktopContext;
  const response = await fetch(`http://127.0.0.1:${address.port}${pathname}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  return {
    status: response.status,
    setCookie: response.headers.get('set-cookie'),
    payload: text ? JSON.parse(text) as Record<string, any> : null,
  };
}

function readCookieValue(setCookie: string, name: string): string | null {
  const prefix = `${name}=`;
  const cookie = setCookie.split(';').find((part) => part.trim().startsWith(prefix));
  if (!cookie) {
    return null;
  }
  return decodeURIComponent(cookie.trim().slice(prefix.length));
}
