import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { routeRequest } from '../src/app/server/requestRouter.ts';
import type { ResolvedServerDependencies } from '../src/app/server/contracts.ts';
import { loadConfig } from '../src/config.ts';
import { createDefaultCoreState } from '../src/core/model/index.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import {
  AUTH_SESSION_COOKIE_NAME,
  createEmptyPlatformAuthState,
  createFirstAdminLocalAuthState,
  issueBrowserSession,
  issueMobileDeviceSession,
  MemoryPlatformBrowserHandoffStore,
  MemoryPlatformAuthStore,
  revokeSession,
  type PlatformAuthState,
  type PlatformAuthStateReadStatus,
  type PlatformAuthStore,
} from '../src/platform/auth/index.ts';

const NOW = new Date('2026-05-10T00:00:00.000Z');
const SESSION_SECRET = 'test-session-secret-at-least-sixteen-chars';

test('request router returns minimal app-shell envelope for unauthenticated login bootstrap', async (t) => {
  const server = createTestServer({ setupCompleteAt: NOW.toISOString() });
  await listen(server);
  t.after(() => server.close());

  const response = await fetch(serverUrl(server, '/api/app-shell'));
  const payload = await response.json() as Record<string, any>;

  assert.equal(response.status, 200);
  assert.equal(payload.routeTarget, 'login');
  assert.equal(payload.setup.required, false);
  assert.equal(payload.auth.authenticated, false);
  assert.equal('products' in payload, false);
  assert.equal('chat' in payload, false);
});

test('request router rejects protected product APIs before dispatch without credentials', async (t) => {
  const server = createTestServer({ setupCompleteAt: NOW.toISOString() });
  await listen(server);
  t.after(() => server.close());

  const response = await fetch(serverUrl(server, '/api/channels'));
  const payload = await response.json() as Record<string, any>;

  assert.equal(response.status, 401);
  assert.deepEqual(payload, {
    error: {
      code: 'E_UNAUTHENTICATED',
      message: 'Authentication is required.',
    },
  });
});

test('request router rejects unauthenticated mobile product data before dispatch', async (t) => {
  const fixture = await createSeededAuthFixture();
  const server = createTestServer({
    setupCompleteAt: NOW.toISOString(),
    authStore: fixture.authStore,
  });
  await listen(server);
  t.after(() => server.close());

  const response = await fetch(serverUrl(server, '/api/mobile/work/items'));
  const payload = await response.json() as Record<string, any>;

  assert.equal(response.status, 401);
  assert.deepEqual(payload, {
    error: {
      code: 'E_UNAUTHENTICATED',
      message: 'Authentication is required.',
    },
  });
});

test('request router accepts mobile bearer sessions for protected data without csrf', async (t) => {
  const fixture = await createSeededAuthFixture();
  const server = createTestServer({
    setupCompleteAt: NOW.toISOString(),
    authStore: fixture.authStore,
  });
  await listen(server);
  t.after(() => server.close());

  const coreResponse = await fetch(serverUrl(server, '/api/core'), {
    headers: { authorization: `Bearer ${fixture.mobileToken}` },
  });
  const corePayload = await coreResponse.json() as Record<string, any>;
  assert.equal(coreResponse.status, 200);
  assert.equal(corePayload.setupCompleteAt, NOW.toISOString());

  const browserStatus = await fetch(serverUrl(server, '/api/auth/status'), {
    headers: { cookie: `cats_session=${encodeURIComponent(fixture.browserToken)}` },
  });
  const mobileStatus = await fetch(serverUrl(server, '/api/mobile/auth/status'), {
    headers: { authorization: `Bearer ${fixture.mobileToken}` },
  });
  const browserPayload = await browserStatus.json() as Record<string, any>;
  const mobilePayload = await mobileStatus.json() as Record<string, any>;

  assert.equal(browserStatus.status, 200);
  assert.equal(mobileStatus.status, 200);
  assert.deepEqual(
    Object.keys(mobilePayload.principal).sort(),
    Object.keys(browserPayload.principal).sort(),
  );
  assert.equal(mobilePayload.principal.accountId, browserPayload.principal.accountId);
  assert.equal(mobilePayload.principal.coreActorId, browserPayload.principal.coreActorId);
  assert.deepEqual(mobilePayload.principal.roles, browserPayload.principal.roles);
});

