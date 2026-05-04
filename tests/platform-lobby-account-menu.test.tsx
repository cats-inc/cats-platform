import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { StaticRouter } from 'react-router-dom';

import { GuideCatPlacementProvider } from '../src/app/renderer/GuideCatPlacementProvider.tsx';
import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { PlatformLobby } from '../src/app/renderer/PlatformLobby.tsx';
import type { PlatformHostEnvelope } from '../src/shared/platform-contract.ts';

function createEnvelope(
  overrides: Partial<PlatformHostEnvelope> = {},
): PlatformHostEnvelope {
  const { lobby: lobbyOverrides, ...envelopeOverrides } = overrides;
  return {
    app: {
      name: 'cats-platform',
      stage: 'phase-2-shell',
      runtimeBoundary: 'cats-runtime',
    },
    products: [
      {
        id: 'chat',
        surface: 'chat',
        routePrefix: '/chat',
        productName: 'Cats Chat',
        subtitle: 'Talk with your cats',
        group: 'home',
        installPolicy: 'required',
        installState: 'installed',
        maturity: 'active',
        setup: { selectable: true },
      },
    ],
    installedApps: [],
    desktop: {
      startAtLogin: false,
      openWindowOnStartup: true,
      systemTrayEnabled: true,
    },
    lobby: {
      animationMode: 'reduced',
      cats: [],
      ...(lobbyOverrides ?? {}),
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
      generatedAt: '2026-04-08T00:00:00.000Z',
      host: 'localhost',
      port: 8484,
    },
    bootstrapAttemptId: null,
    scopeId: 'scope-fixture',
    setupCompleteAt: '2026-04-08T00:00:00.000Z',
    ownerDisplayName: 'Ken',
    ownerAvatarColor: null,
    ownerAvatarUrl: null,
    lastProductSurface: 'chat',
    guideCat: null,
    ...envelopeOverrides,
  };
}

test('PlatformLobby renders the split-click account chrome in the top bar', () => {
  // The Lobby user chrome used to open an <AccountIdentityMenu> popup
  // (Settings / Environment). That popup is temporarily disabled in
  // favour of split-click routing: the main half goes to
  // /settings/general, the runtime sub-region goes to
  // /settings/runtime. Enforce both the new structural contract —
  // container + two real <button>s, no nested interactive markup —
  // and the absence of the old popup a11y attributes, so the popup
  // restoration in a later version is a deliberate, test-guided swap.
  const markup = renderToStaticMarkup(
    <StaticRouter location="/lobby">
      <GuideCatPlacementProvider
        guideCat={null}
        placement="floating"
        floatingAnchor={null}
        sidecarMode="auto"
        onPersistSeen={() => {}}
        onCommit={() => {}}
      >
        <PlatformLobby envelope={createEnvelope()} />
      </GuideCatPlacementProvider>
    </StaticRouter>,
  );

  // Container is a div with role="group"; two sibling <button>s sit
  // inside, each with their own aria-label for AT announcement.
  assert.match(markup, /<div class="lobbyIdentity" role="group"/u);
  assert.match(markup, /<button[^>]+class="lobbyIdentityMainButton"[^>]+aria-label="Open account settings"/u);
  assert.match(markup, /<button[^>]+class="lobbyIdentityRuntime"[^>]+aria-label="Runtime status: [^"]+"/u);
  assert.match(markup, />Ken</u);

  // Popup-menu artefacts must be gone from the identity pill — no more
  // aria-haspopup / aria-expanded inside lobbyIdentity, no Settings menu
  // item text. (The PLAN-091 phase 4 LobbySidebar adds its own
  // aria-expanded toggles for collapse/expand state — those are
  // unrelated to the identity-pill chrome and live in a separate region
  // of the page.)
  const identityRegion = markup.match(
    /<div class="lobbyIdentity" role="group"[\s\S]*?<\/div>/u,
  )?.[0] ?? '';
  assert.notEqual(identityRegion, '');
  assert.doesNotMatch(identityRegion, /aria-haspopup/u);
  assert.doesNotMatch(identityRegion, /aria-expanded/u);
  assert.doesNotMatch(identityRegion, />Settings</u);
});

