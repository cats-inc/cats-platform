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
import {
  CatteriesCanvasPage,
  ClowdersCanvasPage,
} from '../src/app/renderer/entities/EntityCanvasPages.tsx';
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
              <Route path="/entities/cats" element={<CatsListPage envelope={envelope} />} />
              <Route path="/entities/cats/:catId" element={<CatHome envelope={envelope} />} />
              <Route
                path="/entities/clowders"
                element={<ClowdersCanvasPage envelope={envelope} />}
              />
              <Route
                path="/entities/clowders/:clowderId"
                element={<ClowderHome envelope={envelope} />}
              />
              <Route
                path="/entities/catteries"
                element={<CatteriesCanvasPage envelope={envelope} />}
              />
              <Route
                path="/entities/catteries/:catteryId"
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
  // Three column headers replace the previous single "My identities"
  // eyebrow. Each header is a plain title (the whole entity card is
  // already clickable via `.lobbyEntityCardLink`, so the header
  // doesn't need to double as a button). Uppercase is supplied by
  // CSS, not by the i18n string.
  assert.match(markup, /<p[^>]*class="lobbyEntityColumnHeader"[^>]*>Cats</u);
  assert.match(markup, /<p[^>]*class="lobbyEntityColumnHeader"[^>]*>Clowders</u);
  assert.match(markup, /<p[^>]*class="lobbyEntityColumnHeader"[^>]*>Catteries</u);
});

test('Lobby entity cards keep their per-entity classes with a shared neutral accent', () => {
  const markup = renderApp('/lobby', createEnvelope());

  // The per-entity classes survive (downstream tests + future
  // surface-specific tweaks rely on them) even though all three now
  // paint the same neutral accent stripe via
  // `.platformLobbyCard--entity .platformLobbyCardAccent`.
  assert.match(markup, /platformLobbyCard--entity-cats/u);
  assert.match(markup, /platformLobbyCard--entity-clowders/u);
  assert.match(markup, /platformLobbyCard--entity-catteries/u);
});

test('Each entity card carries a full-card background link that opens its canvas', () => {
  const markup = renderApp('/lobby', createEnvelope());

  // The card link is a real `<button class="lobbyEntityCardLink">`
  // covering the card via absolute-inset CSS. Items / accent / total
  // sit at higher z-index (or pointer-events: none) so the link
  // catches non-row clicks. Three cards = three links, each with the
  // localised "Open …" aria-label.
  const linkMatches = markup.match(/class="lobbyEntityCardLink"/gu) ?? [];
  assert.equal(linkMatches.length, 3);
  assert.match(markup, /aria-label="Open Cats"/u);
  assert.match(markup, /aria-label="Open Clowders"/u);
  assert.match(markup, /aria-label="Open Catteries"/u);
});

test('Lobby entity cards show three fixed rows + placeholder when empty (no footer at zero)', () => {
  // Empty envelope (no cats / clowders / catteries) — the first row
  // of each card should render the "+ New X" placeholder via the
  // shared PlaceholderGlyph. The "{N} TOTAL" footer should NOT
  // render at all when count is 0; it would just say "0 total" which
  // is redundant with the placeholder.
  const markup = renderApp('/lobby', createEnvelope());

  assert.match(markup, /class="lobbyEntityItem lobbyEntityItemPlaceholder"/u);
  assert.match(markup, />New cat</u);
  assert.match(markup, />New clowder</u);
  assert.match(markup, />New cattery</u);
  assert.doesNotMatch(markup, /class="lobbyEntityCardFooter"/u);
  assert.doesNotMatch(markup, /class="lobbyEntityCardTotal"/u);
  assert.doesNotMatch(markup, />0 total</u);
});

test('Lobby cats card renders the boss cat with avatar + ellipsis-friendly name when populated', () => {
  const markup = renderApp(
    '/lobby',
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
            createdAt: '2026-01-01T00:00:00.000Z',
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

  // The cat's row renders inside the cats column with the shared
  // `.lobbyEntityItem` class (button), the 28×28 `.lobbyEntityAvatar`
  // disc, and the `.lobbyEntityName` text node carrying the cat's
  // name. Name overflow ellipsis is asserted via the CSS class — the
  // class chain pins the contract that lets the rule apply.
  assert.match(markup, /class="lobbyEntityItem"/u);
  // The avatar span carries `lobbyEntityAvatar` plus an optional
  // `catAvatarBoss` modifier when the cat is the boss — see
  // chat-thread-base.css for the gold-ring rule. Match on the lead
  // class so we don't pin the test to a particular boss state.
  assert.match(markup, /class="lobbyEntityAvatar(?:\s|")/u);
  // The Concierge fixture is `isBoss: true`, so the markup must
  // carry the `catAvatarBoss` modifier alongside `lobbyEntityAvatar`.
  // This is the regression guard for the "lobby card avatar didn't
  // get the gold ring" bug — boss visual lives in chat-thread-base.css
  // and the lobby card has to import that bundle.
  assert.match(markup, /class="lobbyEntityAvatar catAvatarBoss"/u);
  assert.match(markup, /class="lobbyEntityName">Concierge</u);
  // Cats card now shows "1 total"; clowders / catteries still hide
  // the footer entirely (count = 0).
  assert.match(markup, />1 total</u);
  // No avatar stack when total ≤ 3.
  assert.doesNotMatch(markup, /class="lobbyEntityAvatarStack"/u);
});