test('request router does not let invalid bearer bypass browser csrf', async (t) => {
  const fixture = await createSeededAuthFixture();
  const server = createTestServer({
    setupCompleteAt: NOW.toISOString(),
    authStore: fixture.authStore,
  });
  await listen(server);
  t.after(() => server.close());

  const response = await fetch(serverUrl(server, '/api/core/actors'), {
    method: 'POST',
    headers: {
      authorization: 'Bearer invalid-token',
      cookie: `cats_session=${encodeURIComponent(fixture.browserToken)}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      actor: {
        name: 'Should not be written',
        kind: 'cat',
        status: 'active',
        roles: [],
        source: 'manual',
      },
    }),
  });
  const payload = await response.json() as Record<string, any>;

  assert.equal(response.status, 403);
  assert.deepEqual(payload, {
    error: {
      code: 'E_CSRF_MISMATCH',
      message: 'CSRF token is missing or invalid.',
    },
  });
});

test('request router exchanges a one-time desktop handoff for a browser session', async (t) => {
  const fixture = await createSeededAuthFixture();
  const server = createTestServer({
    setupCompleteAt: NOW.toISOString(),
    authStore: fixture.authStore,
  });
  await listen(server);
  t.after(() => server.close());

  const created = await fetch(serverUrl(server, '/api/auth/browser-handoff'), {
    method: 'POST',
    headers: {
      cookie: `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(fixture.browserToken)}`,
      'content-type': 'application/json',
      'x-cats-csrf-token': fixture.browserCsrfToken,
    },
    body: JSON.stringify({ returnTo: '/runtime/setup' }),
  });
  const createdPayload = await created.json() as Record<string, unknown>;

  assert.equal(created.status, 200);
  assert.equal(createdPayload.launchMode, 'handoff');
  assert.match(String(createdPayload.launchPath), /^\/api\/auth\/browser-handoff\/exchange#token=/u);
  assert.equal(created.headers.get('cache-control'), 'no-store');

  const exchangePath = String(createdPayload.launchPath);
  const sessionsBeforeLanding = (await fixture.authStore.readState()).sessions.length;
  const landing = await fetch(serverUrl(server, readHandoffLaunch(exchangePath).pathname));
  assert.equal(landing.status, 200);
  assert.match(landing.headers.get('content-security-policy') ?? '', /default-src 'none'/u);
  assert.match(await landing.text(), /method: 'POST'/u);
  const prefetchedAgain = await fetch(serverUrl(server, readHandoffLaunch(exchangePath).pathname));
  assert.equal(prefetchedAgain.status, 200);
  assert.equal((await fixture.authStore.readState()).sessions.length, sessionsBeforeLanding);

  const exchanged = await exchangeBrowserHandoff(server, exchangePath);
  const exchangedPayload = await exchanged.json() as { returnTo?: unknown };
  const setCookie = exchanged.headers.get('set-cookie') ?? '';

  assert.equal(exchanged.status, 200);
  assert.equal(exchangedPayload.returnTo, '/runtime/setup');
  assert.equal(exchanged.headers.get('cache-control'), 'no-store');
  assert.equal(exchanged.headers.get('referrer-policy'), 'no-referrer');
  assert.match(setCookie, new RegExp(`^${AUTH_SESSION_COOKIE_NAME}=`, 'u'));

  const browserCookie = setCookie.split(';', 1)[0] ?? '';
  const protectedResponse = await fetch(serverUrl(server, '/api/core'), {
    headers: { cookie: browserCookie },
  });
  assert.equal(protectedResponse.status, 200);

  const sessionsBeforeReuse = (await fixture.authStore.readState()).sessions.length;
  const secondHandoff = await fetch(serverUrl(server, '/api/auth/browser-handoff'), {
    method: 'POST',
    headers: {
      cookie: `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(fixture.browserToken)}`,
      'content-type': 'application/json',
      'x-cats-csrf-token': fixture.browserCsrfToken,
    },
    body: JSON.stringify({ returnTo: '/runtime/setup' }),
  });
  const secondPayload = await secondHandoff.json() as { launchPath: string };
  const reused = await exchangeBrowserHandoff(server, secondPayload.launchPath, browserCookie);
  assert.equal(reused.status, 200);
  assert.equal(reused.headers.get('set-cookie'), null);
  assert.equal((await fixture.authStore.readState()).sessions.length, sessionsBeforeReuse);

  const replay = await exchangeBrowserHandoff(server, exchangePath);
  assert.equal(replay.status, 401);
});

test('request router gives pre-setup Desktop links a direct, query-free runtime path', async (t) => {
  const server = createTestServer({ setupCompleteAt: null });
  await listen(server);
  t.after(() => server.close());

  const response = await fetch(serverUrl(server, '/api/auth/browser-handoff'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ returnTo: '/runtime/setup?provider=codex' }),
  });
  const payload = await response.json() as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    launchMode: 'direct',
    launchPath: '/runtime/setup',
    expiresAt: null,
  });
});

test('request router opens Runtime directly when auth is explicitly disabled', async (t) => {
  const server = createTestServer({
    setupCompleteAt: null,
    env: { CATS_AUTH_ENABLED: 'false' },
  });
  await listen(server);
  t.after(() => server.close());

  const response = await fetch(serverUrl(server, '/api/auth/browser-handoff'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ returnTo: '/runtime/setup' }),
  });
  const payload = await response.json() as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(payload.launchMode, 'direct');
  assert.equal(payload.launchPath, '/runtime/setup');
});

test('request router does not silently mint a handoff for a logged-out post-setup browser', async (t) => {
  const server = createTestServer({ setupCompleteAt: NOW.toISOString() });
  await listen(server);
  t.after(() => server.close());

  const response = await fetch(serverUrl(server, '/api/auth/browser-handoff'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ returnTo: '/runtime/setup' }),
  });

  assert.equal(response.status, 401);
});

test('request router keeps handoff minting behind browser csrf and rejects open redirects', async (t) => {
  const fixture = await createSeededAuthFixture();
  const server = createTestServer({
    setupCompleteAt: NOW.toISOString(),
    authStore: fixture.authStore,
  });
  await listen(server);
  t.after(() => server.close());

  const headers = {
    cookie: `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(fixture.browserToken)}`,
    'content-type': 'application/json',
  };
  const withoutCsrf = await fetch(serverUrl(server, '/api/auth/browser-handoff'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ returnTo: '/runtime/setup' }),
  });
  assert.equal(withoutCsrf.status, 403);

  const openRedirect = await fetch(serverUrl(server, '/api/auth/browser-handoff'), {
    method: 'POST',
    headers: {
      ...headers,
      'x-cats-csrf-token': fixture.browserCsrfToken,
    },
    body: JSON.stringify({ returnTo: 'https://evil.example/runtime/setup' }),
  });
  assert.equal(openRedirect.status, 400);
});

test('request router rejects a handoff after its Desktop source session is revoked', async (t) => {
  const fixture = await createSeededAuthFixture();
  const server = createTestServer({
    setupCompleteAt: NOW.toISOString(),
    authStore: fixture.authStore,
  });
  await listen(server);
  t.after(() => server.close());

  const created = await fetch(serverUrl(server, '/api/auth/browser-handoff'), {
    method: 'POST',
    headers: {
      cookie: `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(fixture.browserToken)}`,
      'content-type': 'application/json',
      'x-cats-csrf-token': fixture.browserCsrfToken,
    },
    body: JSON.stringify({ returnTo: '/runtime/setup' }),
  });
  const payload = await created.json() as { launchPath: string };
  await fixture.authStore.updateState((state) => ({
    ...state,
    sessions: state.sessions.map((session) => (
      session.kind === 'browser' ? revokeSession(session, NOW) : session
    )),
  }));

  const exchanged = await exchangeBrowserHandoff(server, payload.launchPath);
  assert.equal(exchanged.status, 401);
});

test('Desktop logout revokes browser sessions issued from its handoffs', async (t) => {
  const fixture = await createSeededAuthFixture();
  const server = createTestServer({
    setupCompleteAt: NOW.toISOString(),
    authStore: fixture.authStore,
  });
  await listen(server);
  t.after(() => server.close());

  const created = await createBrowserHandoff(server, fixture, '/runtime/setup');
  const exchanged = await exchangeBrowserHandoff(server, created.launchPath);
  const childCookie = (exchanged.headers.get('set-cookie') ?? '').split(';', 1)[0] ?? '';
  const stateAfterExchange = await fixture.authStore.readState();
  const sourceSession = stateAfterExchange.sessions.find((session) => (
    session.id === fixture.browserSessionId
  ));
  const childSession = stateAfterExchange.sessions.find((session) => (
    session.sourceSessionId === sourceSession?.id
  ));
  assert.ok(sourceSession);
  assert.ok(childSession);
  assert.equal(childSession.revokedAt, null);

  const logout = await fetch(serverUrl(server, '/api/auth/logout'), {
    method: 'POST',
    headers: {
      cookie: `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(fixture.browserToken)}`,
      'x-cats-csrf-token': fixture.browserCsrfToken,
    },
  });
  assert.equal(logout.status, 200);

  const stateAfterLogout = await fixture.authStore.readState();
  assert.notEqual(
    stateAfterLogout.sessions.find((session) => session.id === sourceSession.id)?.revokedAt,
    null,
  );
  assert.notEqual(
    stateAfterLogout.sessions.find((session) => session.id === childSession.id)?.revokedAt,
    null,
  );
  const protectedResponse = await fetch(serverUrl(server, '/api/core'), {
    headers: { cookie: childCookie },
  });
  assert.equal(protectedResponse.status, 401);
});

test('handoff revokes a different account session already presented by the browser', async (t) => {
  const fixture = await createSeededAuthFixture();
  const otherAccountId = 'account-other';
  const otherSession = issueBrowserSession({
    accountId: otherAccountId,
    sessionSecret: SESSION_SECRET,
    ttlMs: 60_000,
    now: NOW,
  });
  await fixture.authStore.updateState((state) => ({
    ...state,
    accounts: [...state.accounts, {
      id: otherAccountId,
      displayName: 'Other',
      email: 'other@example.test',
      avatarUrl: null,
      status: 'active',
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    }],
    memberships: [...state.memberships, {
      id: 'membership-other',
      accountId: otherAccountId,
      roles: ['member'],
      coreActorId: null,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    }],
    sessions: [...state.sessions, otherSession.session],
  }));
  const server = createTestServer({
    setupCompleteAt: NOW.toISOString(),
    authStore: fixture.authStore,
  });
  await listen(server);
  t.after(() => server.close());

  const created = await createBrowserHandoff(server, fixture, '/runtime/setup');
  const exchanged = await exchangeBrowserHandoff(
    server,
    created.launchPath,
    `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(otherSession.token)}`,
  );
  assert.equal(exchanged.status, 200);

  const state = await fixture.authStore.readState();
  assert.notEqual(
    state.sessions.find((session) => session.id === otherSession.session.id)?.revokedAt,
    null,
  );
  assert.ok(state.sessions.some((session) => (
    session.sourceSessionId === fixture.browserSessionId
    && session.accountId !== otherAccountId
  )));
});

test('request router returns repair bootstrap envelope when auth state is corrupt', async (t) => {
  const server = createTestServer({
    setupCompleteAt: NOW.toISOString(),
    authStore: createStatusOnlyAuthStore({
      status: 'corrupt',
      error: new Error('bad auth state'),
    }),
  });
  await listen(server);
  t.after(() => server.close());

  const response = await fetch(serverUrl(server, '/api/app-shell'));
  const payload = await response.json() as Record<string, any>;

  assert.equal(response.status, 200);
  assert.equal(payload.routeTarget, 'repair');
  assert.equal(payload.setup.repairRequired, true);
  assert.equal(payload.auth.authenticated, false);
});

test('request router rejects unsafe disabled auth after setup', async (t) => {
  const server = createTestServer({
    setupCompleteAt: NOW.toISOString(),
    env: { CATS_AUTH_ENABLED: 'false' },
  });
  await listen(server);
  t.after(() => server.close());

  const response = await fetch(serverUrl(server, '/api/channels'));
  const payload = await response.json() as Record<string, any>;

  assert.equal(response.status, 503);
  assert.equal(payload.error.code, 'E_FORBIDDEN');
  assert.match(payload.error.message, /not allowed after setup/u);
});

interface TestServerInput {
  setupCompleteAt: string | null;
  authStore?: PlatformAuthStore;
  env?: NodeJS.ProcessEnv;
}

function createTestServer(input: TestServerInput) {
  const dependencies = createDependencies(input);
  return createServer((request, response) => {
    void routeRequest(request, response, dependencies).catch((error) => {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        error: error instanceof Error ? error.message : 'unknown',
      }));
    });
  });
}

function createDependencies(
  input: TestServerInput,
): ResolvedServerDependencies {
  const core = createDefaultCoreState();
  core.setupCompleteAt = input.setupCompleteAt;
  const config = loadConfig({
    HOME: 'C:/Users/tester',
    CATS_AUTH_SESSION_SECRET: SESSION_SECRET,
    ...input.env,
  });
  return {
    shared: {
      config,
      coreStore: new MemoryCoreStore(core),
      authStore: input.authStore
        ?? new MemoryPlatformAuthStore(createEmptyPlatformAuthState(NOW), () => NOW),
      browserHandoffStore: new MemoryPlatformBrowserHandoffStore(),
      now: () => NOW,
    },
    chat: {},
    work: {},
    code: {},
  } as unknown as ResolvedServerDependencies;
}

async function createSeededAuthFixture(): Promise<{
  authStore: MemoryPlatformAuthStore;
  browserSessionId: string;
  browserToken: string;
  browserCsrfToken: string;
  mobileToken: string;
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
  const mobile = issueMobileDeviceSession({
    accountId: bootstrap.account.id,
    sessionSecret: SESSION_SECRET,
    ttlMs: 60_000,
    now: NOW,
    deviceLabel: 'Owner iPhone',
    devicePlatform: 'ios',
  });
  return {
    authStore: new MemoryPlatformAuthStore({
      ...bootstrap.state,
      sessions: [bootstrap.session.session, mobile.session],
    }, () => NOW),
    browserSessionId: bootstrap.session.session.id,
    browserToken: bootstrap.session.token,
    browserCsrfToken: bootstrap.session.csrfToken,
    mobileToken: mobile.token,
  };
}

function createStatusOnlyAuthStore(
  status: PlatformAuthStateReadStatus,
): PlatformAuthStore {
  return {
    async readStateStatus() {
      return status;
    },
    async readState() {
      throw new Error('Auth state is unavailable.');
    },
    async writeState(state: PlatformAuthState) {
      return structuredClone(state);
    },
    async updateState(mutator) {
      return mutator(createEmptyPlatformAuthState(NOW));
    },
  };
}

async function createBrowserHandoff(
  server: ReturnType<typeof createServer>,
  fixture: Pick<Awaited<ReturnType<typeof createSeededAuthFixture>>,
    'browserToken' | 'browserCsrfToken'>,
  returnTo: string,
): Promise<{ launchPath: string }> {
  const response = await fetch(serverUrl(server, '/api/auth/browser-handoff'), {
    method: 'POST',
    headers: {
      cookie: `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(fixture.browserToken)}`,
      'content-type': 'application/json',
      'x-cats-csrf-token': fixture.browserCsrfToken,
    },
    body: JSON.stringify({ returnTo }),
  });
  assert.equal(response.status, 200);
  return await response.json() as { launchPath: string };
}

function readHandoffLaunch(launchPath: string): { pathname: string; token: string } {
  const url = new URL(launchPath, 'http://cats.local');
  const tokenValues = new URLSearchParams(url.hash.slice(1)).getAll('token');
  assert.equal(tokenValues.length, 1);
  assert.ok(tokenValues[0]);
  return { pathname: url.pathname, token: tokenValues[0] };
}

async function exchangeBrowserHandoff(
  server: ReturnType<typeof createServer>,
  launchPath: string,
  cookie?: string,
): Promise<Response> {
  const launch = readHandoffLaunch(launchPath);
  return await fetch(serverUrl(server, launch.pathname), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ token: launch.token }),
  });
}

async function listen(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
}

function serverUrl(server: ReturnType<typeof createServer>, pathname: string): string {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Server is not listening.');
  }
  return `http://127.0.0.1:${address.port}${pathname}`;
}
