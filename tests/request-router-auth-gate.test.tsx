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
