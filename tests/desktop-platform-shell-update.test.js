import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyDesktopHostPlatformShellUpdate,
  parseDesktopHostPlatformShellUpdate,
} from '../build/desktop/platformShellUpdate.js';

test('desktop host platform shell update promotes setup completion and clears startup provider reprobe state', () => {
  const nextState = applyDesktopHostPlatformShellUpdate({
    appShell: {
      bootstrapAttemptId: null,
      setupCompleteAt: null,
      products: [],
    },
    persistedSetup: {
      setupCompleteAt: null,
      productSetupCompleted: false,
    },
    providerDiagnostics: {
      summary: {
        status: 'degraded',
        summary: 'No provider targets are configured yet.',
        configuredProviders: 0,
        targets: 0,
        defaultTargets: 0,
        ok: 0,
        degraded: 0,
        unavailable: 0,
      },
      providers: [],
    },
  }, {
    bootstrapAttemptId: 'attempt-123',
    setupCompleteAt: '2026-04-06T08:00:00.000Z',
    products: [
      {
        id: 'chat',
        productName: 'Cats Chat',
        routePrefix: '/chat',
        installState: 'installed',
        setup: { selectable: true },
      },
    ],
  });

  assert.equal(nextState.appShell?.bootstrapAttemptId, 'attempt-123');
  assert.equal(nextState.appShell?.setupCompleteAt, '2026-04-06T08:00:00.000Z');
  assert.equal(nextState.persistedSetup.productSetupCompleted, true);
  assert.equal(nextState.providerDiagnostics, null);
  assert.deepEqual(nextState.appShell?.products?.map((product) => product.id), ['chat']);
});

test('desktop host platform shell update clears persisted setup completion when reset returns setupCompleteAt=null', () => {
  const nextState = applyDesktopHostPlatformShellUpdate({
    appShell: {
      bootstrapAttemptId: 'attempt-123',
      setupCompleteAt: '2026-04-06T08:00:00.000Z',
      products: [],
    },
    persistedSetup: {
      setupCompleteAt: '2026-04-06T08:00:00.000Z',
      productSetupCompleted: true,
    },
    providerDiagnostics: null,
  }, {
    bootstrapAttemptId: 'attempt-456',
    setupCompleteAt: null,
    products: [
      {
        id: 'chat',
        productName: 'Cats Chat',
        routePrefix: '/chat',
        installState: 'installed',
        setup: { selectable: true },
      },
    ],
  });

  assert.equal(nextState.appShell?.bootstrapAttemptId, 'attempt-456');
  assert.equal(nextState.appShell?.setupCompleteAt, null);
  assert.equal(nextState.persistedSetup.setupCompleteAt, null);
  assert.equal(nextState.persistedSetup.productSetupCompleted, false);
});

test('desktop host platform shell update parser normalizes invalid payloads', () => {
  assert.throws(() => parseDesktopHostPlatformShellUpdate(null), /invalid desktop platform shell payload/i);

  const parsed = parseDesktopHostPlatformShellUpdate({
    bootstrapAttemptId: ' attempt-456 ',
    setupCompleteAt: ' 2026-04-06T09:00:00.000Z ',
    products: [
      {
        id: 'work',
        productName: 'Cats Work',
        routePrefix: '/work',
        installState: 'installed',
        setup: {
          selectable: true,
          disabledReason: ' ',
        },
      },
      'ignored',
    ],
  });

  assert.equal(parsed.bootstrapAttemptId, 'attempt-456');
  assert.equal(parsed.setupCompleteAt, '2026-04-06T09:00:00.000Z');
  assert.deepEqual(parsed.products, [
    {
      id: 'work',
      productName: 'Cats Work',
      routePrefix: '/work',
      installState: 'installed',
      setup: {
        selectable: true,
        disabledReason: undefined,
      },
    },
  ]);
});
