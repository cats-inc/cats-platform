import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadConfig } from '../src/config.ts';
import { routePlatformAuthApi } from '../src/app/server/authRoutes.ts';
import {
  createEmptyPlatformAuthState,
  createFirstAdminLocalAuthState,
  issuePlatformAuthRecoveryToken,
  linkGoogleIdentityToAccount,
  MemoryPlatformAuthActionGrantStore,
  MemoryPlatformAuthStore,
  AUTH_SESSION_COOKIE_NAME,
  createLoginThrottleSubject,
  recordFailedLogin,
  type PlatformAccountRecord,
  type PlatformAuthActionGrantStore,
  type PlatformAuthRecoveryTokenState,
  type PlatformAuthSecurityEvent,
  type PlatformLoginThrottleAlert,
  type PlatformAuthState,
  type PlatformAuthStateReadStatus,
  type PlatformAuthStore,
  type PlatformGoogleIdTokenClaims,
  type PlatformGoogleIdTokenVerifier,
} from '../src/platform/auth/index.ts';

const NOW = new Date('2026-05-10T00:00:00.000Z');
const SESSION_SECRET = 'test-session-secret-at-least-sixteen-chars';

test('platform auth status is public and mirrors configured Google provider', async (t) => {
  const server = createTestServer(new MemoryPlatformAuthStore(undefined, () => NOW), {
    CATS_AUTH_GOOGLE_CLIENT_ID: 'google-client-id',
  });
  await listen(server);
  t.after(() => server.close());

  const response = await request(server, '/api/auth/status');
  assert.equal(response.status, 200);
  assert.equal(response.payload?.authenticated, false);
  assert.equal(response.payload?.csrfToken, null);
  assert.deepEqual(response.payload?.providers, {
    google: { enabled: true, clientId: 'google-client-id' },
  });
});

test('platform auth login requires an allowlisted browser origin', async (t) => {
  const store = await createSeededStore();
  const server = createTestServer(store);
  await listen(server);
  t.after(() => server.close());

  const missingOrigin = await request(server, '/api/auth/login', {
    method: 'POST',
    body: { identifier: 'owner@example.test', password: 'correct-password' },
  });
  assert.equal(missingOrigin.status, 403);
  assert.equal(errorCode(missingOrigin.payload), 'E_FORBIDDEN');

  const crossSite = await request(server, '/api/auth/login', {
    method: 'POST',
    origin: 'http://evil.example.test',
    secFetchSite: 'cross-site',
    body: { identifier: 'owner@example.test', password: 'correct-password' },
  });
  assert.equal(crossSite.status, 403);
  assert.equal(errorCode(crossSite.payload), 'E_FORBIDDEN');
});

test('platform auth login ignores untrusted forwarded origin headers', async (t) => {
  const store = await createSeededStore();
  const server = createTestServer(store, {
    CATS_AUTH_ALLOWED_BROWSER_ORIGINS: 'https://cats.example.test',
  });
  await listen(server);
  t.after(() => server.close());

  const forwardedOnly = await request(server, '/api/auth/login', {
    method: 'POST',
    secFetchSite: 'same-origin',
    headers: {
      'x-forwarded-host': 'cats.example.test',
      'x-forwarded-proto': 'https',
    },
    body: { identifier: 'owner@example.test', password: 'correct-password' },
  });
  assert.equal(forwardedOnly.status, 403);
  assert.equal(errorCode(forwardedOnly.payload), 'E_FORBIDDEN');

  const explicitOrigin = await request(server, '/api/auth/login', {
    method: 'POST',
    origin: 'https://cats.example.test',
    secFetchSite: 'same-origin',
    body: { identifier: 'owner@example.test', password: 'wrong-password' },
  });
  assert.equal(explicitOrigin.status, 401);
  assert.equal(errorCode(explicitOrigin.payload), 'E_UNAUTHENTICATED');
});

test('platform auth local login issues cookie and status rotates csrf', async (t) => {
  const store = await createSeededStore();
  const server = createTestServer(store);
  await listen(server);
  t.after(() => server.close());

  const login = await request(server, '/api/auth/login', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: { identifier: 'OWNER@example.test', password: 'correct-password' },
  });
  assert.equal(login.status, 200);
  assert.equal(login.payload?.authenticated, true);
  assert.equal((login.payload?.principal as { coreActorId?: string }).coreActorId, 'actor-owner');
  assert.equal(typeof login.payload?.csrfToken, 'string');
  assert.match(login.setCookie ?? '', /cats_session=/u);
  const cookie = (login.setCookie ?? '').split(';')[0]!;

  const status = await request(server, '/api/auth/status', { cookie });
  assert.equal(status.status, 200);
  assert.equal(status.payload?.authenticated, true);
  assert.equal(status.payload?.principal?.accountId, login.payload?.principal?.accountId);
  assert.equal(typeof status.payload?.csrfToken, 'string');
  assert.notEqual(status.payload?.csrfToken, login.payload?.csrfToken);
});

test('platform auth logout revokes current browser session and clears cookie', async (t) => {
  const store = await createSeededStore();
  const server = createTestServer(store);
  await listen(server);
  t.after(() => server.close());

  const login = await request(server, '/api/auth/login', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: { identifier: 'owner@example.test', password: 'correct-password' },
  });
  const cookie = (login.setCookie ?? '').split(';')[0]!;
  const logout = await request(server, '/api/auth/logout', {
    method: 'POST',
    cookie,
    csrfToken: login.payload?.csrfToken,
  });
  assert.equal(logout.status, 200);
  assert.equal(logout.payload?.authenticated, false);
  assert.match(logout.setCookie ?? '', /Max-Age=0/u);

  const status = await request(server, '/api/auth/status', { cookie });
  assert.equal(status.payload?.authenticated, false);
});

