import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { Route, Routes, StaticRouter } from 'react-router-dom';

import { CatsListPage } from '../src/app/renderer/entities/CatsListPage.tsx';
import { I18nProvider } from '../src/app/renderer/i18n/I18nProvider.tsx';
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
      generatedAt: '2026-05-05T00:00:00.000Z',
      host: 'localhost',
      port: 8484,
    },
    bootstrapAttemptId: null,
    scopeId: 'scope-fixture',
    setupCompleteAt: '2026-05-05T00:00:00.000Z',
    ownerDisplayName: 'Ken',
    ownerAvatarColor: null,
    ownerAvatarUrl: null,
    lastProductSurface: 'chat',
    guideCat: null,
    ...overrides,
  };
}

const sampleCats = [
  {
    id: 'cat-concierge',
    name: 'Concierge',
    avatarColor: '#8B7E74',
    avatarUrl: null,
    isBoss: true,
    defaultExecutionTarget: { provider: 'anthropic', instance: null, model: 'claude-opus-4-7' },
    defaultModelSelection: null,
    executionLabel: 'Claude Opus 4.7',
  },
  {
    id: 'cat-coder',
    name: 'Coder',
    avatarColor: '#5B8DEF',
    avatarUrl: null,
    isBoss: false,
    defaultExecutionTarget: null,
    defaultModelSelection: null,
    executionLabel: null,
  },
];

function renderCatsList(envelope: PlatformHostEnvelope): string {
  return renderToStaticMarkup(
    <I18nProvider locale="en">
      <StaticRouter location="/cats">
        <Routes>
          <Route path="/cats" element={<CatsListPage envelope={envelope} />} />
        </Routes>
      </StaticRouter>
    </I18nProvider>,
  );
}

test('CatsListPage lists every cat from the lobby envelope and links to the canonical cat home', () => {
  const markup = renderCatsList(
    createEnvelope({
      lobby: { animationMode: 'reduced', cats: sampleCats },
    }),
  );

  assert.match(markup, />My Cats</u);
  assert.match(markup, />Concierge</u);
  assert.match(markup, />Coder</u);
  assert.match(markup, /href="\/cats\/cat-concierge"/u);
  assert.match(markup, /href="\/cats\/cat-coder"/u);
});

test('CatsListPage encodes catIds with spaces or slashes when building the row href', () => {
  const trickyCat = {
    id: 'cat with/slash',
    name: 'Edge Case',
    avatarColor: '#AAAAAA',
    avatarUrl: null,
    isBoss: false,
    defaultExecutionTarget: null,
    defaultModelSelection: null,
    executionLabel: null,
  };

  const markup = renderCatsList(
    createEnvelope({
      lobby: { animationMode: 'reduced', cats: [trickyCat] },
    }),
  );

  assert.match(markup, /href="\/cats\/cat%20with%2Fslash"/u);
});

test('CatsListPage shows the empty-state copy when no cats are registered', () => {
  const markup = renderCatsList(
    createEnvelope({
      lobby: { animationMode: 'reduced', cats: [] },
    }),
  );

  assert.match(markup, />My Cats</u);
  assert.match(markup, /No cats yet\. Open the Lobby to add one/u);
  assert.doesNotMatch(markup, /href="\/cats\//u);
});
