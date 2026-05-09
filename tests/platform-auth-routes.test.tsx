import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { loadConfig } from '../src/config.ts';
import { routePlatformAuthApi } from '../src/app/server/authRoutes.ts';
import {
  createEmptyPlatformAuthState,
  createFirstAdminLocalAuthState,
  MemoryPlatformAuthStore,
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
  });
  assert.equal(logout.status, 200);
  assert.equal(logout.payload?.authenticated, false);
  assert.match(logout.setCookie ?? '', /Max-Age=0/u);

  const status = await request(server, '/api/auth/status', { cookie });
  assert.equal(status.payload?.authenticated, false);
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
  store: MemoryPlatformAuthStore,
  env: NodeJS.ProcessEnv = {},
) {
  const config = loadConfig({
    HOME: 'C:/Users/tester',
    CATS_AUTH_SESSION_SECRET: SESSION_SECRET,
    ...env,
  });
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const handled = await routePlatformAuthApi({
      request,
      response,
      url,
      method: request.method ?? 'GET',
      dependencies: {
        authStore: store,
        auth: config.auth,
        now: () => NOW,
      },
    });
    if (!handled) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not found' }));
    }
  });
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
