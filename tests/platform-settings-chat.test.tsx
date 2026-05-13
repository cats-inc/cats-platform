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
      globalOrchestrator: {
        mode: 'global',
        status: 'ready',
        nextFocus: '',
        entrypoints: [],
        referenceProjects: [],
        notes: [],
        executionTarget: {
          provider: 'claude',
          instance: null,
          model: null,
        },
        executionModelSelection: null,
        systemPrompt: '',
        skillProfile: 'aaif-a2a-default',
        mcpProfile: 'work-memory',
        memory: {
          summary: null,
          facts: [],
          openLoops: [],
          updatedAt: null,
        },
        telegramBotName: null,
        updatedAt: '2026-04-16T00:00:00.000Z',
      },
      conversationBehavior: {
        chat: {
          showVerboseMessages: false,
          showLiveProgressDetails: true,
          concurrentPresentationMode: 'compare_cards',
        },
        work: {
          showVerboseMessages: true,
          showLiveProgressDetails: false,
          concurrentPresentationMode: 'focus_rail',
        },
        code: {
          showVerboseMessages: false,
          showLiveProgressDetails: false,
          concurrentPresentationMode: 'adaptive',
        },
      },
      advancedDraftControls: {
        chat: false,
        code: false,
        work: false,
      },
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

test('PlatformSettingsChat renders conversation and draft-builder controls on the live settings page', () => {
  const markup = renderToStaticMarkup(
    <StaticRouter location="/settings/chat">
      <PlatformSettingsChat
        payload={createPayload()}
        onPayloadUpdate={() => {}}
      />
    </StaticRouter>,
  );

  assert.match(markup, /Conversation behavior/u);
  assert.match(markup, /Boss Cat tool profile/u);
  assert.match(markup, /Tool Profile/u);
  assert.match(markup, /Chat memory/u);
  assert.match(markup, /Work memory/u);
  assert.match(markup, /Concurrent response layout/u);
  assert.match(markup, /Inline stack/u);
  assert.match(markup, /Compare cards/u);
  assert.match(markup, /Focus rail/u);
  assert.match(markup, /Adaptive/u);
  assert.match(markup, /Draft builder/u);
  assert.match(markup, /Enable advanced draft controls/u);
  assert.match(markup, /selected=""/u);
});