test('Lobby cats card adds an avatar stack to the footer when there are more than 3 cats', () => {
  // Five cats — three fill the inline rows, the remaining two flow
  // into the footer's decorative avatar stack. The stack carries
  // aria-hidden="true" and `lobbyEntityAvatarStacked` discs (no
  // hover / click handlers — the footer is purely decorative).
  const markup = renderApp(
    '/lobby',
    createEnvelope({
      lobby: {
        animationMode: 'reduced',
        cats: [1, 2, 3, 4, 5].map((i) => ({
          id: `cat-${i}`,
          name: `Cat ${i}`,
          avatarColor: '#8B7E74',
          avatarUrl: null,
          isBoss: i === 1,
          createdAt: `2026-0${i}-01T00:00:00.000Z`,
          defaultExecutionTarget: { provider: 'anthropic', instance: null, model: 'claude-opus-4-7' },
          defaultModelSelection: null,
          executionLabel: 'Claude Opus 4.7',
        })),
        clowders: [],
        catteries: [],
      },
    }),
  );

  assert.match(markup, />5 total</u);
  assert.match(markup, /class="lobbyEntityAvatarStack"[^>]*aria-hidden="true"/u);
  // Two overflow avatars (cats 4 + 5) — count via class occurrences.
  const stacked = markup.match(/class="lobbyEntityAvatar lobbyEntityAvatarStacked"/gu) ?? [];
  assert.equal(stacked.length, 2);
});

test('Lobby clowder and cattery cards sort stubs by creation time', () => {
  const markup = renderApp(
    '/lobby',
    createEnvelope({
      lobby: {
        animationMode: 'reduced',
        cats: [],
        clowders: [
          {
            id: 'clw-new',
            name: 'New Team',
            avatarUrl: null,
            createdAt: '2026-02-01T00:00:00.000Z',
            parentCatteryId: null,
            catCount: 1,
            memberCount: 2,
          },
          {
            id: 'clw-dev',
            name: 'Dev Team',
            avatarUrl: null,
            createdAt: '2026-01-02T00:00:00.000Z',
            parentCatteryId: 'acme',
            catCount: 5,
            memberCount: 8,
          },
        ],
        catteries: [
          {
            id: 'beta',
            name: 'Beta Co.',
            avatarUrl: null,
            createdAt: '2026-02-01T00:00:00.000Z',
            memberCount: 3,
            clowderCount: 1,
            catCount: 2,
          },
          {
            id: 'acme',
            name: 'Acme Co.',
            avatarUrl: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            memberCount: 12,
            clowderCount: 3,
            catCount: 7,
          },
        ],
      },
    }),
  );

  const devTeamIndex = markup.indexOf('class="lobbyEntityName">Dev Team');
  const newTeamIndex = markup.indexOf('class="lobbyEntityName">New Team');
  const acmeIndex = markup.indexOf('class="lobbyEntityName">Acme Co.');
  const betaIndex = markup.indexOf('class="lobbyEntityName">Beta Co.');
  assert.ok(devTeamIndex >= 0);
  assert.ok(newTeamIndex >= 0);
  assert.ok(acmeIndex >= 0);
  assert.ok(betaIndex >= 0);
  assert.ok(devTeamIndex < newTeamIndex);
  assert.ok(acmeIndex < betaIndex);
});

