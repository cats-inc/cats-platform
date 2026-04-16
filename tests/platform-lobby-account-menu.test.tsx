import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { StaticRouter } from 'react-router-dom';

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
    setupCompleteAt: '2026-04-08T00:00:00.000Z',
    ownerDisplayName: 'Ken',
    ownerAvatarColor: null,
    ownerAvatarUrl: null,
    lastProductSurface: 'chat',
    guideCat: null,
    ...envelopeOverrides,
  };
}

test('PlatformLobby renders the shared account menu trigger in the top bar', () => {
  const markup = renderToStaticMarkup(
    <StaticRouter location="/lobby">
      <PlatformLobby envelope={createEnvelope()} />
    </StaticRouter>,
  );

  assert.match(markup, /class="lobbyIdentity"/u);
  assert.match(markup, /aria-haspopup="menu"/u);
  assert.match(markup, /aria-expanded="false"/u);
  assert.match(markup, />Ken</u);
  assert.doesNotMatch(markup, />Settings</u);
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
    executionLabel: 'Claude-CLI · Opus 4.7 with 1M context · xHigh (default)',
  });

  const markup = renderToStaticMarkup(
    <StaticRouter location="/lobby">
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
    </StaticRouter>,
  );

  assert.match(markup, /data-tooltip="Guide · Claude-CLI · Opus 4\.7 with 1M context · xHigh \(default\)"/u);
  clearRememberedExecutionLabels();
});
