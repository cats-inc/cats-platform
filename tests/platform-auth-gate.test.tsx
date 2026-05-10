import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import test from 'node:test';

import {
  evaluatePlatformAuthGate,
  sendPlatformAuthGateRejection,
} from '../src/app/server/authGate.ts';
import { loadConfig } from '../src/config.ts';
import {
  createEmptyPlatformAuthState,
  createFirstAdminLocalAuthState,
  issueMobileDeviceSession,
  MemoryPlatformAuthStore,
} from '../src/platform/auth/index.ts';

const NOW = new Date('2026-05-10T00:00:00.000Z');
const SESSION_SECRET = 'test-session-secret-at-least-sixteen-chars';

test('platform auth gate allows public routes without resolving a principal', async () => {
  const fixture = await createFixture();
  const decision = await evaluatePlatformAuthGate({
    ...fixture.input,
    request: requestWithHeaders({}),
    method: 'GET',
    pathname: '/api/auth/status',
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.principal, null);
  assert.equal(decision.credentialKind, null);
});

test('platform auth gate rejects protected routes without credentials', async () => {
  const fixture = await createFixture();
  const decision = await evaluatePlatformAuthGate({
    ...fixture.input,
    request: requestWithHeaders({}),
    method: 'GET',
    pathname: '/api/channels',
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.statusCode, 401);
  assert.equal(decision.code, 'E_UNAUTHENTICATED');
});

test('platform auth gate allows browser cookie reads and validates csrf on mutations', async () => {
  const fixture = await createFixture();
  const cookie = `cats_session=${encodeURIComponent(fixture.browserToken)}`;
  const read = await evaluatePlatformAuthGate({
    ...fixture.input,
    request: requestWithHeaders({ cookie }),
    method: 'GET',
    pathname: '/api/channels',
  });
  assert.equal(read.allowed, true);
  assert.equal(read.credentialKind, 'browser_cookie');
  assert.equal(read.principal?.membership.coreActorId, 'actor-owner');

  const missingCsrf = await evaluatePlatformAuthGate({
    ...fixture.input,
    request: requestWithHeaders({ cookie }),
    method: 'POST',
    pathname: '/api/channels',
  });
  assert.equal(missingCsrf.allowed, false);
  assert.equal(missingCsrf.statusCode, 403);
  assert.equal(missingCsrf.code, 'E_CSRF_MISMATCH');

  const withCsrf = await evaluatePlatformAuthGate({
    ...fixture.input,
    request: requestWithHeaders({
      cookie,
      'x-cats-csrf-token': fixture.browserCsrfToken,
    }),
    method: 'POST',
    pathname: '/api/channels',
  });
  assert.equal(withCsrf.allowed, true);
  assert.equal(withCsrf.credentialKind, 'browser_cookie');
});

test('platform auth gate allows mobile bearer mutations without browser csrf', async () => {
  const fixture = await createFixture();
  const decision = await evaluatePlatformAuthGate({
    ...fixture.input,
    request: requestWithHeaders({ authorization: `Bearer ${fixture.mobileToken}` }),
    method: 'POST',
    pathname: '/api/mobile/work/items',
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.credentialKind, 'mobile_bearer');
  assert.equal(decision.principal?.session.kind, 'mobile_device');
});

test('platform auth gate does not let invalid bearer bypass browser csrf', async () => {
  const fixture = await createFixture();
  const cookie = `cats_session=${encodeURIComponent(fixture.browserToken)}`;
  const decision = await evaluatePlatformAuthGate({
    ...fixture.input,
    request: requestWithHeaders({
      authorization: 'Bearer invalid-token',
      cookie,
    }),
    method: 'POST',
    pathname: '/api/channels',
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.statusCode, 403);
  assert.equal(decision.code, 'E_CSRF_MISMATCH');
});

test('platform auth gate rejection sender emits pinned structured error body', async (t) => {
  const server = createServer((_request, response) => {
    sendPlatformAuthGateRejection(response, {
      allowed: false,
      policy: {
        access: 'protected',
        reason: 'protected_api',
        minimalEnvelope: false,
      },
      statusCode: 401,
      code: 'E_UNAUTHENTICATED',
      message: 'Authentication is required.',
    });
  });
  await listen(server);
  t.after(() => server.close());

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Server is not listening.');
  }
  const response = await fetch(`http://127.0.0.1:${address.port}/api/channels`);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: {
      code: 'E_UNAUTHENTICATED',
      message: 'Authentication is required.',
    },
  });
});

async function createFixture(): Promise<{
  input: Omit<Parameters<typeof evaluatePlatformAuthGate>[0], 'request' | 'method' | 'pathname'>;
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
  const store = new MemoryPlatformAuthStore({
    ...bootstrap.state,
    sessions: [bootstrap.session.session, mobile.session],
  }, () => NOW);
  const config = loadConfig({
    HOME: 'C:/Users/tester',
    CATS_AUTH_SESSION_SECRET: SESSION_SECRET,
  });
  return {
    input: {
      phase: 'post_setup',
      authStore: store,
      auth: config.auth,
      now: () => NOW,
    },
    browserToken: bootstrap.session.token,
    browserCsrfToken: bootstrap.session.csrfToken,
    mobileToken: mobile.token,
  };
}

function requestWithHeaders(headers: Record<string, string>): IncomingMessage {
  return { headers } as IncomingMessage;
}

async function listen(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
}
