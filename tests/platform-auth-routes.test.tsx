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
  createFirstAdminGoogleAuthState,
  issuePlatformAuthRecoveryToken,
  MemoryPlatformAuthStore,
  type PlatformAuthRecoveryTokenState,
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

test('platform auth google login issues cookie for linked account', async (t) => {
  const googleIdentity = createGoogleIdentity();
  const bootstrap = createFirstAdminGoogleAuthState({
    state: createEmptyPlatformAuthState(NOW),
    identity: googleIdentity,
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 60_000,
    now: NOW,
  });
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

test('platform auth google login enforces composite failed-login lockout', async (t) => {
  const googleIdentity = createGoogleIdentity();
  const bootstrap = createFirstAdminGoogleAuthState({
    state: createEmptyPlatformAuthState(NOW),
    identity: googleIdentity,
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 60_000,
    now: NOW,
  });
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

test('platform auth repair first-admin recreates missing auth state from loopback', async (t) => {
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

  assert.equal(response.status, 200);
  assert.equal(response.payload?.authenticated, true);
  assert.equal(response.payload?.principal?.coreActorId, 'actor-owner');
  assert.equal(typeof response.payload?.csrfToken, 'string');
  assert.match(response.setCookie ?? '', /cats_session=/u);
  const state = await store.readState();
  assert.equal(state.accounts.length, 1);
  assert.equal(state.identities[0]?.provider, 'local_password');
  assert.equal(state.sessions.length, 1);
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

function createTestServer(
  store: PlatformAuthStore,
  env: NodeJS.ProcessEnv = {},
  googleVerifier?: PlatformGoogleIdTokenVerifier,
  options: {
    readSetupCompleteAt?: () => Promise<string | null>;
    remoteAddress?: string;
    authRecoveryTokenState?: () => PlatformAuthRecoveryTokenState | null;
    setAuthRecoveryTokenState?: (state: PlatformAuthRecoveryTokenState | null) => void;
  } = {},
) {
  const config = loadConfig({
    HOME: 'C:/Users/tester',
    CATS_AUTH_SESSION_SECRET: SESSION_SECRET,
    ...env,
  });
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
        readSetupCompleteAt: options.readSetupCompleteAt,
        authRecoveryTokenState: options.authRecoveryTokenState?.() ?? null,
        setAuthRecoveryTokenState: options.setAuthRecoveryTokenState,
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
