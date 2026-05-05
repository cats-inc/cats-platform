import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { StaticRouter } from 'react-router-dom';

import {
  buildPlatformSettingsProductEntries,
} from '../src/app/renderer/settings/PlatformSettingsShell.tsx';
import { SettingsAppShellSidebar } from '../src/app/renderer/settings/SettingsAppShellSidebar.tsx';
import { GuideCatPlacementProvider } from '../src/app/renderer/GuideCatPlacementProvider.tsx';
import { I18nProvider } from '../src/app/renderer/i18n/I18nProvider.tsx';
import { createTranslator } from '../src/shared/i18n/index.ts';
import type { AppShellPayload } from '../src/products/shared/api/workspaceContracts.ts';
import type {
  PlatformHostEnvelope,
  PlatformProductDescriptor,
} from '../src/shared/platform-contract.ts';

function createProduct(overrides: Partial<PlatformProductDescriptor>): PlatformProductDescriptor {
  return {
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
    ...overrides,
  };
}

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
      generatedAt: '2026-04-29T00:00:00.000Z',
      host: 'localhost',
      port: 8484,
    },
    bootstrapAttemptId: null,
    scopeId: 'scope-fixture',
    setupCompleteAt: '2026-04-29T00:00:00.000Z',
    ownerDisplayName: 'Ken',
    ownerAvatarColor: null,
    ownerAvatarUrl: null,
    lastProductSurface: 'chat',
    guideCat: null,
    ...overrides,
  } as PlatformHostEnvelope;
}

test('buildPlatformSettingsProductEntries flattens visible product settings entries', () => {
  const entries = buildPlatformSettingsProductEntries([
    createProduct({
      id: 'chat',
      productName: 'Cats Chat',
      settings: [
        {
          id: 'chat',
          label: 'Chat',
          path: '/settings/chat',
        },
      ],
    }),
    createProduct({
      id: 'invest',
      surface: null,
      routePrefix: '/invest',
      productName: 'Cats Invest',
      group: 'office',
      installPolicy: 'optional',
      installState: 'attention',
      settings: [
        {
          id: 'general',
          label: 'Invest',
          path: '/invest/settings/general',
        },
      ],
    }),
    createProduct({
      id: 'learn',
      surface: null,
      routePrefix: '/learn',
      productName: 'Cats Learn',
      group: 'home',
      installPolicy: 'optional',
      installState: 'available',
      settings: [
        {
          id: 'general',
          label: 'Learn',
          path: '/learn/settings/general',
        },
      ],
    }),
    createProduct({
      id: 'work',
      surface: 'work',
      routePrefix: '/work',
      productName: 'Cats Work',
      group: 'office',
      maturity: 'preview',
    }),
  ]);

  assert.deepEqual(entries, [
    {
      productId: 'chat',
      id: 'chat',
      label: 'Chat',
      path: '/settings/chat',
    },
    {
      productId: 'invest',
      id: 'general',
      label: 'Invest',
      path: '/invest/settings/general',
    },
  ]);
});

test('buildPlatformSettingsProductEntries localizes Cats-owned product settings labels', () => {
  const entries = buildPlatformSettingsProductEntries([
    createProduct({
      id: 'chat',
      productName: 'Cats Chat',
      settings: [
        {
          id: 'chat',
          label: 'Chat',
          path: '/settings/chat',
        },
      ],
    }),
    createProduct({
      id: 'code',
      surface: 'code',
      routePrefix: '/code',
      productName: 'Cats Code',
      settings: [
        {
          id: 'code',
          label: 'Code',
          path: '/settings/code',
        },
      ],
    }),
    createProduct({
      id: 'invest',
      surface: null,
      routePrefix: '/invest',
      productName: 'Cats Invest',
      group: 'office',
      installPolicy: 'optional',
      installState: 'attention',
      settings: [
        {
          id: 'general',
          label: 'Invest',
          path: '/invest/settings/general',
        },
      ],
    }),
  ], createTranslator('zh-TW'));

  assert.deepEqual(entries.map((entry) => entry.label), ['Chat', 'Code', 'Invest']);
});

test('SettingsAppShellSidebar places Apps under Work and above Runtime', () => {
  const previousBridge = (globalThis as typeof globalThis & {
    catsDesktopHost?: object;
  }).catsDesktopHost;
  (globalThis as typeof globalThis & {
    catsDesktopHost?: object;
  }).catsDesktopHost = {};
  const liveSettingsPayload = createEnvelope({
    products: [
      createProduct({
        id: 'chat',
        productName: 'Cats Chat',
        settings: [
          {
            id: 'chat',
            label: 'Chat',
            path: '/settings/chat',
          },
        ],
      }),
      createProduct({
        id: 'code',
        surface: 'code',
        routePrefix: '/code',
        productName: 'Cats Code',
        group: 'office',
        settings: [
          {
            id: 'code',
            label: 'Code',
            path: '/settings/code',
          },
        ],
      }),
      createProduct({
        id: 'work',
        surface: 'work',
        routePrefix: '/work',
        productName: 'Cats Work',
        group: 'office',
        settings: [
          {
            id: 'work',
            label: 'Work',
            path: '/settings/work',
          },
        ],
      }),
    ],
  }) as unknown as AppShellPayload;

  const markup = renderToStaticMarkup(
    <I18nProvider locale="en">
      <StaticRouter location="/settings/desktop">
        <GuideCatPlacementProvider
          guideCat={null}
          placement="floating"
          floatingAnchor={null}
          sidecarMode="auto"
          onPersistSeen={() => {}}
          onCommit={() => {}}
        >
          <SettingsAppShellSidebar
            envelope={createEnvelope()}
            settingsPayload={liveSettingsPayload}
            sidebarOpen={true}
            onToggleSidebar={() => {}}
            onCollapsedSidebarClick={() => {}}
          />
        </GuideCatPlacementProvider>
      </StaticRouter>
    </I18nProvider>,
  );

  try {
    const codeIndex = markup.indexOf('>Code<');
    const workIndex = markup.indexOf('>Work<');
    const appsIndex = markup.indexOf('>Apps<');
    const desktopIndex = markup.indexOf('>Desktop<');
    const runtimeIndex = markup.indexOf('>Runtime<');
    assert.ok(codeIndex >= 0, 'expected Code nav entry');
    assert.ok(workIndex >= 0, 'expected Work nav entry');
    assert.ok(appsIndex >= 0, 'expected Apps nav entry');
    assert.ok(desktopIndex >= 0, 'expected Desktop nav entry');
    assert.ok(runtimeIndex >= 0, 'expected Runtime nav entry');
    assert.ok(codeIndex < workIndex, 'expected Work after Code');
    assert.ok(workIndex < appsIndex, 'expected Apps after Work');
    assert.ok(appsIndex < runtimeIndex, 'expected Apps before Runtime');
    assert.ok(appsIndex < desktopIndex, 'expected Apps before Desktop in desktop mode');
    assert.ok(desktopIndex < runtimeIndex, 'expected Desktop before Runtime');
  } finally {
    if (previousBridge === undefined) {
      delete (globalThis as typeof globalThis & { catsDesktopHost?: object }).catsDesktopHost;
    } else {
      (globalThis as typeof globalThis & {
        catsDesktopHost?: object;
      }).catsDesktopHost = previousBridge;
    }
  }
});