test('platform auth logout rejects missing csrf for active browser sessions', async (t) => {
  const store = await createSeededStore();
  const server = createTestServer(store);
  await listen(server);
  t.after(() => server.close());

  const login = await request(server, '/api/auth/login', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: { identifier: 'owner@example.test', password: 'correct-password' },
  });
  const cookie = (login.setCookie ?? '').split(';')[0]!;

  const missingCsrf = await request(server, '/api/auth/logout', {
    method: 'POST',
    cookie,
  });
  assert.equal(missingCsrf.status, 403);
  assert.equal(errorCode(missingCsrf.payload), 'E_CSRF_MISMATCH');

  const stillAuthenticated = await request(server, '/api/auth/status', { cookie });
  assert.equal(stillAuthenticated.payload?.authenticated, true);
});

test('platform auth logout rejects google csrf as a Cats csrf substitute', async (t) => {
  const store = await createSeededStore();
  const server = createTestServer(store);
  await listen(server);
  t.after(() => server.close());

  const login = await request(server, '/api/auth/login', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: { identifier: 'owner@example.test', password: 'correct-password' },
  });
  const cookie = `${(login.setCookie ?? '').split(';')[0]!}; g_csrf_token=google-csrf-token`;

  const response = await request(server, '/api/auth/logout', {
    method: 'POST',
    cookie,
    body: { g_csrf_token: 'google-csrf-token' },
  });

  assert.equal(response.status, 403);
  assert.equal(errorCode(response.payload), 'E_CSRF_MISMATCH');
  const stillAuthenticated = await request(server, '/api/auth/status', { cookie });
  assert.equal(stillAuthenticated.payload?.authenticated, true);
});

test('platform auth logout rejects stale csrf after status rotation', async (t) => {
  const store = await createSeededStore();
  const server = createTestServer(store);
  await listen(server);
  t.after(() => server.close());

  const login = await request(server, '/api/auth/login', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: { identifier: 'owner@example.test', password: 'correct-password' },
  });
  const cookie = (login.setCookie ?? '').split(';')[0]!;
  const status = await request(server, '/api/auth/status', { cookie });
  assert.notEqual(status.payload?.csrfToken, login.payload?.csrfToken);

  const staleLogout = await request(server, '/api/auth/logout', {
    method: 'POST',
    cookie,
    csrfToken: login.payload?.csrfToken,
  });
  assert.equal(staleLogout.status, 403);
  assert.equal(errorCode(staleLogout.payload), 'E_CSRF_MISMATCH');

  const freshLogout = await request(server, '/api/auth/logout', {
    method: 'POST',
    cookie,
    csrfToken: status.payload?.csrfToken,
  });
  assert.equal(freshLogout.status, 200);
  assert.equal(freshLogout.payload?.authenticated, false);
});

test('platform auth local login enforces composite failed-login lockout', async (t) => {
  const store = await createSeededStore();
  const server = createTestServer(store, {
    CATS_AUTH_LOGIN_FAILURE_LIMIT: '2',
    CATS_AUTH_LOGIN_LOCKOUT_MS: '30000',
  });
  await listen(server);
  t.after(() => server.close());

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const failed = await request(server, '/api/auth/login', {
      method: 'POST',
      origin: 'http://localhost:5173',
      secFetchSite: 'same-origin',
      body: { identifier: 'owner@example.test', password: 'wrong-password' },
    });
    assert.equal(failed.status, 401);
    assert.equal(errorCode(failed.payload), 'E_UNAUTHENTICATED');
  }

  const blocked = await request(server, '/api/auth/login', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: { identifier: 'owner@example.test', password: 'correct-password' },
  });
  assert.equal(blocked.status, 403);
  assert.equal(errorCode(blocked.payload), 'E_FORBIDDEN');
  assert.match(blocked.payload?.error?.message ?? '', /too many/i);
});

test('platform auth aggregate throttle reports secret-free daily-cap alerts', async (t) => {
  const store = await createSeededStore();
  const alerts: PlatformLoginThrottleAlert[] = [];
  const server = createTestServer(store, {
    CATS_AUTH_LOGIN_FAILURE_LIMIT: '10',
    CATS_AUTH_ACCOUNT_DAILY_FAILURE_CAP: '2',
  }, undefined, {
    loginThrottleAlerts: alerts,
  });
  await listen(server);
  t.after(() => server.close());

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const failed = await request(server, '/api/auth/login', {
      method: 'POST',
      origin: 'http://localhost:5173',
      secFetchSite: 'same-origin',
      body: { identifier: 'owner@example.test', password: 'wrong-password' },
    });
    assert.equal(failed.status, 401);
  }

  assert.equal(alerts.length, 1);
  assert.deepEqual(Object.keys(alerts[0]!).sort(), [
    'createdAt',
    'expiresAt',
    'provider',
    'reason',
  ]);
  assert.equal(alerts[0]?.reason, 'account_daily_cap');
  assert.equal(alerts[0]?.provider, 'local_password');
});

test('platform auth throttle clear accepts authenticated admin csrf', async (t) => {
  const { store, cookie, csrfToken } = await createSeededLockedStore({
    CATS_AUTH_LOGIN_FAILURE_LIMIT: '10',
    CATS_AUTH_ACCOUNT_DAILY_FAILURE_CAP: '2',
  });
  const server = createTestServer(store, {
    CATS_AUTH_LOGIN_FAILURE_LIMIT: '10',
    CATS_AUTH_ACCOUNT_DAILY_FAILURE_CAP: '2',
  });
  await listen(server);
  t.after(() => server.close());

  const response = await request(server, '/api/auth/throttle/clear', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    cookie,
    csrfToken,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.payload, { cleared: true, mode: 'admin' });
  const state = await store.readState();
  assert.equal(state.loginFailures.length, 0);
  assert.equal(state.loginCooldowns.length, 0);
});

