import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';

import { loadConfig } from '../src/config.ts';
import { createServer as createAppServer } from '../src/app/server/index.ts';
import { routeMobileAuthApi } from '../src/app/server/mobileAuthRoutes.ts';
import {
  createEmptyPlatformAuthState,
  createFirstAdminLocalAuthState,
  MemoryPlatformAuthStore,
  type PlatformGoogleIdTokenClaims,
  type PlatformGoogleIdTokenVerifier,
} from '../src/platform/auth/index.ts';
import { MemoryChatStore } from '../src/products/chat/state/store.ts';

const NOW = new Date('2026-05-10T00:00:00.000Z');
const SESSION_SECRET = 'test-session-secret-at-least-sixteen-chars';

test('mobile auth status is public and unauthenticated without bearer token', async (t) => {
  const store = await createSeededStore();
  const server = createTestServer(store);
  await listen(server);
  t.after(() => server.close());

  const response = await request(server, '/api/mobile/auth/status');
  assert.equal(response.status, 200);
  assert.deepEqual(response.payload, {
    authenticated: false,
    principal: null,
  });
});

test('mobile auth local login issues bearer session without browser cookie', async (t) => {
  const store = await createSeededStore();
  const server = createTestServer(store);
  await listen(server);
  t.after(() => server.close());

  const login = await request(server, '/api/mobile/auth/login', {
    method: 'POST',
    body: {
      identifier: 'OWNER@example.test',
      password: 'correct-password',
      deviceLabel: 'Owner iPhone',
      devicePlatform: 'ios',
      appVersion: '1.2.3',
    },
  });
  assert.equal(login.status, 200);
  assert.equal(login.payload?.authenticated, true);
  assert.equal(typeof login.payload?.token, 'string');
  assert.equal((login.payload?.principal as { coreActorId?: string }).coreActorId, 'actor-owner');
  assert.equal(login.setCookie, null);

  const state = await store.readState();
  assert.equal(state.sessions.length, 1);
  assert.equal(state.sessions[0]?.kind, 'mobile_device');
  assert.equal(state.sessions[0]?.deviceLabel, 'Owner iPhone');
  assert.equal(state.sessions[0]?.devicePlatform, 'ios');
  assert.equal(state.sessions[0]?.appVersion, '1.2.3');
  assert.equal(state.sessions[0]?.csrfTokenHash, undefined);
});

test('mobile auth bearer status resolves issued device session', async (t) => {
  const store = await createSeededStore();
  const server = createTestServer(store);
  await listen(server);
  t.after(() => server.close());

  const login = await request(server, '/api/mobile/auth/login', {
    method: 'POST',
    body: { identifier: 'owner@example.test', password: 'correct-password' },
  });
  const token = login.payload?.token;
  assert.equal(typeof token, 'string');

  const status = await request(server, '/api/mobile/auth/status', {
    authorization: `Bearer ${token}`,
  });
  assert.equal(status.status, 200);
  assert.equal(status.payload?.authenticated, true);
  assert.equal(status.payload?.principal?.accountId, login.payload?.principal?.accountId);
  assert.equal(status.payload?.token, undefined);
});

test('mobile auth logout revokes bearer session without csrf', async (t) => {
  const store = await createSeededStore();
  const server = createTestServer(store);
  await listen(server);
  t.after(() => server.close());

  const login = await request(server, '/api/mobile/auth/login', {
    method: 'POST',
    body: { identifier: 'owner@example.test', password: 'correct-password' },
  });
  const token = login.payload?.token;
  assert.equal(typeof token, 'string');

  const logout = await request(server, '/api/mobile/auth/logout', {
    method: 'POST',
    authorization: `Bearer ${token}`,
  });
  assert.equal(logout.status, 200);
  assert.deepEqual(logout.payload, {
    authenticated: false,
    principal: null,
  });

  const status = await request(server, '/api/mobile/auth/status', {
    authorization: `Bearer ${token}`,
  });
  assert.equal(status.status, 200);
  assert.equal(status.payload?.authenticated, false);
});

test('mobile auth local login shares composite failed-login lockout', async (t) => {
  const store = await createSeededStore();
  const server = createTestServer(store, {
    CATS_AUTH_LOGIN_FAILURE_LIMIT: '2',
    CATS_AUTH_LOGIN_LOCKOUT_MS: '30000',
  });
  await listen(server);
  t.after(() => server.close());

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const failed = await request(server, '/api/mobile/auth/login', {
      method: 'POST',
      body: { identifier: 'owner@example.test', password: 'wrong-password' },
    });
    assert.equal(failed.status, 401);
    assert.equal(failed.payload?.error?.code, 'E_UNAUTHENTICATED');
  }

  const blocked = await request(server, '/api/mobile/auth/login', {
    method: 'POST',
    body: { identifier: 'owner@example.test', password: 'correct-password' },
  });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.payload?.error?.code, 'E_FORBIDDEN');
  assert.match(blocked.payload?.error?.message ?? '', /too many/i);
});

