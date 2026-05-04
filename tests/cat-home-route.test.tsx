import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { Route, Routes, StaticRouter } from 'react-router-dom';

import { CatHome } from '../src/app/renderer/entities/CatHome.tsx';
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

const conciergeCat = {
  id: 'cat-concierge',
  name: 'Concierge',
  avatarColor: '#8B7E74',
  avatarUrl: null,
  isBoss: true,
  defaultExecutionTarget: { provider: 'anthropic', instance: null, model: 'claude-opus-4-7' },
  defaultModelSelection: null,
  executionLabel: 'Claude Opus 4.7',
};

function renderCatRoute(pathname: string, envelope: PlatformHostEnvelope): string {
  return renderToStaticMarkup(
    <I18nProvider locale="en">
      <StaticRouter location={pathname}>
        <Routes>
          <Route path="/cats/:catId" element={<CatHome envelope={envelope} />} />
          <Route path="/cats/:catId/:lens" element={<CatHome envelope={envelope} />} />
        </Routes>
      </StaticRouter>
    </I18nProvider>,
  );
}

test('CatHome renders Overview by default with default-executor summary', () => {
  const markup = renderCatRoute(
    '/cats/cat-concierge',
    createEnvelope({
      lobby: { animationMode: 'reduced', cats: [conciergeCat] },
    }),
  );

  assert.match(markup, />Concierge</u);
  assert.match(markup, />Boss Cat</u);
  assert.match(markup, />Cross-product summary</u);
  assert.match(markup, />Default executor</u);
  assert.match(markup, />Claude Opus 4\.7</u);
  assert.match(markup, />cat-concierge</u);
  assert.match(markup, /href="\/lobby"/u);
});

test('CatHome /cats/:id/overview deep-link still renders Overview with active tab', () => {
  const markup = renderCatRoute(
    '/cats/cat-concierge/overview',
    createEnvelope({
      lobby: { animationMode: 'reduced', cats: [conciergeCat] },
    }),
  );

  assert.match(markup, />Concierge</u);
  assert.match(markup, /aria-current="page"[^>]*>Overview</u);
});

test('CatHome /cats/:id/chat renders the Chat lens stub', () => {
  const markup = renderCatRoute(
    '/cats/cat-concierge/chat',
    createEnvelope({
      lobby: { animationMode: 'reduced', cats: [conciergeCat] },
    }),
  );

  assert.match(markup, />Concierge</u);
  assert.match(markup, /aria-current="page"[^>]*>Chat</u);
  assert.match(markup, /Chat lens is not implemented yet/u);
});

test('CatHome /cats/:id/work renders the Work lens stub', () => {
  const markup = renderCatRoute(
    '/cats/cat-concierge/work',
    createEnvelope({
      lobby: { animationMode: 'reduced', cats: [conciergeCat] },
    }),
  );

  assert.match(markup, /aria-current="page"[^>]*>Work</u);
  assert.match(markup, /Work lens is not implemented yet/u);
});

test('CatHome /cats/:id/code renders the Code lens stub', () => {
  const markup = renderCatRoute(
    '/cats/cat-concierge/code',
    createEnvelope({
      lobby: { animationMode: 'reduced', cats: [conciergeCat] },
    }),
  );

  assert.match(markup, /aria-current="page"[^>]*>Code</u);
  assert.match(markup, /Code lens is not implemented yet/u);
});

test('CatHome shows the Cat-not-found pane when the id is not in the registry', () => {
  const markup = renderCatRoute(
    '/cats/cat-missing',
    createEnvelope({
      lobby: { animationMode: 'reduced', cats: [conciergeCat] },
    }),
  );

  assert.match(markup, />Cat not found</u);
  assert.match(markup, /cat-missing/u);
});

test('CatHome surfaces "No default executor configured" when defaultExecutionTarget is null', () => {
  const minimalCat = {
    ...conciergeCat,
    id: 'cat-bare',
    name: 'Bare Cat',
    defaultExecutionTarget: null,
    executionLabel: null,
    isBoss: false,
  };

  const markup = renderCatRoute(
    '/cats/cat-bare',
    createEnvelope({
      lobby: { animationMode: 'reduced', cats: [minimalCat] },
    }),
  );

  assert.match(markup, />Bare Cat</u);
  assert.match(markup, />No default executor configured</u);
  assert.doesNotMatch(markup, />Boss Cat</u);
});
