import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { Route, Routes, StaticRouter } from 'react-router-dom';

import { CatHome } from '../src/app/renderer/entities/CatHome.tsx';
import { CatsListPage } from '../src/app/renderer/entities/CatsListPage.tsx';
import { CatteryHome } from '../src/app/renderer/entities/CatteryHome.tsx';
import { ClowderHome } from '../src/app/renderer/entities/ClowderHome.tsx';
import { I18nProvider } from '../src/app/renderer/i18n/I18nProvider.tsx';
import { EntitiesShell } from '../src/app/renderer/lobby/EntitiesShell.tsx';
import { PlatformLobby } from '../src/app/renderer/PlatformLobby.tsx';
import { GuideCatPlacementProvider } from '../src/app/renderer/GuideCatPlacementProvider.tsx';
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

function renderApp(pathname: string, envelope: PlatformHostEnvelope): string {
  return renderToStaticMarkup(
    <I18nProvider locale="en">
      <StaticRouter location={pathname}>
        <GuideCatPlacementProvider
          guideCat={null}
          placement="floating"
          floatingAnchor={null}
          sidecarMode="auto"
          onPersistSeen={() => {}}
          onCommit={() => {}}
        >
          <Routes>
            <Route path="/lobby" element={<PlatformLobby envelope={envelope} />} />
            <Route element={<EntitiesShell envelope={envelope} />}>
              <Route path="/cats" element={<CatsListPage envelope={envelope} />} />
              <Route path="/cats/:catId" element={<CatHome envelope={envelope} />} />
              <Route
                path="/clowders/:clowderId"
                element={<ClowderHome envelope={envelope} />}
              />
              <Route
                path="/catteries/:catteryId"
                element={<CatteryHome envelope={envelope} />}
              />
            </Route>
          </Routes>
        </GuideCatPlacementProvider>
      </StaticRouter>
    </I18nProvider>,
  );
}

test('Lobby /lobby renders WITHOUT the appshell sidebar (PLAN-091 phase 7 correction)', () => {
  const markup = renderApp('/lobby', createEnvelope());

  // /lobby is bare — no <aside class="sidebar"> at all, no
  // EntitiesShell wrapper. Lobby's own canvas paints the entity
  // drill-in cards directly.
  assert.doesNotMatch(markup, /<aside[^>]*class="sidebar/u);
  assert.doesNotMatch(markup, /class="entitiesShellScreen"/u);
  // Greeting + entity drill-in cards render.
  assert.match(markup, />My identities</u);
  assert.match(markup, />My Cats</u);
  assert.match(markup, />My Clowders</u);
  assert.match(markup, />My Catteries</u);
});

test('Lobby entity cards land in the My identities section with the per-entity classes', () => {
  const markup = renderApp('/lobby', createEnvelope());

  // Each card carries an entity-specific class so CSS can pin a
  // colour and downstream tests can locate them.
  assert.match(markup, /platformLobbyCard--entity-cats/u);
  assert.match(markup, /platformLobbyCard--entity-clowders/u);
  assert.match(markup, /platformLobbyCard--entity-catteries/u);
});

test('Drilled-down /cats route mounts the EntitiesShell with the appshell sidebar', () => {
  const markup = renderApp('/cats', createEnvelope());

  assert.match(markup, /class="screen entitiesShellScreen"/u);
  // The sidebar uses the same chrome chat / code / work do — the
  // outer aside wears the `sidebar` class and contains the
  // `sidebarInner` scroll container plus the `sidebarFooter`.
  assert.match(markup, /<aside[^>]*class="sidebar"[^>]*data-shell-surface="lobby"/u);
  assert.match(markup, /class="sidebarInner"/u);
  assert.match(markup, /class="sidebarFooter"/u);
  // No standalone "back to Lobby" affordance — the surface switcher
  // at the top of the sidebar is the way back.
  assert.doesNotMatch(markup, /class="entitiesShellBackLink"/u);
  // Three lens sections render (header sectionLabels: My Cats /
  // Clowders / Catteries).
  assert.match(markup, />My Cats</u);
  assert.match(markup, />My Clowders</u);
  assert.match(markup, />My Catteries</u);
});

test('Drilled-down /cats/:catId route also mounts the EntitiesShell', () => {
  const markup = renderApp(
    '/cats/cat-concierge',
    createEnvelope({
      lobby: {
        animationMode: 'reduced',
        cats: [
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
        ],
        clowders: [],
        catteries: [],
      },
    }),
  );

  assert.match(markup, /class="screen entitiesShellScreen"/u);
  assert.match(markup, /<aside[^>]*class="sidebar"[^>]*data-shell-surface="lobby"/u);
  assert.match(markup, />Concierge</u);
});

test('Drilled-down /clowders/:id and /catteries/:id routes both mount the EntitiesShell', () => {
  const envelope = createEnvelope({
    lobby: {
      animationMode: 'reduced',
      cats: [],
      clowders: [
        {
          id: 'clw-dev',
          name: 'Dev Team',
          avatarUrl: null,
          parentCatteryId: 'acme',
          catCount: 5,
          memberCount: 8,
        },
      ],
      catteries: [
        {
          id: 'acme',
          name: 'Acme Co.',
          avatarUrl: null,
          memberCount: 12,
          clowderCount: 3,
          catCount: 7,
        },
      ],
    },
  });

  const clowderMarkup = renderApp('/clowders/clw-dev', envelope);
  assert.match(clowderMarkup, /class="screen entitiesShellScreen"/u);
  assert.match(clowderMarkup, /<aside[^>]*class="sidebar"[^>]*data-shell-surface="lobby"/u);
  assert.match(clowderMarkup, />Dev Team</u);

  const catteryMarkup = renderApp('/catteries/acme', envelope);
  assert.match(catteryMarkup, /class="screen entitiesShellScreen"/u);
  assert.match(catteryMarkup, /<aside[^>]*class="sidebar"[^>]*data-shell-surface="lobby"/u);
  assert.match(catteryMarkup, />Acme Co\.</u);
});
