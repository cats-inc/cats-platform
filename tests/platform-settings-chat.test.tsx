import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { StaticRouter } from 'react-router-dom';

import { PlatformSettingsChat } from '../src/app/renderer/settings/PlatformSettingsChat.tsx';
import type { AppShellPayload } from '../src/products/chat/api/contracts.ts';

function createPayload(): AppShellPayload {
  return {
    setupCompleteAt: '2026-04-16T00:00:00.000Z',
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
        settings: [
          {
            id: 'chat',
            label: 'Chat',
            path: '/settings/chat',
          },
        ],
      },
    ],
    chat: {
      showVerboseMessages: false,
      showLiveProgressDetails: true,
      concurrentPresentationMode: 'compare_cards',
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
      generatedAt: '2026-04-16T00:00:00.000Z',
      host: '127.0.0.1',
      port: 8181,
    },
    bootstrapAttemptId: null,
  } as unknown as AppShellPayload;
}

test('PlatformSettingsChat renders concurrent response layout controls on the live settings page', () => {
  const markup = renderToStaticMarkup(
    <StaticRouter location="/settings/chat">
      <PlatformSettingsChat
        payload={createPayload()}
        feedback=""
        onPayloadUpdate={() => {}}
        onFeedback={() => {}}
      />
    </StaticRouter>,
  );

  assert.match(markup, /Conversation preferences/u);
  assert.match(markup, /Concurrent response layout/u);
  assert.match(markup, /Inline stack/u);
  assert.match(markup, /Compare cards/u);
  assert.match(markup, /Focus rail/u);
  assert.match(markup, /Adaptive/u);
  assert.match(markup, /selected=""/u);
});
