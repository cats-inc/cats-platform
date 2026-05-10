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
  assert.equal(response.payload?.error?.code, 'bad_request');
  assert.equal((await fixture.authStore.readState()).accounts.length, 0);
  assert.equal((await fixture.chatStore.readCore()).setupCompleteAt, null);
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

async function createSetupFixture(t: TestContext): Promise<{
  server: ReturnType<typeof createServer>;
  authStore: MemoryPlatformAuthStore;
  chatStore: MemoryChatStore;
}> {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'cats-auth-setup-'));
  const config = loadConfig({
    HOME: tempDir,
    CATS_PLATFORM_DIR: path.join(tempDir, 'platform'),
    CATS_AUTH_SESSION_SECRET: SESSION_SECRET,
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
