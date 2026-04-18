import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { SettingsAssistants } from '../src/app/renderer/settings/SettingsAssistants.tsx';
import type { AppShellPayload } from '../src/products/chat/api/contracts.ts';

function createPayload(): AppShellPayload {
  return {
    setupCompleteAt: '2026-04-07T00:00:00.000Z',
    ownerDisplayName: 'Kenny',
    ownerAvatarColor: null,
    ownerAvatarUrl: null,
    guideCat: {
      id: 'guide-cat-primary',
      name: 'Guide Cat',
      executionTarget: {
        provider: 'claude',
        instance: null,
        model: 'claude-sonnet',
      },
      modelSelection: null,
      createdAt: '2026-04-07T00:00:00.000Z',
      updatedAt: '2026-04-07T00:00:00.000Z',
    },
    assistantPresets: [
      {
        id: 'assistant-reviewer',
        name: 'Pair Reviewer',
        executionTarget: {
          provider: 'codex',
          instance: null,
          model: 'gpt-5.4',
        },
        modelSelection: null,
        roleHint: 'Checks routing changes before they reach runtime.',
        createdAt: '2026-04-07T00:00:00.000Z',
        updatedAt: '2026-04-07T00:00:00.000Z',
      },
    ],
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
      generatedAt: '2026-04-07T00:00:00.000Z',
      host: '127.0.0.1',
      port: 8181,
    },
    bootstrapAttemptId: null,
  } as unknown as AppShellPayload;
}

test('SettingsAssistants renders guide cat and saved assistant presets', () => {
  const markup = renderToStaticMarkup(
    <SettingsAssistants
      payload={createPayload()}
      onPayloadUpdate={() => {}}
    />,
  );

  assert.match(markup, /Guide Cat/u);
  assert.match(markup, /Saved Assistants/u);
  assert.match(markup, /Pair Reviewer/u);
  assert.match(markup, /Checks routing changes before they reach runtime/u);
  assert.match(markup, /New assistant/u);
});

test('SettingsAssistants empty state keeps temporary participants out of settings', () => {
  const payload = createPayload();
  payload.guideCat = null;
  payload.assistantPresets = [];

  const markup = renderToStaticMarkup(
    <SettingsAssistants
      payload={payload}
      onPayloadUpdate={() => {}}
    />,
  );

  assert.match(markup, /No Guide Cat configured/u);
  assert.match(markup, /No saved assistants yet/u);
  assert.match(markup, /temporary participants stay inside the room/u);
});