test('mobile auth google login issues bearer session for linked mobile audience', async (t) => {
  const store = await createSeededStore();
  await linkGoogleIdentity(store, 'mobile-google-subject');
  const server = createTestServer(
    store,
    { CATS_AUTH_GOOGLE_MOBILE_AUDIENCES: 'mobile-client-id' },
    fakeGoogleVerifier({
      sub: 'mobile-google-subject',
      aud: 'mobile-client-id',
      iss: 'https://accounts.google.com',
      exp: Math.floor(NOW.getTime() / 1000) + 600,
      email: 'owner-google@example.test',
      email_verified: true,
      picture: 'https://example.test/avatar.png',
    }),
  );
  await listen(server);
  t.after(() => server.close());

  const login = await request(server, '/api/mobile/auth/google/login', {
    method: 'POST',
    body: {
      idToken: 'mobile-google-id-token',
      deviceLabel: 'Owner Android',
      devicePlatform: 'android',
      appVersion: '2.0.0',
    },
  });

  assert.equal(login.status, 200);
  assert.equal(login.payload?.authenticated, true);
  assert.equal(typeof login.payload?.token, 'string');
  assert.equal(login.setCookie, null);
  assert.equal(login.payload?.principal?.email, 'owner-google@example.test');

  const token = login.payload?.token;
  assert.equal(typeof token, 'string');
  const status = await request(server, '/api/mobile/auth/status', {
    authorization: `Bearer ${token}`,
  });
  assert.equal(status.status, 200);
  assert.equal(status.payload?.authenticated, true);

  const state = await store.readState();
  assert.equal(state.sessions.length, 1);
  assert.equal(state.sessions[0]?.kind, 'mobile_device');
  assert.equal(state.sessions[0]?.deviceLabel, 'Owner Android');
  assert.equal(state.sessions[0]?.devicePlatform, 'android');
  assert.equal(state.sessions[0]?.appVersion, '2.0.0');
  assert.equal(state.accounts[0]?.email, 'owner-google@example.test');
});

test('mobile auth google login rejects browser-only audiences', async (t) => {
  const store = await createSeededStore();
  await linkGoogleIdentity(store, 'mobile-google-subject');
  const server = createTestServer(
    store,
    { CATS_AUTH_GOOGLE_MOBILE_AUDIENCES: 'mobile-client-id' },
    fakeGoogleVerifier({
      sub: 'mobile-google-subject',
      aud: 'browser-client-id',
      iss: 'https://accounts.google.com',
      exp: Math.floor(NOW.getTime() / 1000) + 600,
      email: 'owner@example.test',
      email_verified: true,
    }),
  );
  await listen(server);
  t.after(() => server.close());

  const login = await request(server, '/api/mobile/auth/google/login', {
    method: 'POST',
    body: { idToken: 'browser-google-id-token' },
  });

  assert.equal(login.status, 401);
  assert.equal(login.payload?.error?.code, 'E_UNAUTHENTICATED');
  const state = await store.readState();
  assert.equal(state.sessions.length, 0);
});

test('mobile auth google login requires mobile audiences and verifier', async (t) => {
  const store = await createSeededStore();
  const server = createTestServer(store);
  await listen(server);
  t.after(() => server.close());

  const login = await request(server, '/api/mobile/auth/google/login', {
    method: 'POST',
    body: { idToken: 'mobile-google-id-token' },
  });

  assert.equal(login.status, 503);
  assert.equal(login.payload?.error?.code, 'E_FORBIDDEN');
});

test('request router serves mobile auth before mobile manifest pairing gate', async (t) => {
  const fixture = await createAppFixture(t, {
    CATS_DESKTOP_MOBILE_PAIRING_ENABLED: 'false',
  });

  const response = await request(fixture.server, '/api/mobile/auth/status');
  assert.equal(response.status, 200);
  assert.equal(response.payload?.authenticated, false);
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

async function linkGoogleIdentity(
  store: MemoryPlatformAuthStore,
  providerSubject: string,
): Promise<void> {
  await store.updateState((state) => ({
    ...state,
    identities: [
      ...state.identities,
      {
        id: 'auth-identity-google',
        accountId: state.accounts[0]!.id,
        provider: 'google',
        providerSubject,
        email: 'owner@example.test',
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ],
  }));
}

function createTestServer(
  store: MemoryPlatformAuthStore,
  env: NodeJS.ProcessEnv = {},
  googleVerifier?: PlatformGoogleIdTokenVerifier,
) {
  const config = loadConfig({
    HOME: 'C:/Users/tester',
    CATS_AUTH_SESSION_SECRET: SESSION_SECRET,
    ...env,
  });
  return createHttpServer(async (incoming, response) => {
    const url = new URL(incoming.url ?? '/', 'http://localhost');
    const handled = await routeMobileAuthApi({
      request: incoming,
      response,
      url,
      method: incoming.method ?? 'GET',
      dependencies: {
        authStore: store,
        auth: config.auth,
        googleVerifier,
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

async function createAppFixture(
  t: TestContext,
  env: NodeJS.ProcessEnv = {},
): Promise<{
  server: ReturnType<typeof createAppServer>;
}> {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'cats-mobile-auth-'));
  const config = loadConfig({
    HOME: tempDir,
    CATS_PLATFORM_DIR: path.join(tempDir, 'platform'),
    CATS_AUTH_SESSION_SECRET: SESSION_SECRET,
    ...env,
  });
  const server = createAppServer({
    shared: {
      config,
      runtimeClient: createRuntimeStub() as never,
      authStore: await createSeededStore(),
      now: () => NOW,
    },
    chat: {
      chatStore: new MemoryChatStore(),
    },
  });
  await listen(server);
  t.after(async () => {
    server.close();
    await rm(tempDir, { recursive: true, force: true });
  });
  return { server };
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

function fakeGoogleVerifier(
  claims: Partial<PlatformGoogleIdTokenClaims>,
): PlatformGoogleIdTokenVerifier {
  return {
    async verifyIdToken() {
      return claims;
    },
  };
}

async function listen(server: ReturnType<typeof createHttpServer>): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
}

async function request(
  server: ReturnType<typeof createHttpServer>,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    authorization?: string;
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
  if (options.authorization) {
    headers.authorization = options.authorization;
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
