import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MemoryPlatformBrowserHandoffStore,
  MAX_PENDING_BROWSER_HANDOFFS,
  PlatformBrowserHandoffCapacityError,
  normalizePlatformBrowserHandoffReturnTo,
} from '../src/platform/auth/browserHandoff.ts';

const SESSION_SECRET = 'test-session-secret-at-least-sixteen-chars';
const NOW = new Date('2026-08-05T00:00:00.000Z');

test('browser handoff store consumes a token exactly once', () => {
  const store = new MemoryPlatformBrowserHandoffStore();
  const issued = store.issue({
    accountId: 'account-owner',
    sourceSessionId: 'auth-session-desktop',
    returnTo: '/runtime/setup?provider=codex',
    sessionSecret: SESSION_SECRET,
    ttlMs: 30_000,
    now: NOW,
  });

  assert.equal(store.consume({
    token: issued.token,
    sessionSecret: SESSION_SECRET,
    now: new Date(NOW.getTime() + 1_000),
  })?.returnTo, '/runtime/setup');
  assert.equal(store.consume({
    token: issued.token,
    sessionSecret: SESSION_SECRET,
    now: new Date(NOW.getTime() + 2_000),
  }), null);
});

test('browser handoff store rejects expired tokens', () => {
  const store = new MemoryPlatformBrowserHandoffStore();
  const issued = store.issue({
    accountId: 'account-owner',
    sourceSessionId: 'auth-session-desktop',
    returnTo: '/runtime/setup',
    sessionSecret: SESSION_SECRET,
    ttlMs: 1_000,
    now: NOW,
  });

  assert.equal(store.consume({
    token: issued.token,
    sessionSecret: SESSION_SECRET,
    now: new Date(NOW.getTime() + 1_000),
  }), null);
});

test('browser handoff return paths are limited to runtime surfaces', () => {
  assert.equal(
    normalizePlatformBrowserHandoffReturnTo('/runtime/dashboard?tab=health'),
    '/runtime/dashboard',
  );
  assert.throws(
    () => normalizePlatformBrowserHandoffReturnTo('https://evil.example/runtime/setup'),
    /root-relative/u,
  );
  assert.throws(
    () => normalizePlatformBrowserHandoffReturnTo('/api/core'),
    /not allowed/u,
  );
  assert.throws(
    () => normalizePlatformBrowserHandoffReturnTo('/runtime/setup#secret'),
    /invalid/u,
  );
});

test('browser handoff store rejects new tokens instead of evicting active handoffs', () => {
  const store = new MemoryPlatformBrowserHandoffStore();
  for (let index = 0; index < MAX_PENDING_BROWSER_HANDOFFS; index += 1) {
    store.issue({
      accountId: 'account-owner',
      sourceSessionId: `auth-session-${index}`,
      returnTo: '/runtime/setup',
      sessionSecret: SESSION_SECRET,
      now: NOW,
    });
  }

  assert.throws(() => store.issue({
    accountId: 'account-owner',
    sourceSessionId: 'auth-session-over-capacity',
    returnTo: '/runtime/setup',
    sessionSecret: SESSION_SECRET,
    now: NOW,
  }), PlatformBrowserHandoffCapacityError);
});
