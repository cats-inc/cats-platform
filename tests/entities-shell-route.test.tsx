import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

  // /lobby is bare — no `screen claudeShell` wrapper, no <aside
  // class="sidebar"> at all. Lobby's own canvas paints the entity
  // drill-in cards directly.
  assert.doesNotMatch(markup, /<aside[^>]*class="sidebar/u);
  assert.doesNotMatch(markup, /class="screen claudeShell/u);
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

test('Drilled-down /cats route mounts the chat-style appshell (claudeShell + sidebar + canvas)', () => {
  const markup = renderApp('/cats', createEnvelope());

  // Same outer wrapper chat / code / work use — `screen claudeShell`
  // for the 260px sidebar + 1fr canvas grid.
  assert.match(markup, /<div[^>]*class="screen claudeShell"/u);
  // Sidebar uses the appshell chrome (`.sidebar` aside + `.sidebarInner`
  // + `.sidebarFooter`); `data-shell-surface="lobby"` lets the
  // per-lens-kind placeholder tints take over.
  assert.match(markup, /<aside[^>]*class="sidebar"[^>]*data-shell-surface="lobby"/u);
  assert.match(markup, /class="sidebarInner"/u);
  assert.match(markup, /class="sidebarFooter"/u);
  // Canvas wraps Outlet content.
  assert.match(markup, /<main class="canvas">/u);
  // No standalone "back to Lobby" affordance — surface switcher does it.
  assert.doesNotMatch(markup, /class="entitiesShellBackLink"/u);
  // Three lens sections render (header sectionLabels: My Cats /
  // Clowders / Catteries).
  assert.match(markup, />My Cats</u);
  assert.match(markup, />My Clowders</u);
  assert.match(markup, />My Catteries</u);
});

test('LobbyAppShellSidebar surface switcher trigger reads "Cats Lobby" via the label override', () => {
  const markup = renderApp('/cats', createEnvelope());

  // The PlatformSurfaceSwitcher trigger button writes the active
  // product label inside its inner `<span class="brandLabel">`. With
  // `activeLabelOverride` set by LobbyAppShellSidebar, that label
  // should read "Cats Lobby" rather than the user's last-product
  // surface name.
  assert.match(markup, /class="brandLabel">Cats Lobby</u);
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

  assert.match(markup, /<div[^>]*class="screen claudeShell"/u);
  assert.match(markup, /<aside[^>]*class="sidebar"[^>]*data-shell-surface="lobby"/u);
  assert.match(markup, />Concierge</u);
  // The sidebar's MyCatRowItem renders the cat's avatar inside a
  // `<span class="myCatAvatarWrap catAvatar [catAvatarBoss]">`. The
  // `.catAvatar` base styling (28×28 disc, font, color) lives in
  // `chat-thread-base.css`; if EntitiesShell stops importing that
  // bundle the avatar collapses to 0×0 even though the markup is
  // intact. Asserting the class chain here pins both the markup and
  // the implicit CSS-import contract.
  assert.match(markup, /class="myCatAvatarWrap catAvatar catAvatarBoss"/u);
});

test('EntitiesShell loads the chat-thread-base avatar primitives so MY CATS rows show the 28px disc', () => {
  // Sanity check that EntitiesShell.tsx still imports the file
  // carrying `.catAvatar` rules. Imports are easy to drop accidentally
  // when refactoring style bundles, and SSR markup alone can't surface
  // an "invisible avatar" regression. Tests run from the package root
  // (`node --test build/test/*.js`), so resolve relative to cwd.
  const path = `${process.cwd()}/src/app/renderer/lobby/EntitiesShell.tsx`;
  const source = readFileSync(path, 'utf8');
  assert.match(source, /chat-thread-base\.css/u);
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
  assert.match(clowderMarkup, /<div[^>]*class="screen claudeShell"/u);
  assert.match(clowderMarkup, /<aside[^>]*class="sidebar"[^>]*data-shell-surface="lobby"/u);
  assert.match(clowderMarkup, />Dev Team</u);

  const catteryMarkup = renderApp('/catteries/acme', envelope);
  assert.match(catteryMarkup, /<div[^>]*class="screen claudeShell"/u);
  assert.match(catteryMarkup, /<aside[^>]*class="sidebar"[^>]*data-shell-surface="lobby"/u);
  assert.match(catteryMarkup, />Acme Co\.</u);
});
