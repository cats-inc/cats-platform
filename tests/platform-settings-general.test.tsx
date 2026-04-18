import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { StaticRouter } from 'react-router-dom';

import { PlatformSettingsGeneral } from '../src/app/renderer/settings/PlatformSettingsGeneral.tsx';
import type { AppShellPayload } from '../src/products/chat/api/contracts.ts';

function createPayload(): AppShellPayload {
  return {
    setupCompleteAt: '2026-04-05T00:00:00.000Z',
    ownerDisplayName: 'Kenny',
    ownerAvatarColor: null,
    ownerAvatarUrl: null,
    guideCat: null,
    lastProductSurface: 'chat',
    desktop: {
      startAtLogin: true,
      openWindowOnStartup: false,
      systemTrayEnabled: true,
    },
    lobby: {
      animationMode: 'reduced',
      cats: [],
    },
    products: [
      {
        id: 'chat',
        surface: 'chat',
        routePrefix: '/chat',
        productName: 'Cats Chat',
        subtitle: 'Conversations with companions and personal agents',
        group: 'home',
        installPolicy: 'required',
        installState: 'installed',
        maturity: 'active',
        setup: {
          selectable: true,
        },
      },
    ],
    chat: {
      showVerboseMessages: false,
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
      generatedAt: '2026-04-05T00:00:00.000Z',
      host: '127.0.0.1',
      port: 8181,
    },
    bootstrapAttemptId: null,
  } as unknown as AppShellPayload;
}

test('PlatformSettingsGeneral renders lobby motion controls without desktop startup settings', () => {
  const markup = renderToStaticMarkup(
    <StaticRouter location="/settings/general">
      <PlatformSettingsGeneral
        payload={createPayload()}
        feedback=""
        onPayloadUpdate={() => {}}
        onFeedback={() => {}}
      />
    </StaticRouter>,
  );

  assert.match(markup, /Choose how lively the Lobby background should feel/u);
  assert.match(markup, /Reduced is the default/u);
  assert.doesNotMatch(markup, /Desktop startup/u);
  assert.match(markup, /checked/u);
});