test('platform auth throttle clear rejects recovery without token even on loopback', async (t) => {
  const { store } = await createSeededLockedStore({
    CATS_AUTH_LOGIN_FAILURE_LIMIT: '10',
    CATS_AUTH_ACCOUNT_DAILY_FAILURE_CAP: '2',
  });
  const server = createTestServer(store, {
    CATS_AUTH_LOGIN_FAILURE_LIMIT: '10',
    CATS_AUTH_ACCOUNT_DAILY_FAILURE_CAP: '2',
  });
  await listen(server);
  t.after(() => server.close());

  const response = await request(server, '/api/auth/throttle/clear', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
  });

  assert.equal(response.status, 403);
  assert.equal(errorCode(response.payload), 'E_FORBIDDEN');
  const state = await store.readState();
  assert.notEqual(state.loginFailures.length, 0);
  assert.notEqual(state.loginCooldowns.length, 0);
});

test('platform auth throttle clear consumes recovery token off loopback', async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'cats-auth-throttle-clear-'));
  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });
  const issued = await issuePlatformAuthRecoveryToken({
    sessionSecret: SESSION_SECRET,
    recoveryTokenPath: path.join(tempDir, 'auth-recovery-token.local.txt'),
    now: NOW,
  });
  let recoveryTokenState: PlatformAuthRecoveryTokenState | null = issued.state;
  const { store } = await createSeededLockedStore({
    CATS_AUTH_LOGIN_FAILURE_LIMIT: '10',
    CATS_AUTH_ACCOUNT_DAILY_FAILURE_CAP: '2',
  });
  const server = createTestServer(store, {
    CATS_AUTH_LOGIN_FAILURE_LIMIT: '10',
    CATS_AUTH_ACCOUNT_DAILY_FAILURE_CAP: '2',
  }, undefined, {
    remoteAddress: '192.168.1.20',
    authRecoveryTokenState: () => recoveryTokenState,
    setAuthRecoveryTokenState: (state) => {
      recoveryTokenState = state;
    },
  });
  await listen(server);
  t.after(() => server.close());

  const rejected = await request(server, '/api/auth/throttle/clear', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
  });
  assert.equal(rejected.status, 403);

  const cleared = await request(server, '/api/auth/throttle/clear', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: { recoveryToken: issued.token },
  });

  assert.equal(cleared.status, 200);
  assert.deepEqual(cleared.payload, { cleared: true, mode: 'recovery_token' });
  assert.equal(recoveryTokenState?.consumedAt, NOW.toISOString());
  const state = await store.readState();
  assert.equal(state.loginFailures.length, 0);
  assert.equal(state.loginCooldowns.length, 0);
});

test('platform auth google login issues cookie for linked account', async (t) => {
  const googleIdentity = createGoogleIdentity();
  const bootstrap = await createGoogleLinkedBootstrap(googleIdentity);
  const store = new MemoryPlatformAuthStore({
    ...bootstrap.state,
    sessions: [],
  }, () => NOW);
  const server = createTestServer(store, {
    CATS_AUTH_GOOGLE_CLIENT_ID: 'browser-client-id',
  }, fakeGoogleVerifier({
    sub: googleIdentity.providerSubject,
    aud: 'browser-client-id',
    iss: 'https://accounts.google.com',
    exp: Math.floor(NOW.getTime() / 1000) + 600,
    email: googleIdentity.email,
    email_verified: true,
  }));
  await listen(server);
  t.after(() => server.close());

  const login = await request(server, '/api/auth/google/login', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    cookie: 'g_csrf_token=csrf-token',
    body: { credential: 'id-token', csrfToken: 'csrf-token' },
  });

  assert.equal(login.status, 200);
  assert.equal(login.payload?.authenticated, true);
  assert.equal(login.payload?.principal?.accountId, bootstrap.account.id);
  assert.equal(typeof login.payload?.csrfToken, 'string');
  assert.match(login.setCookie ?? '', /cats_session=/u);
});

test('platform auth google login rejects missing google csrf token', async (t) => {
  const store = await createSeededStore();
  const server = createTestServer(store, {
    CATS_AUTH_GOOGLE_CLIENT_ID: 'browser-client-id',
  }, fakeGoogleVerifier({}));
  await listen(server);
  t.after(() => server.close());

  const response = await request(server, '/api/auth/google/login', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: { credential: 'id-token' },
  });
  assert.equal(response.status, 403);
  assert.equal(errorCode(response.payload), 'E_FORBIDDEN');
});

test('platform auth google login does not accept Cats csrf in place of GIS csrf', async (t) => {
  const store = await createSeededStore();
  const server = createTestServer(store, {
    CATS_AUTH_GOOGLE_CLIENT_ID: 'browser-client-id',
  }, fakeGoogleVerifier({}));
  await listen(server);
  t.after(() => server.close());

  const response = await request(server, '/api/auth/google/login', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    csrfToken: 'cats-csrf-token',
    body: { credential: 'id-token', csrfToken: null },
  });

  assert.equal(response.status, 403);
  assert.equal(errorCode(response.payload), 'E_FORBIDDEN');
});

