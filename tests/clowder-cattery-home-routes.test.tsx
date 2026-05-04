import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { Route, Routes, StaticRouter } from 'react-router-dom';

import { CatteryHome } from '../src/app/renderer/entities/CatteryHome.tsx';
import { ClowderHome } from '../src/app/renderer/entities/ClowderHome.tsx';
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
      clowders: [],
      catteries: [],
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

const acmeCattery = {
  id: 'acme',
  name: 'Acme Co.',
  avatarUrl: null,
  memberCount: 12,
  clowderCount: 3,
  catCount: 7,
};

const devClowder = {
  id: 'clw-dev',
  name: 'Dev Team',
  avatarUrl: null,
  parentCatteryId: 'acme',
  catCount: 5,
  memberCount: 8,
};

const phoenixClowder = {
  id: 'clw-phoenix',
  name: 'Project Phoenix',
  avatarUrl: null,
  parentCatteryId: null,
  catCount: 3,
  memberCount: 4,
};

function renderClowderRoute(pathname: string, envelope: PlatformHostEnvelope): string {
  return renderToStaticMarkup(
    <I18nProvider locale="en">
      <StaticRouter location={pathname}>
        <Routes>
          <Route path="/clowders/:clowderId" element={<ClowderHome envelope={envelope} />} />
          <Route path="/clowders/:clowderId/:tab" element={<ClowderHome envelope={envelope} />} />
        </Routes>
      </StaticRouter>
    </I18nProvider>,
  );
}

function renderCatteryRoute(pathname: string, envelope: PlatformHostEnvelope): string {
  return renderToStaticMarkup(
    <I18nProvider locale="en">
      <StaticRouter location={pathname}>
        <Routes>
          <Route path="/catteries/:catteryId" element={<CatteryHome envelope={envelope} />} />
          <Route path="/catteries/:catteryId/:tab" element={<CatteryHome envelope={envelope} />} />
        </Routes>
      </StaticRouter>
    </I18nProvider>,
  );
}

test('ClowderHome renders Cats tab by default and shows the parent-Cattery chip', () => {
  const markup = renderClowderRoute(
    '/clowders/clw-dev',
    createEnvelope({
      lobby: {
        animationMode: 'reduced',
        cats: [],
        clowders: [devClowder],
        catteries: [acmeCattery],
      },
    }),
  );

  assert.match(markup, />Dev Team</u);
  assert.match(markup, />Part of Acme Co\./u);
  assert.match(markup, /aria-current="page"[^>]*>Cats</u);
  assert.match(markup, /No cats in this Clowder yet/u);
});

test('ClowderHome shows the cross-unit task force chip when parentCatteryId is null', () => {
  const markup = renderClowderRoute(
    '/clowders/clw-phoenix',
    createEnvelope({
      lobby: {
        animationMode: 'reduced',
        cats: [],
        clowders: [phoenixClowder],
        catteries: [],
      },
    }),
  );

  assert.match(markup, />Project Phoenix</u);
  assert.match(markup, />Cross-unit task force</u);
});

test('ClowderHome /clowders/:id/settings renders the Settings tab', () => {
  const markup = renderClowderRoute(
    '/clowders/clw-dev/settings',
    createEnvelope({
      lobby: {
        animationMode: 'reduced',
        cats: [],
        clowders: [devClowder],
        catteries: [acmeCattery],
      },
    }),
  );

  assert.match(markup, /aria-current="page"[^>]*>Settings</u);
  assert.match(markup, /Clowder settings .* PLAN-091 phase 6/u);
});

test('ClowderHome shows the not-found pane when the id is not in the registry', () => {
  const markup = renderClowderRoute(
    '/clowders/missing-clowder',
    createEnvelope({
      lobby: { animationMode: 'reduced', cats: [], clowders: [], catteries: [] },
    }),
  );

  assert.match(markup, />Clowder not found</u);
  assert.match(markup, /missing-clowder/u);
});

test('CatteryHome renders Members tab by default and exposes all four tab links', () => {
  const markup = renderCatteryRoute(
    '/catteries/acme',
    createEnvelope({
      lobby: {
        animationMode: 'reduced',
        cats: [],
        clowders: [],
        catteries: [acmeCattery],
      },
    }),
  );

  assert.match(markup, />Acme Co\.</u);
  assert.match(markup, /aria-current="page"[^>]*>Members</u);
  assert.match(markup, /href="\/catteries\/acme\/members"/u);
  assert.match(markup, /href="\/catteries\/acme\/clowders"/u);
  assert.match(markup, /href="\/catteries\/acme\/cats"/u);
  assert.match(markup, /href="\/catteries\/acme\/settings"/u);
  assert.match(markup, /No members yet/u);
});

test('CatteryHome /catteries/:id/clowders renders the Clowders tab empty state', () => {
  const markup = renderCatteryRoute(
    '/catteries/acme/clowders',
    createEnvelope({
      lobby: {
        animationMode: 'reduced',
        cats: [],
        clowders: [],
        catteries: [acmeCattery],
      },
    }),
  );

  assert.match(markup, /aria-current="page"[^>]*>Clowders</u);
  assert.match(markup, /No clowders in this Cattery yet/u);
});

test('CatteryHome /catteries/:id/cats renders the aggregate-Cats tab empty state', () => {
  const markup = renderCatteryRoute(
    '/catteries/acme/cats',
    createEnvelope({
      lobby: {
        animationMode: 'reduced',
        cats: [],
        clowders: [],
        catteries: [acmeCattery],
      },
    }),
  );

  assert.match(markup, /aria-current="page"[^>]*>Cats</u);
  assert.match(markup, /aggregate \(direct members \+ via formal Clowders\)/u);
});

test('CatteryHome shows the not-found pane when the id is not in the registry', () => {
  const markup = renderCatteryRoute(
    '/catteries/missing-cattery',
    createEnvelope({
      lobby: { animationMode: 'reduced', cats: [], clowders: [], catteries: [] },
    }),
  );

  assert.match(markup, />Cattery not found</u);
  assert.match(markup, /missing-cattery/u);
});
