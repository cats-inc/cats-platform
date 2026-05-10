import assert from 'node:assert/strict';
import test from 'node:test';

import { loadConfig } from '../src/config.ts';
import { buildPlatformAuthBootstrapEnvelope } from '../src/platform/auth/index.ts';

const NOW = new Date('2026-05-10T00:00:00.000Z');

test('platform auth bootstrap envelope exposes only setup and provider routing state', () => {
  const config = loadConfig({
    HOME: 'C:/Users/tester',
    CATS_AUTH_GOOGLE_CLIENT_ID: 'google-client-id',
  });
  const envelope = buildPlatformAuthBootstrapEnvelope({
    auth: config.auth,
    host: config.host,
    port: config.port,
    setupCompleteAt: null,
    authStateStatus: 'missing',
    now: NOW,
  });

  assert.equal(envelope.routeTarget, 'setup');
  assert.equal(envelope.setup.required, true);
  assert.equal(envelope.setup.repairRequired, false);
  assert.deepEqual(envelope.auth, {
    authenticated: false,
    csrfToken: null,
    providers: {
      google: {
        enabled: true,
        clientId: 'google-client-id',
      },
    },
  });
  assert.equal('chat' in envelope, false);
  assert.equal('lobby' in envelope, false);
  assert.equal('runtime' in envelope, false);
  assert.equal('products' in envelope, false);
  assert.equal('installedApps' in envelope, false);
});

test('platform auth bootstrap envelope routes setup-complete workspaces to login or repair', () => {
  const config = loadConfig({
    HOME: 'C:/Users/tester',
  });
  const ready = buildPlatformAuthBootstrapEnvelope({
    auth: config.auth,
    host: config.host,
    port: config.port,
    setupCompleteAt: NOW.toISOString(),
    authStateStatus: 'ready',
    now: NOW,
  });
  assert.equal(ready.routeTarget, 'login');
  assert.equal(ready.setup.required, false);
  assert.equal(ready.setup.repairRequired, false);

  const corrupt = buildPlatformAuthBootstrapEnvelope({
    auth: config.auth,
    host: config.host,
    port: config.port,
    setupCompleteAt: NOW.toISOString(),
    authStateStatus: 'corrupt',
    now: NOW,
  });
  assert.equal(corrupt.routeTarget, 'repair');
  assert.equal(corrupt.setup.required, false);
  assert.equal(corrupt.setup.repairRequired, true);
});