test('platform auth google login enforces composite failed-login lockout', async (t) => {
  const googleIdentity = createGoogleIdentity();
  const bootstrap = await createGoogleLinkedBootstrap(googleIdentity);
  const store = new MemoryPlatformAuthStore({
    ...bootstrap.state,
    accounts: [{ ...bootstrap.account, status: 'disabled' }],
    sessions: [],
  }, () => NOW);
  const server = createTestServer(store, {
    CATS_AUTH_GOOGLE_CLIENT_ID: 'browser-client-id',
    CATS_AUTH_LOGIN_FAILURE_LIMIT: '2',
    CATS_AUTH_LOGIN_LOCKOUT_MS: '30000',
  }, fakeGoogleVerifier({
    sub: googleIdentity.providerSubject,
    aud: 'browser-client-id',
    iss: 'https://accounts.google.com',
    exp: Math.floor(NOW.getTime() / 1000) + 600,
    email: googleIdentity.email,
    email_verified: true,
  }));
  await listen(server);
  t.after(() => server.close());

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const failed = await googleLoginRequest(server);
    assert.equal(failed.status, 401);
    assert.equal(errorCode(failed.payload), 'E_UNAUTHENTICATED');
  }
  await store.updateState((state) => ({
    ...state,
    accounts: state.accounts.map((account) => ({ ...account, status: 'active' })),
  }));

  const blocked = await googleLoginRequest(server);
  assert.equal(blocked.status, 403);
  assert.equal(errorCode(blocked.payload), 'E_FORBIDDEN');
  assert.match(blocked.payload?.error?.message ?? '', /too many/i);
});

test('platform auth google link attaches identity to current browser session', async (t) => {
  const store = await createSeededStore();
  const server = createTestServer(store, {
    CATS_AUTH_GOOGLE_CLIENT_ID: 'browser-client-id',
  }, fakeGoogleVerifier({
    sub: 'google-linked-subject',
    aud: 'browser-client-id',
    iss: 'https://accounts.google.com',
    exp: Math.floor(NOW.getTime() / 1000) + 600,
    email: 'owner@example.test',
    email_verified: true,
    picture: 'https://example.test/avatar.png',
  }));
  await listen(server);
  t.after(() => server.close());

  const stepUp = await signInAndStepUp(server, 'link_google');

  const linked = await request(server, '/api/auth/google/link', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    cookie: `${stepUp.cookie}; g_csrf_token=google-csrf-token`,
    csrfToken: stepUp.csrfToken,
    headers: { 'x-cats-auth-action': stepUp.actionToken },
    body: { credential: 'id-token', csrfToken: 'google-csrf-token' },
  });

  assert.equal(linked.status, 200);
  assert.equal(linked.payload?.authenticated, true);
  assert.equal(linked.payload?.principal?.email, 'owner@example.test');
  assert.deepEqual(linked.payload?.loginMethods, {
    localPassword: { linked: true },
    google: { linked: true, email: 'owner@example.test' },
  });
  assert.equal(typeof linked.payload?.csrfToken, 'string');
  const state = await store.readState();
  assert.equal(state.identities.some((identity) =>
    identity.provider === 'google'
    && identity.providerSubject === 'google-linked-subject',
  ), true);
});

test('platform auth google link requires a step-up action grant', async (t) => {
  const store = await createSeededStore();
  const server = createTestServer(store, {
    CATS_AUTH_GOOGLE_CLIENT_ID: 'browser-client-id',
  }, fakeGoogleVerifier({
    sub: 'google-linked-subject',
    aud: 'browser-client-id',
    iss: 'https://accounts.google.com',
    exp: Math.floor(NOW.getTime() / 1000) + 600,
    email: 'owner@example.test',
    email_verified: true,
  }));
  await listen(server);
  t.after(() => server.close());

  const login = await request(server, '/api/auth/login', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: { identifier: 'owner@example.test', password: 'correct-password' },
  });
  const cookie = (login.setCookie ?? '').split(';')[0]!;
  const csrfToken = String(login.payload?.csrfToken ?? '');

  // A valid session plus a valid Cats CSRF token is deliberately not enough.
  const withoutGrant = await request(server, '/api/auth/google/link', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    cookie: `${cookie}; g_csrf_token=google-csrf-token`,
    csrfToken,
    body: { credential: 'id-token', csrfToken: 'google-csrf-token' },
  });
  assert.equal(withoutGrant.status, 403);
  assert.equal(errorCode(withoutGrant.payload), 'E_REAUTH_REQUIRED');

  const state = await store.readState();
  assert.equal(state.identities.some((identity) => identity.provider === 'google'), false);
});

test('platform auth google link consumes the action grant on first use', async (t) => {
  const store = await createSeededStore();
  const server = createTestServer(store, {
    CATS_AUTH_GOOGLE_CLIENT_ID: 'browser-client-id',
  }, fakeGoogleVerifier({
    sub: 'google-linked-subject',
    aud: 'browser-client-id',
    iss: 'https://accounts.google.com',
    exp: Math.floor(NOW.getTime() / 1000) + 600,
    email: 'owner@example.test',
    email_verified: true,
  }));
  await listen(server);
  t.after(() => server.close());

  const stepUp = await signInAndStepUp(server, 'link_google');
  const linkRequest = (csrfToken: string) => request(server, '/api/auth/google/link', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    cookie: `${stepUp.cookie}; g_csrf_token=google-csrf-token`,
    csrfToken,
    headers: { 'x-cats-auth-action': stepUp.actionToken },
    body: { credential: 'id-token', csrfToken: 'google-csrf-token' },
  });

  const first = await linkRequest(stepUp.csrfToken);
  assert.equal(first.status, 200);

  // A successful link rotates the Cats CSRF token, so the replay has to carry
  // the rotated one; otherwise it would fail on CSRF before reaching the grant.
  const replay = await linkRequest(String(first.payload?.csrfToken ?? ''));
  assert.equal(replay.status, 403);
  assert.equal(errorCode(replay.payload), 'E_REAUTH_REQUIRED');
});

