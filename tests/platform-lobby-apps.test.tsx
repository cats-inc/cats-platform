import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { StaticRouter } from 'react-router-dom';

import { GuideCatPlacementProvider } from '../src/app/renderer/GuideCatPlacementProvider.tsx';
import { PlatformLobby } from '../src/app/renderer/PlatformLobby.tsx';
import {
  buildPlatformLobbyAppEntries,
} from '../src/app/renderer/lobbyModel.ts';
import type { PlatformHostEnvelope } from '../src/shared/platform-contract.ts';

function createEnvelope(
  overrides: Partial<PlatformHostEnvelope> = {},
): PlatformHostEnvelope {
  const { lobby: lobbyOverrides, ...envelopeOverrides } = overrides;
  return {
    app: {
      name: 'cats-platform',
      stage: 'phase-2-shell',
      runtimeBoundary: 'cats-runtime',
    },
    products: [],
    installedApps: [],
    desktop: {
      startAtLogin: false,
      openWindowOnStartup: true,
      systemTrayEnabled: true,
    },
    lobby: {
      animationMode: 'reduced',
      cats: [],
      ...(lobbyOverrides ?? {}),
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
      generatedAt: '2026-04-29T00:00:00.000Z',
      host: 'localhost',
      port: 8484,
    },
    bootstrapAttemptId: null,
    scopeId: 'scope-fixture',
    setupCompleteAt: '2026-04-29T00:00:00.000Z',
    ownerDisplayName: 'Ken',
    ownerAvatarColor: null,
    ownerAvatarUrl: null,
    lastProductSurface: 'chat',
    guideCat: null,
    ...envelopeOverrides,
  };
}

function renderLobby(envelope: PlatformHostEnvelope): string {
  return renderToStaticMarkup(
    <StaticRouter location="/lobby">
      <GuideCatPlacementProvider
        guideCat={null}
        placement="floating"
        floatingAnchor={null}
        sidecarMode="auto"
        onPersistSeen={() => {}}
        onCommit={() => {}}
      >
        <PlatformLobby envelope={envelope} />
      </GuideCatPlacementProvider>
    </StaticRouter>,
  );
}

test('buildPlatformLobbyAppEntries includes only enabled active app launch entries', () => {
  const entries = buildPlatformLobbyAppEntries({
    installedApps: [
      {
        id: 'user.pomodoro',
        displayName: 'Pomodoro',
        publisher: 'Local User',
        version: '0.1.0',
        category: 'user-app',
        trustTier: 'local-user',
        installState: 'enabled',
        enabled: true,
        lobbyEntries: [
          {
            id: 'timer',
            title: 'Pomodoro',
            subtitle: 'Focus timer',
            routePath: '/apps/user.pomodoro',
          },
        ],
      },
      {
        id: 'user.disabled',
        displayName: 'Disabled App',
        publisher: 'Local User',
        version: '0.1.0',
        category: 'user-app',
        trustTier: 'local-user',
        installState: 'disabled',
        enabled: false,
        lobbyEntries: [
          {
            id: 'disabled',
            title: 'Disabled',
            routePath: '/apps/user.disabled',
          },
        ],
      },
      {
        id: 'connector.calendar',
        displayName: 'Calendar Connector',
        publisher: 'Local User',
        version: '0.1.0',
        category: 'capability-connector',
        trustTier: 'local-user',
        installState: 'enabled',
        enabled: true,
        lobbyEntries: [],
      },
    ],
  });

  assert.deepEqual(entries.map((entry) => entry.routePath), ['/apps/user.pomodoro']);
});

test('PlatformLobby renders installed Apps from the envelope and removes the Pomodoro mock', () => {
  const markup = renderLobby(createEnvelope({
    installedApps: [
      {
        id: 'user.focus',
        displayName: 'Focus Timer',
        publisher: 'Local User',
        version: '0.1.0',
        category: 'user-app',
        trustTier: 'local-user',
        installState: 'enabled',
        enabled: true,
        lobbyEntries: [
          {
            id: 'timer',
            title: 'Focus Timer',
            subtitle: 'Focus timer with break reminders',
            routePath: '/apps/user.focus',
          },
        ],
      },
    ],
  }));

  assert.match(markup, />Apps</u);
  assert.match(markup, />Focus Timer</u);
  assert.match(markup, />Focus timer with break reminders</u);
  assert.match(markup, /aria-label="Open Focus Timer"/u);
  assert.doesNotMatch(markup, />Pomodoro</u);
  assert.doesNotMatch(markup, /platformLobbyCard--mock[^"]*"[^>]*>[\s\S]*Pomodoro/u);
});

test('PlatformLobby renders a quiet Apps empty state when no app has a Lobby entry', () => {
  const markup = renderLobby(createEnvelope({
    installedApps: [
      {
        id: 'connector.calendar',
        displayName: 'Calendar Connector',
        publisher: 'Local User',
        version: '0.1.0',
        category: 'capability-connector',
        trustTier: 'local-user',
        installState: 'enabled',
        enabled: true,
        lobbyEntries: [],
      },
    ],
  }));

  assert.match(markup, />No apps yet</u);
  assert.doesNotMatch(markup, />Pomodoro</u);
});
