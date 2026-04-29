import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { Route, Routes, StaticRouter } from 'react-router-dom';

import { AppHostRoute } from '../src/app/renderer/AppHostRoute.tsx';
import type { PlatformHostEnvelope } from '../src/shared/platform-contract.ts';

function createEnvelope(
  overrides: Partial<PlatformHostEnvelope> = {},
): PlatformHostEnvelope {
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
    ...overrides,
  };
}

function renderRoute(pathname: string, envelope: PlatformHostEnvelope): string {
  return renderToStaticMarkup(
    <StaticRouter location={pathname}>
      <Routes>
        <Route path="/apps/:appId/*" element={<AppHostRoute envelope={envelope} />} />
      </Routes>
    </StaticRouter>,
  );
}

test('AppHostRoute renders installed app route metadata', () => {
  const markup = renderRoute('/apps/user.focus/timer', createEnvelope({
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

  assert.match(markup, />Focus Timer</u);
  assert.match(markup, />Focus timer with break reminders</u);
  assert.match(markup, />user.focus</u);
  assert.match(markup, />enabled</u);
});

test('AppHostRoute renders a not-installed state for unknown app routes', () => {
  const markup = renderRoute('/apps/missing.app', createEnvelope());

  assert.match(markup, />App not installed</u);
  assert.match(markup, />Back to Lobby</u);
});