test('platform auth google link rejects a grant issued for another purpose', async (t) => {
  const store = await createSeededStore();
  const server = createTestServer(store, {
    CATS_AUTH_GOOGLE_CLIENT_ID: 'browser-client-id',
  }, fakeGoogleVerifier({
    sub: 'google-linked-subject',
    aud: 'browser-client-id',
    iss: 'https://accounts.google.com',
    exp: Math.floor(NOW.getTime() / 1000) + 600,
    email: 'owner@example.test',
    email_verified: true,
  }));
  await listen(server);
  t.after(() => server.close());

  const stepUp = await signInAndStepUp(server, 'unlink_google');
  const response = await request(server, '/api/auth/google/link', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    cookie: `${stepUp.cookie}; g_csrf_token=google-csrf-token`,
    csrfToken: stepUp.csrfToken,
    headers: { 'x-cats-auth-action': stepUp.actionToken },
    body: { credential: 'id-token', csrfToken: 'google-csrf-token' },
  });

  assert.equal(response.status, 403);
  assert.equal(errorCode(response.payload), 'E_REAUTH_REQUIRED');
});

test('platform auth google link rejects a mismatched verified email', async (t) => {
  const store = await createSeededStore();
  const securityEvents: PlatformAuthSecurityEvent[] = [];
  const server = createTestServer(store, {
    CATS_AUTH_GOOGLE_CLIENT_ID: 'browser-client-id',
  }, fakeGoogleVerifier({
    sub: 'google-linked-subject',
    aud: 'browser-client-id',
    iss: 'https://accounts.google.com',
    exp: Math.floor(NOW.getTime() / 1000) + 600,
    email: 'someone-else@example.test',
    email_verified: true,
  }), { securityEvents });
  await listen(server);
  t.after(() => server.close());

  const stepUp = await signInAndStepUp(server, 'link_google');
  const response = await request(server, '/api/auth/google/link', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    cookie: `${stepUp.cookie}; g_csrf_token=google-csrf-token`,
    csrfToken: stepUp.csrfToken,
    headers: { 'x-cats-auth-action': stepUp.actionToken },
    body: { credential: 'id-token', csrfToken: 'google-csrf-token' },
  });

  assert.equal(response.status, 409);
  assert.equal(errorCode(response.payload), 'E_IDENTITY_CONFLICT');
  const state = await store.readState();
  assert.equal(state.identities.some((identity) => identity.provider === 'google'), false);
  assert.equal(state.accounts[0]?.email, 'owner@example.test');
  assert.equal(
    securityEvents.some((event) =>
      event.kind === 'google_link_failed' && event.reason === 'email_mismatch',
    ),
    true,
  );
});

test('platform auth google unlink requires step-up and revokes other sessions', async (t) => {
  const identity = createGoogleIdentity();
  const bootstrap = await createGoogleLinkedBootstrap(identity);
  const store = new MemoryPlatformAuthStore({
    ...bootstrap.state,
    sessions: [],
  }, () => NOW);
  const securityEvents: PlatformAuthSecurityEvent[] = [];
  const server = createTestServer(store, {
    CATS_AUTH_GOOGLE_CLIENT_ID: 'browser-client-id',
  }, undefined, { securityEvents });
  await listen(server);
  t.after(() => server.close());

  // A second browser signs in, then the first one unlinks.
  const otherLogin = await request(server, '/api/auth/login', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: { identifier: 'owner@example.test', password: 'correct-password' },
  });
  const otherCookie = (otherLogin.setCookie ?? '').split(';')[0]!;

  const stepUp = await signInAndStepUp(server, 'unlink_google');
  const unlinked = await request(server, '/api/auth/google/unlink', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    cookie: stepUp.cookie,
    csrfToken: stepUp.csrfToken,
    headers: { 'x-cats-auth-action': stepUp.actionToken },
  });

  assert.equal(unlinked.status, 200);
  assert.deepEqual(unlinked.payload?.loginMethods, {
    localPassword: { linked: true },
    google: { linked: false, email: null },
  });

  const state = await store.readState();
  assert.equal(state.identities.some((record) => record.provider === 'google'), false);
  assert.equal(state.identities.some((record) => record.provider === 'local_password'), true);

  // The step-up session survives; the other browser is signed out.
  const current = await request(server, '/api/auth/status', { cookie: stepUp.cookie });
  assert.equal(current.payload?.authenticated, true);
  const other = await request(server, '/api/auth/status', { cookie: otherCookie });
  assert.equal(other.payload?.authenticated, false);
  assert.equal(
    securityEvents.some((event) => event.kind === 'google_unlink_succeeded'),
    true,
  );
});

test('platform auth google unlink refuses without a local password fallback', async (t) => {
  const identity = createGoogleIdentity();
  const bootstrap = await createGoogleLinkedBootstrap(identity);
  const store = new MemoryPlatformAuthStore({
    ...bootstrap.state,
    sessions: [],
  }, () => NOW);
  const server = createTestServer(store, {
    CATS_AUTH_GOOGLE_CLIENT_ID: 'browser-client-id',
  });
  await listen(server);
  t.after(() => server.close());

  const stepUp = await signInAndStepUp(server, 'unlink_google');
  // Drop the local identity after the step-up so the route's own fallback
  // check is what rejects the mutation.
  await store.updateState((state) => ({
    ...state,
    identities: state.identities.filter((record) => record.provider !== 'local_password'),
  }));

  const response = await request(server, '/api/auth/google/unlink', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    cookie: stepUp.cookie,
    csrfToken: stepUp.csrfToken,
    headers: { 'x-cats-auth-action': stepUp.actionToken },
  });

  assert.equal(response.status, 409);
  assert.equal(errorCode(response.payload), 'E_IDENTITY_CONFLICT');
  const state = await store.readState();
  assert.equal(state.identities.some((record) => record.provider === 'google'), true);
});

