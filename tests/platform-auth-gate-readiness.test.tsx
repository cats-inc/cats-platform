import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import test from 'node:test';

import { evaluatePlatformAuthGate } from '../src/app/server/authGate.ts';
import { loadConfig } from '../src/config.ts';
import {
  AUTH_SESSION_COOKIE_NAME,
  createEmptyPlatformAuthState,
  createFirstAdminLocalAuthState,
  MemoryPlatformAuthStore,
  resolvePlatformAuthReadiness,
} from '../src/platform/auth/index.ts';

const NOW = new Date('2026-05-10T00:00:00.000Z');
const SESSION_SECRET = 'test-session-secret-at-least-sixteen-chars';

test('auth gate readiness keeps app-shell public before setup and protects product APIs', async () => {
  const readiness = resolvePlatformAuthReadiness({
    setupCompleteAt: null,
    authStateStatus: { status: 'missing' },
  });
  const fixture = createFixture();
  const appShell = await evaluatePlatformAuthGate({
    ...fixture,
    phase: readiness.phase,
    request: requestWithHeaders({}),
    method: 'GET',
    pathname: '/api/app-shell',
  });
  const productApi = await evaluatePlatformAuthGate({
    ...fixture,
    phase: readiness.phase,
    request: requestWithHeaders({}),
    method: 'GET',
    pathname: '/api/channels',
  });

  assert.equal(appShell.allowed, true);
  assert.equal(appShell.policy.minimalEnvelope, true);
  assert.equal(productApi.allowed, false);
  assert.equal(productApi.code, 'E_UNAUTHENTICATED');
});

test('auth gate readiness fails protected APIs closed during repair', async () => {
  const readiness = resolvePlatformAuthReadiness({
    setupCompleteAt: NOW.toISOString(),
    authStateStatus: { status: 'corrupt', error: new Error('bad auth state') },
  });
  const decision = await evaluatePlatformAuthGate({
    ...createFixture(),
    phase: readiness.phase,
    request: requestWithHeaders({}),
    method: 'GET',
    pathname: '/api/channels',
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.policy.reason, 'auth_repair_fail_closed');
  assert.equal(decision.code, 'E_UNAUTHENTICATED');

  const publicStatus = await evaluatePlatformAuthGate({
    ...createFixture(),
    phase: readiness.phase,
    request: requestWithHeaders({}),
    method: 'GET',
    pathname: '/api/auth/status',
  });
  assert.equal(publicStatus.allowed, true);
});

test('auth gate readiness rejects setup-complete product APIs without credentials', async () => {
  const readiness = resolvePlatformAuthReadiness({
    setupCompleteAt: NOW.toISOString(),
    authStateStatus: { status: 'ready', state: createEmptyPlatformAuthState(NOW) },
  });
  const decision = await evaluatePlatformAuthGate({
    ...createFixture(),
    phase: readiness.phase,
    request: requestWithHeaders({}),
    method: 'GET',
    pathname: '/api/channels',
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.policy.reason, 'protected_api');
  assert.equal(decision.code, 'E_UNAUTHENTICATED');
});

test('auth gate readiness allows authenticated admin after setup', async () => {
  const bootstrap = await createFirstAdminLocalAuthState({
    state: createEmptyPlatformAuthState(NOW),
    displayName: 'Owner',
    identifier: 'owner@example.test',
    password: 'correct-password',
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 60_000,
    now: NOW,
  });
  const readiness = resolvePlatformAuthReadiness({
    setupCompleteAt: NOW.toISOString(),
    authStateStatus: { status: 'ready', state: bootstrap.state },
  });
  const decision = await evaluatePlatformAuthGate({
    ...createFixture(new MemoryPlatformAuthStore(bootstrap.state, () => NOW)),
    phase: readiness.phase,
    request: requestWithHeaders({
      cookie: `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(bootstrap.session.token)}`,
    }),
    method: 'GET',
    pathname: '/api/channels',
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.credentialKind, 'browser_cookie');
  assert.equal(decision.principal?.membership.coreActorId, 'actor-owner');
});

test('auth gate readiness rejects setup-complete browser mutations without csrf', async () => {
  const bootstrap = await createFirstAdminLocalAuthState({
    state: createEmptyPlatformAuthState(NOW),
    displayName: 'Owner',
    identifier: 'owner@example.test',
    password: 'correct-password',
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 60_000,
    now: NOW,
  });
  const readiness = resolvePlatformAuthReadiness({
    setupCompleteAt: NOW.toISOString(),
    authStateStatus: { status: 'ready', state: bootstrap.state },
  });
  const decision = await evaluatePlatformAuthGate({
    ...createFixture(new MemoryPlatformAuthStore(bootstrap.state, () => NOW)),
    phase: readiness.phase,
    request: requestWithHeaders({
      cookie: `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(bootstrap.session.token)}`,
    }),
    method: 'POST',
    pathname: '/api/channels',
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.policy.reason, 'protected_api');
  assert.equal(decision.code, 'E_CSRF_MISMATCH');
});

function createFixture(authStore = new MemoryPlatformAuthStore(undefined, () => NOW)) {
  const config = loadConfig({
    HOME: 'C:/Users/tester',
    CATS_AUTH_SESSION_SECRET: SESSION_SECRET,
  });
  return {
    authStore,
    auth: config.auth,
    now: () => NOW,
  };
}

function requestWithHeaders(headers: Record<string, string>): IncomingMessage {
  return { headers } as IncomingMessage;
}
