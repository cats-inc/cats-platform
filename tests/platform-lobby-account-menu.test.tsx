import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { MemoryRouter } from 'react-router-dom';

import { PlatformLobby } from '../src/app/renderer/PlatformLobby.tsx';
import type { PlatformHostEnvelope } from '../src/shared/platform-contract.ts';

function createEnvelope(): PlatformHostEnvelope {
  return {
    app: {
      name: 'cats',
      stage: 'phase-2-shell',
      runtimeBoundary: 'cats-runtime',
    },
    products: [
      {
        id: 'chat',
        surface: 'chat',
        routePrefix: '/chat',
        productName: 'Cats Chat',
        subtitle: 'Talk with your cats',
        group: 'home',
        installPolicy: 'required',
        installState: 'installed',
        maturity: 'active',
        setup: { selectable: true },
      },
    ],
    desktop: {
      startAtLogin: false,
      openWindowOnStartup: true,
    },
    lobby: {
      animationMode: 'reduced',
      cats: [],
    },
    runtime: {
      baseUrl: 'http://localhost:8484',
      reachable: true,
      status: 'ok',
      service: 'cats-runtime',
    },
    runtimeSetup: {
      source: 'runtime',
      bootstrapRequired: false,
      status: 'ready',
      stateStatus: 'ready',
      summary: 'Ready',
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
      generatedAt: '2026-04-08T00:00:00.000Z',
      host: 'localhost',
      port: 8484,
    },
    bootstrapAttemptId: null,
    setupCompleteAt: '2026-04-08T00:00:00.000Z',
    ownerDisplayName: 'Ken',
    ownerAvatarColor: null,
    ownerAvatarUrl: null,
    lastProductSurface: 'chat',
    guideCat: null,
  };
}

test('PlatformLobby renders the shared account menu trigger in the top bar', () => {
  const markup = renderToStaticMarkup(
    <MemoryRouter initialEntries={['/lobby']}>
      <PlatformLobby envelope={createEnvelope()} />
    </MemoryRouter>,
  );

  assert.match(markup, /class="lobbyIdentity"/u);
  assert.match(markup, /aria-haspopup="menu"/u);
  assert.match(markup, /aria-expanded="false"/u);
  assert.match(markup, />Ken</u);
  assert.doesNotMatch(markup, />Settings</u);
});
