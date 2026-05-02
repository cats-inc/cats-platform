import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { StaticRouter } from 'react-router-dom';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
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
  assert.match(markup, /Assistant response language/u);
  assert.match(markup, /Unspecified/u);
  assert.match(markup, /Japanese/u);
  assert.match(markup, /Display language/u);
  assert.match(markup, /Auto-detect/u);
  assert.match(markup, /English/u);
  assert.match(markup, /Traditional Chinese/u);
  assert.match(markup, /Reduced is the default/u);
  assert.doesNotMatch(markup, /Desktop startup/u);
  assert.match(markup, /checked/u);
});

test('PlatformSettingsGeneral localizes display language options', () => {
  const markup = renderToStaticMarkup(
    <I18nProvider locale="zh-TW" languagePreference="zh-TW">
      <StaticRouter location="/settings/general">
        <PlatformSettingsGeneral
          payload={createPayload()}
          feedback=""
          onPayloadUpdate={() => {}}
          onFeedback={() => {}}
        />
      </StaticRouter>
    </I18nProvider>,
  );

  assert.match(markup, /顯示語言/u);
  assert.match(markup, /英文/u);
  assert.match(markup, /繁體中文/u);
  assert.doesNotMatch(markup, /Traditional Chinese/u);
});

test('PlatformSettingsGeneral points disabled guide cat users to Assistants', () => {
  const payload = createPayload();
  payload.guideCat = {
    id: 'guide-cat-primary',
    name: 'Catlas',
    status: 'dismissed',
    executionTarget: {
      provider: 'claude',
      instance: null,
      model: 'claude-sonnet',
    },
    modelSelection: null,
    createdAt: '2026-04-05T00:00:00.000Z',
    updatedAt: '2026-04-05T00:00:00.000Z',
  };

  const markup = renderToStaticMarkup(
    <StaticRouter location="/settings/general">
      <PlatformSettingsGeneral
        payload={payload}
        feedback=""
        onPayloadUpdate={() => {}}
        onFeedback={() => {}}
      />
    </StaticRouter>,
  );

  assert.match(markup, /Guide Cat assist/u);
  assert.match(markup, /Catlas help back/u);
  assert.match(markup, /Settings &gt; Assistants/u);
  assert.match(markup, /Open Assistants/u);
});