test('platform auth reauth verifies the current account password only', async (t) => {
  const store = await createSeededStore();
  const securityEvents: PlatformAuthSecurityEvent[] = [];
  const server = createTestServer(store, {}, undefined, { securityEvents });
  await listen(server);
  t.after(() => server.close());

  const login = await request(server, '/api/auth/login', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: { identifier: 'owner@example.test', password: 'correct-password' },
  });
  const cookie = (login.setCookie ?? '').split(';')[0]!;
  const csrfToken = String(login.payload?.csrfToken ?? '');

  const wrongPassword = await request(server, '/api/auth/reauth', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    cookie,
    csrfToken,
    body: { password: 'wrong-password', purpose: 'link_google' },
  });
  assert.equal(wrongPassword.status, 401);
  assert.equal(errorCode(wrongPassword.payload), 'E_UNAUTHENTICATED');

  const unsupportedPurpose = await request(server, '/api/auth/reauth', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    cookie,
    csrfToken,
    body: { password: 'correct-password', purpose: 'delete_workspace' },
  });
  assert.equal(unsupportedPurpose.status, 400);

  const granted = await request(server, '/api/auth/reauth', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    cookie,
    csrfToken,
    body: { password: 'correct-password', purpose: 'link_google' },
  });
  assert.equal(granted.status, 200);
  assert.equal(granted.payload?.purpose, 'link_google');
  assert.equal(typeof granted.payload?.actionToken, 'string');
  assert.equal(typeof granted.payload?.expiresAt, 'string');

  // The grant never reaches the auth-state file.
  const serializedState = JSON.stringify(await store.readState());
  assert.equal(serializedState.includes(String(granted.payload?.actionToken)), false);
  assert.equal(serializedState.includes('correct-password'), false);

  // Reported events carry codes, never credential material.
  const serializedEvents = JSON.stringify(securityEvents);
  assert.equal(serializedEvents.includes('correct-password'), false);
  assert.equal(serializedEvents.includes(String(granted.payload?.actionToken)), false);
  assert.equal(
    securityEvents.some((event) => event.kind === 'step_up_failed'),
    true,
  );
  assert.equal(
    securityEvents.some((event) => event.kind === 'step_up_succeeded'),
    true,
  );
});

test('platform auth reauth requires an authenticated session and Cats csrf', async (t) => {
  const store = await createSeededStore();
  const server = createTestServer(store);
  await listen(server);
  t.after(() => server.close());

  const anonymous = await request(server, '/api/auth/reauth', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: { password: 'correct-password', purpose: 'link_google' },
  });
  assert.equal(anonymous.status, 401);
  assert.equal(errorCode(anonymous.payload), 'E_UNAUTHENTICATED');

  const login = await request(server, '/api/auth/login', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: { identifier: 'owner@example.test', password: 'correct-password' },
  });
  const missingCsrf = await request(server, '/api/auth/reauth', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    cookie: (login.setCookie ?? '').split(';')[0]!,
    body: { password: 'correct-password', purpose: 'link_google' },
  });
  assert.equal(missingCsrf.status, 403);
  assert.equal(errorCode(missingCsrf.payload), 'E_CSRF_MISMATCH');
});

test('platform auth status exposes login methods only when authenticated', async (t) => {
  const store = await createSeededStore();
  const server = createTestServer(store);
  await listen(server);
  t.after(() => server.close());

  const anonymous = await request(server, '/api/auth/status');
  assert.equal(anonymous.payload?.authenticated, false);
  assert.equal(anonymous.payload?.loginMethods, null);

  const login = await request(server, '/api/auth/login', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: { identifier: 'owner@example.test', password: 'correct-password' },
  });
  const status = await request(server, '/api/auth/status', {
    cookie: (login.setCookie ?? '').split(';')[0]!,
  });
  assert.deepEqual(status.payload?.loginMethods, {
    localPassword: { linked: true },
    google: { linked: false, email: null },
  });
});

test('platform auth google setup route no longer exists', async (t) => {
  const store = new MemoryPlatformAuthStore(createEmptyPlatformAuthState(NOW), () => NOW);
  const server = createTestServer(store, {
    CATS_AUTH_GOOGLE_CLIENT_ID: 'browser-client-id',
  }, fakeGoogleVerifier({
    sub: 'google-first-admin-subject',
    aud: 'browser-client-id',
    iss: 'https://accounts.google.com',
    exp: Math.floor(NOW.getTime() / 1000) + 600,
    email: 'owner@example.test',
    email_verified: true,
  }));
  await listen(server);
  t.after(() => server.close());

  const response = await request(server, '/api/auth/google/setup', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    cookie: 'g_csrf_token=csrf-token',
    body: { credential: 'id-token', csrfToken: 'csrf-token' },
  });

  assert.equal(response.status, 404);
  const state = await store.readState();
  assert.equal(state.accounts.length, 0);
});

test('platform auth google link requires Cats csrf and GIS csrf independently', async (t) => {
  const store = await createSeededStore();
  const server = createTestServer(store, {
    CATS_AUTH_GOOGLE_CLIENT_ID: 'browser-client-id',
  }, fakeGoogleVerifier({
    sub: 'google-linked-subject',
    aud: 'browser-client-id',
    iss: 'https://accounts.google.com',
    exp: Math.floor(NOW.getTime() / 1000) + 600,
    email: 'owner@example.test',
    email_verified: true,
  }));
  await listen(server);
  t.after(() => server.close());

  const login = await request(server, '/api/auth/login', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: { identifier: 'owner@example.test', password: 'correct-password' },
  });
  const sessionCookie = (login.setCookie ?? '').split(';')[0]!;

  // Cats CSRF is checked before the action grant, so this fails on CSRF.
  const missingCatsCsrf = await request(server, '/api/auth/google/link', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    cookie: `${sessionCookie}; g_csrf_token=google-csrf-token`,
    body: { credential: 'id-token', csrfToken: 'google-csrf-token' },
  });
  assert.equal(missingCatsCsrf.status, 403);
  assert.equal(errorCode(missingCatsCsrf.payload), 'E_CSRF_MISMATCH');

  // With a fresh grant in hand, the GIS double-submit token is still required.
  const stepUp = await signInAndStepUp(server, 'link_google');
  const missingGoogleCsrf = await request(server, '/api/auth/google/link', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    cookie: stepUp.cookie,
    csrfToken: stepUp.csrfToken,
    headers: { 'x-cats-auth-action': stepUp.actionToken },
    body: { credential: 'id-token', csrfToken: null },
  });
  assert.equal(missingGoogleCsrf.status, 403);
  assert.equal(errorCode(missingGoogleCsrf.payload), 'E_FORBIDDEN');
});

