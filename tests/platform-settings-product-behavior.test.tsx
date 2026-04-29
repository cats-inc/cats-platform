import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { StaticRouter } from 'react-router-dom';

import { PlatformSettingsCode } from '../src/app/renderer/settings/PlatformSettingsCode.tsx';
import { PlatformSettingsWork } from '../src/app/renderer/settings/PlatformSettingsWork.tsx';
import type { AppShellPayload } from '../src/products/chat/api/contracts.ts';

function createPayload(): AppShellPayload {
  return {
    setupCompleteAt: '2026-04-21T00:00:00.000Z',
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
      {
        id: 'work',
        surface: 'work',
        routePrefix: '/work',
        productName: 'Cats Work',
        subtitle: 'Projects, approvals, and operator workflow',
        group: 'office',
        installPolicy: 'required',
        installState: 'installed',
        maturity: 'preview',
        setup: {
          selectable: true,
        },
        settings: [
          {
            id: 'work',
            label: 'Work',
            path: '/settings/work',
          },
        ],
      },
      {
        id: 'code',
        surface: 'code',
        routePrefix: '/code',
        productName: 'Cats Code',
        subtitle: 'Repos, runs, and codespaces',
        group: 'office',
        installPolicy: 'required',
        installState: 'installed',
        maturity: 'preview',
        setup: {
          selectable: true,
        },
        settings: [
          {
            id: 'code',
            label: 'Code',
            path: '/settings/code',
          },
        ],
      },
    ],
    chat: {
      conversationBehavior: {
        chat: {
          showVerboseMessages: false,
          showLiveProgressDetails: false,
          concurrentPresentationMode: 'inline_stack',
        },
        work: {
          showVerboseMessages: true,
          showLiveProgressDetails: false,
          concurrentPresentationMode: 'focus_rail',
        },
        code: {
          showVerboseMessages: false,
          showLiveProgressDetails: true,
          concurrentPresentationMode: 'adaptive',
        },
      },
      advancedDraftControls: {
        chat: false,
        code: true,
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
      generatedAt: '2026-04-21T00:00:00.000Z',
      host: '127.0.0.1',
      port: 8181,
    },
    bootstrapAttemptId: null,
  } as unknown as AppShellPayload;
}

test('PlatformSettingsWork renders a work-only conversation behavior section', () => {
  const markup = renderToStaticMarkup(
    <StaticRouter location="/settings/work">
      <PlatformSettingsWork
        payload={createPayload()}
        onPayloadUpdate={() => {}}
      />
    </StaticRouter>,
  );

  assert.match(markup, /Conversation behavior/u);
  assert.match(markup, /These settings affect Cats Work only\./u);
  assert.match(markup, /Choose how multi-model replies are arranged in Cats Work\./u);
  assert.match(markup, /Focus rail/u);
  assert.match(markup, /selected=""/u);
});

test('PlatformSettingsCode renders a code-only conversation behavior section', () => {
  const markup = renderToStaticMarkup(
    <StaticRouter location="/settings/code">
      <PlatformSettingsCode
        payload={createPayload()}
        onPayloadUpdate={() => {}}
      />
    </StaticRouter>,
  );

  assert.match(markup, /Conversation behavior/u);
  assert.match(markup, /These settings affect Cats Code only\./u);
  assert.match(markup, /Choose how multi-model replies are arranged in Cats Code\./u);
  assert.match(markup, /Adaptive/u);
  assert.match(markup, /checked/u);
});