test('Drilled-down /entities/cats route mounts the chat-style appshell (claudeShell + sidebar + canvas)', () => {
  const markup = renderApp('/entities/cats', createEnvelope());

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

test('LobbyAppShellSidebar surface switcher trigger reads "Cats Directory" via the label override', () => {
  const markup = renderApp('/entities/cats', createEnvelope());

  // The PlatformSurfaceSwitcher trigger button writes the active
  // product label inside its inner `<span class="brandLabel">`. With
  // `activeLabelOverride` set by LobbyAppShellSidebar, that label
  // should read "Cats Directory" rather than the user's last-product
  // surface name.
  assert.match(markup, /class="brandLabel">Cats Directory</u);
});

test('LobbyAppShellSidebar renders the "Back to Lobby" primary action with hover (no active highlight)', () => {
  const markup = renderApp('/entities/cats', createEnvelope());

  // Mirrors chat's "+ New chat" slot. The primary action should
  // render as a `<button class="navItem">` (no `navItemActive`,
  // since /lobby is never the surface this sidebar runs on) carrying
  // the "Back to Lobby" label. The button is the user's path back to
  // the unframed /lobby canvas.
  assert.match(
    markup,
    /<button[^>]*class="navItem"[^>]*>(?:(?!class="navItemActive").)*Back to Lobby/su,
  );
  assert.doesNotMatch(markup, /class="navItemActive"[^>]*>(?:[^<]*)Back to Lobby/su);
});

test('Drilled-down /entities/cats/:catId route also mounts the EntitiesShell', () => {
  const markup = renderApp(
    '/entities/cats/cat-concierge',
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
            createdAt: '2026-01-01T00:00:00.000Z',
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

test('Drilled-down /entities/clowders/:id and /entities/catteries/:id routes both mount the EntitiesShell', () => {
  const envelope = createEnvelope({
    lobby: {
      animationMode: 'reduced',
      cats: [],
      clowders: [
        {
          id: 'clw-dev',
          name: 'Dev Team',
          avatarUrl: null,
          createdAt: '2026-01-02T00:00:00.000Z',
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
          createdAt: '2026-01-01T00:00:00.000Z',
          memberCount: 12,
          clowderCount: 3,
          catCount: 7,
        },
      ],
    },
  });

  const clowderMarkup = renderApp('/entities/clowders/clw-dev', envelope);
  assert.match(clowderMarkup, /<div[^>]*class="screen claudeShell"/u);
  assert.match(clowderMarkup, /<aside[^>]*class="sidebar"[^>]*data-shell-surface="lobby"/u);
  assert.match(clowderMarkup, />Dev Team</u);

  const catteryMarkup = renderApp('/entities/catteries/acme', envelope);
  assert.match(catteryMarkup, /<div[^>]*class="screen claudeShell"/u);
  assert.match(catteryMarkup, /<aside[^>]*class="sidebar"[^>]*data-shell-surface="lobby"/u);
  assert.match(catteryMarkup, />Acme Co\.</u);
});

test('Drilled-down /entities/clowders and /entities/catteries canvas routes both mount the EntitiesShell', () => {
  const envelope = createEnvelope({
    lobby: {
      animationMode: 'reduced',
      cats: [],
      clowders: [
        {
          id: 'clw-dev',
          name: 'Dev Team',
          avatarUrl: null,
          createdAt: '2026-01-02T00:00:00.000Z',
          parentCatteryId: 'acme',
          catCount: 5,
          memberCount: 8,
        },
        {
          id: 'clw-new',
          name: 'New Team',
          avatarUrl: null,
          createdAt: '2026-02-01T00:00:00.000Z',
          parentCatteryId: null,
          catCount: 1,
          memberCount: 2,
        },
      ],
      catteries: [
        {
          id: 'acme',
          name: 'Acme Co.',
          avatarUrl: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          memberCount: 12,
          clowderCount: 3,
          catCount: 7,
        },
        {
          id: 'beta',
          name: 'Beta Co.',
          avatarUrl: null,
          createdAt: '2026-02-01T00:00:00.000Z',
          memberCount: 3,
          clowderCount: 1,
          catCount: 2,
        },
      ],
    },
  });

  const clowdersMarkup = renderApp('/entities/clowders', envelope);
  assert.match(clowdersMarkup, /<div[^>]*class="screen claudeShell"/u);
  assert.match(clowdersMarkup, /class="entityCanvas entityCanvas--clowders"/u);
  assert.match(clowdersMarkup, /href="\/entities\/clowders\/clw-dev"/u);
  assert.match(clowdersMarkup, />New Team</u);
  assert.match(clowdersMarkup, />Parent Cattery</u);
  assert.match(clowdersMarkup, /href="\/entities\/catteries\/acme"/u);
  assert.match(clowdersMarkup, />My Clowders</u);
  const devClowderIndex = clowdersMarkup.indexOf('class="entityCanvasRowName">Dev Team');
  const newClowderIndex = clowdersMarkup.indexOf('class="entityCanvasRowName">New Team');
  assert.ok(devClowderIndex < newClowderIndex);

  const catteriesMarkup = renderApp('/entities/catteries', envelope);
  assert.match(catteriesMarkup, /<div[^>]*class="screen claudeShell"/u);
  assert.match(catteriesMarkup, /class="entityCanvas entityCanvas--catteries"/u);
  assert.match(catteriesMarkup, /href="\/entities\/catteries\/acme"/u);
  assert.match(catteriesMarkup, />Beta Co\.</u);
  assert.match(catteriesMarkup, />Formal Clowder</u);
  assert.match(catteriesMarkup, /href="\/entities\/clowders\/clw-dev"/u);
  assert.match(catteriesMarkup, />My Catteries</u);
  const acmeCatteryIndex = catteriesMarkup.indexOf('class="entityCanvasRowName">Acme Co.');
  const betaCatteryIndex = catteriesMarkup.indexOf('class="entityCanvasRowName">Beta Co.');
  assert.ok(acmeCatteryIndex < betaCatteryIndex);
});