test('platform auth repair first-admin rejects loopback without recovery token', async (t) => {
  const store = createRepairAuthStore({ status: 'missing' });
  const server = createTestServer(store, {}, undefined, {
    readSetupCompleteAt: async () => NOW.toISOString(),
  });
  await listen(server);
  t.after(() => server.close());

  const response = await request(server, '/api/auth/repair/first-admin', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: {
      displayName: 'Owner',
      identifier: 'owner@example.test',
      password: 'correct-password',
    },
  });

  assert.equal(response.status, 403);
  assert.equal(errorCode(response.payload), 'E_FORBIDDEN');
  await assert.rejects(() => store.readState());
});

test('platform auth repair first-admin rejects when repair is not active', async (t) => {
  const store = await createSeededStore();
  const server = createTestServer(store, {}, undefined, {
    readSetupCompleteAt: async () => NOW.toISOString(),
  });
  await listen(server);
  t.after(() => server.close());

  const response = await request(server, '/api/auth/repair/first-admin', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: {
      displayName: 'Owner',
      identifier: 'owner@example.test',
      password: 'correct-password',
    },
  });

  assert.equal(response.status, 409);
  assert.equal(errorCode(response.payload), 'E_FORBIDDEN');
});

test('platform auth repair first-admin consumes recovery token off loopback', async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'cats-auth-route-repair-'));
  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });
  const issued = await issuePlatformAuthRecoveryToken({
    sessionSecret: SESSION_SECRET,
    recoveryTokenPath: path.join(tempDir, 'auth-recovery-token.local.txt'),
    now: NOW,
  });
  let recoveryTokenState: PlatformAuthRecoveryTokenState | null = issued.state;
  const store = createRepairAuthStore({ status: 'missing' });
  const server = createTestServer(store, {}, undefined, {
    readSetupCompleteAt: async () => NOW.toISOString(),
    remoteAddress: '192.168.1.20',
    authRecoveryTokenState: () => recoveryTokenState,
    setAuthRecoveryTokenState: (state) => {
      recoveryTokenState = state;
    },
  });
  await listen(server);
  t.after(() => server.close());

  const missingToken = await request(server, '/api/auth/repair/first-admin', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: {
      displayName: 'Owner',
      identifier: 'owner@example.test',
      password: 'correct-password',
    },
  });
  assert.equal(missingToken.status, 403);
  assert.equal(errorCode(missingToken.payload), 'E_FORBIDDEN');

  const repaired = await request(server, '/api/auth/repair/first-admin', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: {
      displayName: 'Owner',
      identifier: 'owner@example.test',
      password: 'correct-password',
      recoveryToken: issued.token,
    },
  });
  assert.equal(repaired.status, 200);
  assert.equal(repaired.payload?.authenticated, true);
  assert.equal(recoveryTokenState?.consumedAt, NOW.toISOString());
});

async function createGoogleLinkedBootstrap(
  identity: ReturnType<typeof createGoogleIdentity>,
): Promise<{ state: PlatformAuthState; account: PlatformAccountRecord }> {
  const local = await createFirstAdminLocalAuthState({
    state: createEmptyPlatformAuthState(NOW),
    displayName: 'Owner',
    identifier: identity.email,
    password: 'correct-password',
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 60_000,
    now: NOW,
  });
  const linked = linkGoogleIdentityToAccount({
    state: local.state,
    accountId: local.account.id,
    identity,
    now: NOW,
  });
  if (!linked.ok) {
    throw new Error(`expected google link to succeed: ${linked.reason}`);
  }
  return { state: linked.result.state, account: linked.result.account };
}

/**
 * Signs in, performs the local-password step-up, and returns everything a
 * sensitive-action request needs.
 */
async function signInAndStepUp(
  server: ReturnType<typeof createServer>,
  purpose: 'link_google' | 'unlink_google',
  password = 'correct-password',
): Promise<{ cookie: string; csrfToken: string; actionToken: string }> {
  const login = await request(server, '/api/auth/login', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    body: { identifier: 'owner@example.test', password },
  });
  const cookie = (login.setCookie ?? '').split(';')[0]!;
  const csrfToken = String(login.payload?.csrfToken ?? '');
  const reauth = await request(server, '/api/auth/reauth', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    cookie,
    csrfToken,
    body: { password, purpose },
  });
  if (reauth.status !== 200) {
    throw new Error(`step-up failed with ${reauth.status}`);
  }
  return { cookie, csrfToken, actionToken: String(reauth.payload?.actionToken ?? '') };
}

async function createSeededStore(): Promise<MemoryPlatformAuthStore> {
  const bootstrap = await createFirstAdminLocalAuthState({
    state: createEmptyPlatformAuthState(NOW),
    displayName: 'Owner',
    identifier: 'owner@example.test',
    password: 'correct-password',
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 60_000,
    now: NOW,
  });
  return new MemoryPlatformAuthStore({
    ...bootstrap.state,
    sessions: [],
  }, () => NOW);
}