test('PlatformLobby localizes runtime status chrome', () => {
  const markup = renderToStaticMarkup(
    <I18nProvider locale="zh-TW" languagePreference="zh-TW">
      <StaticRouter location="/lobby">
        <GuideCatPlacementProvider
          guideCat={null}
          placement="floating"
          floatingAnchor={null}
          sidecarMode="auto"
          onPersistSeen={() => {}}
          onCommit={() => {}}
        >
          <PlatformLobby envelope={createEnvelope()} />
        </GuideCatPlacementProvider>
      </StaticRouter>
    </I18nProvider>,
  );

  assert.match(
    markup,
    /<button[^>]+class="lobbyIdentityRuntime"[^>]+aria-label="執行階段狀態：Cats 執行階段已連線"/u,
  );
});

test('PlatformLobby localizes deterministic Guide Cat assist greetings', () => {
  const markup = renderToStaticMarkup(
    <I18nProvider locale="zh-TW" languagePreference="zh-TW">
      <StaticRouter location="/lobby">
        <GuideCatPlacementProvider
          guideCat={null}
          placement="floating"
          floatingAnchor={null}
          sidecarMode="auto"
          onPersistSeen={() => {}}
          onCommit={() => {}}
        >
          <PlatformLobby envelope={createEnvelope({
            lobby: {
              animationMode: 'reduced',
              cats: [],
              guideCatAssist: {
                scopeKey: 'lobby:default:default',
                renderSource: 'deterministic',
                cacheHit: false,
                missing: false,
                stale: false,
                refreshEligible: false,
                surfaceDisabled: false,
                lastFailure: null,
                bundle: {
                  bundleId: 'lobby:default:default',
                  scope: {
                    surfaceId: 'lobby',
                    surfaceMode: 'default',
                    audienceState: 'default',
                  },
                  content: {
                    greeting: 'Choose a surface and get moving.',
                    entryChips: [],
                  },
                  provenance: {
                    originMode: 'deterministic',
                    refreshContextHash: 'gca:v1:test',
                    missionId: null,
                    runId: null,
                  },
                  freshness: {
                    generatedAt: '2026-04-17T12:00:00.000Z',
                    expiresAt: null,
                    lastRefreshStatus: 'never',
                  },
                },
              },
            },
          })} />
        </GuideCatPlacementProvider>
      </StaticRouter>
    </I18nProvider>,
  );

  assert.match(markup, /選擇一個產品開始。/u);
  assert.doesNotMatch(markup, /Choose a surface and get moving\./u);
});

// PlatformLobby's runtime-backed cat tooltip (the LobbyCatRoster
// `data-tooltip` attribute) was retired in PLAN-091 phase 4 — the
// stacked avatars in the top bar are gone and the LobbySidebar surfaces
// cats as plain rows with names. Per AGENTS.md §Pre-Release
// Compatibility Policy, the dead test for the dead feature is removed
// cleanly. If a sidebar row tooltip lands later it gets its own test.

test('PlatformLobby prefers guide cat assist greeting from the platform envelope when present', () => {
  const markup = renderToStaticMarkup(
    <StaticRouter location="/lobby">
      <GuideCatPlacementProvider
        guideCat={null}
        placement="floating"
        floatingAnchor={null}
        sidecarMode="auto"
        onPersistSeen={() => {}}
        onCommit={() => {}}
      >
        <PlatformLobby envelope={createEnvelope({
          lobby: {
            animationMode: 'reduced',
            cats: [],
            guideCatAssist: {
              scopeKey: 'lobby:default:default',
              renderSource: 'cache',
              cacheHit: true,
              missing: false,
              stale: false,
              refreshEligible: false,
              surfaceDisabled: false,
              lastFailure: null,
              bundle: {
                bundleId: 'lobby:default:default',
                scope: {
                  surfaceId: 'lobby',
                  surfaceMode: 'default',
                  audienceState: 'default',
                },
                content: {
                  greeting: 'Cached lobby assist greeting.',
                  entryChips: [],
                },
                provenance: {
                  originMode: 'runtime',
                  refreshContextHash: 'gca:v1:test',
                  missionId: null,
                  runId: null,
                },
                freshness: {
                  generatedAt: '2026-04-17T12:00:00.000Z',
                  expiresAt: null,
                  lastRefreshStatus: 'ok',
                },
              },
            },
          },
        })} />
      </GuideCatPlacementProvider>
    </StaticRouter>,
  );

  assert.match(markup, /Cached lobby assist greeting\./u);
});
