import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { routeRequest } from '../src/app/server/requestRouter.ts';
import type { ResolvedServerDependencies } from '../src/app/server/contracts.ts';
import { loadConfig } from '../src/config.ts';
import { createDefaultCoreState } from '../src/core/model/index.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import {
  createEmptyPlatformAuthState,
  createFirstAdminLocalAuthState,
  issueMobileDeviceSession,
  MemoryPlatformAuthStore,
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
      now: () => NOW,
    },
    chat: {},
    work: {},
    code: {},
  } as unknown as ResolvedServerDependencies;
}

async function createSeededAuthFixture(): Promise<{
  authStore: MemoryPlatformAuthStore;
  browserToken: string;
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
    browserToken: bootstrap.session.token,
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
