import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isLoopbackAuthHost,
  resolveEffectivePlatformAuthGateMode,
} from '../src/platform/auth/index.ts';

test('effective auth mode enables auth for default and explicit true modes', () => {
  assert.deepEqual(resolveEffectivePlatformAuthGateMode({
    configuredMode: 'default',
    host: '0.0.0.0',
    setupCompleteAt: null,
  }), { status: 'enabled' });
  assert.deepEqual(resolveEffectivePlatformAuthGateMode({
    configuredMode: 'enabled',
    host: '127.0.0.1',
    setupCompleteAt: '2026-05-10T00:00:00.000Z',
  }), { status: 'enabled' });
});

test('effective auth mode allows unsafe disabled only on loopback before setup', () => {
  assert.deepEqual(resolveEffectivePlatformAuthGateMode({
    configuredMode: 'unsafe_disabled',
    host: 'localhost',
    setupCompleteAt: null,
  }), { status: 'unsafe_disabled' });
  assert.deepEqual(resolveEffectivePlatformAuthGateMode({
    configuredMode: 'unsafe_disabled',
    host: '[::1]',
    setupCompleteAt: null,
  }), { status: 'unsafe_disabled' });

  const afterSetup = resolveEffectivePlatformAuthGateMode({
    configuredMode: 'unsafe_disabled',
    host: '127.0.0.1',
    setupCompleteAt: '2026-05-10T00:00:00.000Z',
  });
  assert.equal(afterSetup.status, 'configuration_error');

  const lan = resolveEffectivePlatformAuthGateMode({
    configuredMode: 'unsafe_disabled',
    host: '0.0.0.0',
    setupCompleteAt: null,
  });
  assert.equal(lan.status, 'configuration_error');
});

test('loopback auth host detection accepts canonical local hosts only', () => {
  assert.equal(isLoopbackAuthHost('localhost'), true);
  assert.equal(isLoopbackAuthHost('127.0.0.1'), true);
  assert.equal(isLoopbackAuthHost('::1'), true);
  assert.equal(isLoopbackAuthHost('192.168.1.10'), false);
  assert.equal(isLoopbackAuthHost('0.0.0.0'), false);
});
