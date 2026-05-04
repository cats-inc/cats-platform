import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { StaticRouter } from 'react-router-dom';

import { GuideCatPlacementProvider } from '../src/app/renderer/GuideCatPlacementProvider.tsx';
import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { PlatformLobby } from '../src/app/renderer/PlatformLobby.tsx';
import type { PlatformHostEnvelope } from '../src/shared/platform-contract.ts';
import {
  clearRememberedExecutionLabels,
  rememberExecutionLabel,
} from '../src/shared/executionLabel.ts';

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

  // Popup-menu artefacts must be gone — no more aria-haspopup / aria-
  // expanded, no Settings menu item text.
  assert.doesNotMatch(markup, /aria-haspopup/u);
  assert.doesNotMatch(markup, /aria-expanded/u);
  assert.doesNotMatch(markup, />Settings</u);
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

test('PlatformLobby reuses remembered runtime-backed labels for lobby cat tooltips', () => {
  clearRememberedExecutionLabels();
  rememberExecutionLabel({
    provider: 'claude',
    instance: 'cli/native',
    model: 'opus',
    modelSelection: {
      controls: {
        'claude.reasoning_effort': 'xhigh',
      },
    },
    executionLabel: 'Claude-CLI · Opus 4.7 with 1M context · xHigh',
  });

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
            cats: [
              {
                id: 'cat-guide',
                name: 'Guide',
                avatarColor: '#7A5B3A',
                avatarUrl: null,
                isBoss: false,
                defaultExecutionTarget: {
                  provider: 'claude',
                  instance: 'cli/native',
                  model: 'opus',
                },
                defaultModelSelection: {
                  entryMode: 'explicit',
                  controls: {
                    'claude.reasoning_effort': 'xhigh',
                  },
                },
                executionLabel: null,
              },
            ],
          },
        })} />
      </GuideCatPlacementProvider>
    </StaticRouter>,
  );

  assert.match(markup, /data-tooltip="Guide · Claude-CLI · Opus 4\.7 with 1M context · xHigh"/u);
  clearRememberedExecutionLabels();
});

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
