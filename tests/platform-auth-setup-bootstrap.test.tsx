import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';

import { loadConfig } from '../src/config.ts';
import { createServer } from '../src/app/server/index.ts';
import {
  AUTH_SESSION_COOKIE_NAME,
  hashSessionToken,
  MemoryPlatformAuthStore,
} from '../src/platform/auth/index.ts';
import { MemoryChatStore } from '../src/products/chat/state/store.ts';

const NOW = new Date('2026-05-10T00:00:00.000Z');
const SESSION_SECRET = 'test-session-secret-at-least-sixteen-chars';

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
});

async function createSetupFixture(
  t: TestContext,
  options: { sessionSecret?: string | null } = {},
): Promise<{
  server: ReturnType<typeof createServer>;
  authStore: MemoryPlatformAuthStore;
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
  });
  const authStore = new MemoryPlatformAuthStore(undefined, () => NOW);
  const chatStore = new MemoryChatStore();
  const server = createServer({
    shared: {
      config,
      runtimeClient: createRuntimeStub() as never,
      authStore,
      now: () => NOW,
    },
    chat: {
      chatStore,
    },
  });
  await listen(server);
  t.after(async () => {
    server.close();
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