async function createSeededLockedStore(
  env: NodeJS.ProcessEnv,
): Promise<{
  store: MemoryPlatformAuthStore;
  cookie: string;
  csrfToken: string;
}> {
  const bootstrap = await createFirstAdminLocalAuthState({
    state: createEmptyPlatformAuthState(NOW),
    displayName: 'Owner',
    identifier: 'owner@example.test',
    password: 'correct-password',
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 60_000,
    now: NOW,
  });
  const policy = loadConfig({
    HOME: 'C:/Users/tester',
    CATS_AUTH_SESSION_SECRET: SESSION_SECRET,
    ...env,
  }).auth;
  const firstFailed = recordFailedLogin(bootstrap.state, {
    subject: createLoginThrottleSubject({
      provider: 'local_password',
      accountKey: 'owner@example.test',
      remoteAddress: '10.0.1.1',
    }),
    policy,
    now: NOW,
  });
  const locked = recordFailedLogin(firstFailed, {
    subject: createLoginThrottleSubject({
      provider: 'local_password',
      accountKey: 'owner@example.test',
      remoteAddress: '10.0.2.2',
    }),
    policy,
    now: NOW,
  });
  assert.ok(locked.loginFailures.length > 0);
  assert.ok(locked.loginCooldowns.length > 0);
  return {
    store: new MemoryPlatformAuthStore(locked, () => NOW),
    cookie: `${AUTH_SESSION_COOKIE_NAME}=${bootstrap.session.token}`,
    csrfToken: bootstrap.session.csrfToken,
  };
}

function createTestServer(
  store: PlatformAuthStore,
  env: NodeJS.ProcessEnv = {},
  googleVerifier?: PlatformGoogleIdTokenVerifier,
  options: {
    readSetupCompleteAt?: () => Promise<string | null>;
    remoteAddress?: string;
    authRecoveryTokenState?: () => PlatformAuthRecoveryTokenState | null;
    setAuthRecoveryTokenState?: (state: PlatformAuthRecoveryTokenState | null) => void;
    loginThrottleAlerts?: PlatformLoginThrottleAlert[];
    actionGrantStore?: PlatformAuthActionGrantStore;
    securityEvents?: PlatformAuthSecurityEvent[];
  } = {},
) {
  const config = loadConfig({
    HOME: 'C:/Users/tester',
    CATS_AUTH_SESSION_SECRET: SESSION_SECRET,
    ...env,
  });
  // One store for the server's lifetime: action grants must survive from the
  // reauth request to the link/unlink request that spends them.
  const actionGrantStore = options.actionGrantStore
    ?? new MemoryPlatformAuthActionGrantStore();
  return createServer(async (request, response) => {
    if (options.remoteAddress) {
      Object.defineProperty(request.socket, 'remoteAddress', {
        configurable: true,
        value: options.remoteAddress,
      });
    }
    const url = new URL(request.url ?? '/', 'http://localhost');
    const handled = await routePlatformAuthApi({
      request,
      response,
      url,
      method: request.method ?? 'GET',
      dependencies: {
        authStore: store,
        auth: config.auth,
        googleVerifier,
        actionGrantStore,
        reportAuthSecurityEvent: options.securityEvents
          ? (event) => {
              options.securityEvents?.push(event);
            }
          : undefined,
        readSetupCompleteAt: options.readSetupCompleteAt,
        authRecoveryTokenState: options.authRecoveryTokenState?.() ?? null,
        setAuthRecoveryTokenState: options.setAuthRecoveryTokenState,
        reportLoginThrottleAlert: options.loginThrottleAlerts
          ? (alert) => {
              options.loginThrottleAlerts?.push(alert);
            }
          : undefined,
        now: () => NOW,
        sleep: async () => {},
      },
    });
    if (!handled) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not found' }));
    }
  });
}

function createRepairAuthStore(
  initialStatus: PlatformAuthStateReadStatus,
): PlatformAuthStore {
  let status: PlatformAuthStateReadStatus = initialStatus;
  return {
    async readStateStatus() {
      return status;
    },
    async readState() {
      if (status.status === 'ready') {
        return structuredClone(status.state);
      }
      if (status.status === 'corrupt') {
        throw status.error;
      }
      throw new Error('Auth state is missing.');
    },
    async writeState(state: PlatformAuthState) {
      status = { status: 'ready', state: structuredClone(state) };
      return structuredClone(state);
    },
    async updateState(mutator) {
      const current = status.status === 'ready'
        ? structuredClone(status.state)
        : createEmptyPlatformAuthState(NOW);
      const next = await mutator(current);
      status = { status: 'ready', state: structuredClone(next) };
      return structuredClone(next);
    },
  };
}

async function listen(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
}

async function request(
  server: ReturnType<typeof createServer>,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    origin?: string;
    secFetchSite?: string;
    cookie?: string;
    csrfToken?: unknown;
    headers?: Record<string, string>;
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
  const headers: Record<string, string> = { ...options.headers };
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
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
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

function errorCode(payload: Record<string, any> | null): string | undefined {
  return payload?.error?.code;
}

async function googleLoginRequest(server: ReturnType<typeof createServer>) {
  return request(server, '/api/auth/google/login', {
    method: 'POST',
    origin: 'http://localhost:5173',
    secFetchSite: 'same-origin',
    cookie: 'g_csrf_token=csrf-token',
    body: { credential: 'id-token', csrfToken: 'csrf-token' },
  });
}

function createGoogleIdentity() {
  return {
    providerSubject: 'google-subject-1',
    email: 'owner@example.test',
    hostedDomain: null,
    displayName: 'Owner',
    avatarUrl: null,
    audience: 'browser-client-id',
    issuer: 'https://accounts.google.com',
    expiresAt: '2026-05-10T01:00:00.000Z',
  };
}

function fakeGoogleVerifier(
  claims: Partial<PlatformGoogleIdTokenClaims>,
): PlatformGoogleIdTokenVerifier {
  return {
    async verifyIdToken() {
      return claims;
    },
  };
}
