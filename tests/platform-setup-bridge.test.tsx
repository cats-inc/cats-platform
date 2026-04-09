import assert from 'node:assert/strict';
import test from 'node:test';

import {
  syncDesktopHostPlatformShell,
  syncDesktopHostPlatformShellState,
} from '../src/app/renderer/setup/desktopHostBridge.ts';

function createEnvelope() {
  return {
    app: {
      name: 'cats-platform',
      stage: 'phase-2-shell',
      runtimeBoundary: 'cats-runtime',
    },
    products: [
      {
        id: 'chat',
        surface: 'chat',
        routePrefix: '/chat',
        productName: 'Cats Chat',
        subtitle: 'Chat',
        group: 'home',
        installPolicy: 'required',
        installState: 'installed',
        maturity: 'active',
        setup: { selectable: true },
      },
    ],
    desktop: {
      startAtLogin: true,
      openWindowOnStartup: false,
    },
    lobby: {
      animationMode: 'reduced',
      cats: [],
    },
    runtime: {
      baseUrl: 'http://127.0.0.1:3110',
      reachable: true,
      status: 'ok',
      service: 'cats-runtime',
    },
    runtimeSetup: {
      source: 'runtime',
      bootstrapRequired: false,
      status: 'ready',
      stateStatus: 'ready',
      summary: 'Runtime ready',
      scannedAt: null,
      lastManualScanAt: null,
      appliedAt: null,
      providerCount: 1,
      availableCount: 1,
      providersReadyToApply: [],
      providersNeedingAttention: [],
      suggestedProviders: [],
      canRunManualScan: true,
      canApply: false,
      error: null,
    },
    metadata: {
      generatedAt: '2026-04-06T09:00:00.000Z',
      host: '127.0.0.1',
      port: 8181,
    },
    bootstrapAttemptId: 'attempt-789',
    setupCompleteAt: '2026-04-06T09:00:00.000Z',
    ownerDisplayName: 'Kenny',
    ownerAvatarColor: null,
    ownerAvatarUrl: null,
    lastProductSurface: 'chat',
    guideCat: null,
  } as const;
}

test('platform setup bridge is a no-op outside desktop host', async () => {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {},
  });

  try {
    await assert.doesNotReject(syncDesktopHostPlatformShell(createEnvelope()));
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: previousWindow,
    });
  }
});

test('platform setup bridge forwards committed shell state to desktop host', async () => {
  let received = null;
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      catsDesktopHost: {
        async updatePlatformShell(payload) {
          received = payload;
        },
      },
    },
  });

  try {
    await syncDesktopHostPlatformShell(createEnvelope());
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: previousWindow,
    });
  }

  assert.deepEqual(received, {
    bootstrapAttemptId: 'attempt-789',
    setupCompleteAt: '2026-04-06T09:00:00.000Z',
    products: [
      {
        id: 'chat',
        surface: 'chat',
        routePrefix: '/chat',
        productName: 'Cats Chat',
        subtitle: 'Chat',
        group: 'home',
        installPolicy: 'required',
        installState: 'installed',
        maturity: 'active',
        setup: { selectable: true },
      },
    ],
  });
});

test('platform setup bridge can forward reset shell state to desktop host', async () => {
  let received = null;
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      catsDesktopHost: {
        async updatePlatformShell(payload) {
          received = payload;
        },
      },
    },
  });

  try {
    await syncDesktopHostPlatformShellState({
      bootstrapAttemptId: 'attempt-999',
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
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: previousWindow,
    });
  }

  assert.deepEqual(received, {
    bootstrapAttemptId: 'attempt-999',
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
});
