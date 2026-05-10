import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEmptyPlatformAuthState,
  resolvePlatformAuthReadiness,
} from '../src/platform/auth/index.ts';

const NOW = new Date('2026-05-10T00:00:00.000Z');

test('auth readiness treats missing setup as pre-setup regardless of auth state status', () => {
  for (const authStateStatus of [
    { status: 'ready', state: createEmptyPlatformAuthState(NOW) },
    { status: 'missing' },
    { status: 'corrupt', error: new Error('bad json') },
  ] as const) {
    const readiness = resolvePlatformAuthReadiness({
      setupCompleteAt: null,
      authStateStatus,
    });
    assert.equal(readiness.phase, 'pre_setup');
    assert.equal(readiness.repairRequired, false);
    assert.equal(readiness.repairReason, null);
  }
});

test('auth readiness treats setup-complete ready auth state as post-setup', () => {
  const readiness = resolvePlatformAuthReadiness({
    setupCompleteAt: NOW.toISOString(),
    authStateStatus: { status: 'ready', state: createEmptyPlatformAuthState(NOW) },
  });

  assert.equal(readiness.phase, 'post_setup');
  assert.equal(readiness.authStateStatus, 'ready');
  assert.equal(readiness.repairRequired, false);
});

test('auth readiness enters repair when setup-complete auth state is missing', () => {
  const readiness = resolvePlatformAuthReadiness({
    setupCompleteAt: NOW.toISOString(),
    authStateStatus: { status: 'missing' },
  });

  assert.equal(readiness.phase, 'repair');
  assert.equal(readiness.authStateStatus, 'missing');
  assert.equal(readiness.repairRequired, true);
  assert.equal(readiness.repairReason, 'missing_auth_state_after_setup');
});

test('auth readiness enters repair with corrupt-state reason and message', () => {
  const readiness = resolvePlatformAuthReadiness({
    setupCompleteAt: NOW.toISOString(),
    authStateStatus: { status: 'corrupt', error: new Error('version 99 is unsupported') },
  });

  assert.equal(readiness.phase, 'repair');
  assert.equal(readiness.authStateStatus, 'corrupt');
  assert.equal(readiness.repairRequired, true);
  assert.equal(readiness.repairReason, 'corrupt_auth_state_after_setup');
  assert.equal(readiness.corruptErrorMessage, 'version 99 is unsupported');
});
