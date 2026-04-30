import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { StaticRouter } from 'react-router-dom';

import { PlatformSettingsDesktopStartup } from '../src/app/renderer/settings/PlatformSettingsDesktopStartup.tsx';
import type { AppShellPayload } from '../src/products/chat/api/contracts.ts';

function createMobilePairing(
  overrides: Partial<AppShellPayload['desktop']['mobilePairing']> = {},
): AppShellPayload['desktop']['mobilePairing'] {
  return {
    enabled: false,
    bindHost: '127.0.0.1',
    bindPort: 8181,
    bindReachability: 'loopback',
    canReachFromLan: false,
    selectedLanIp: null,
    selectedLanUrl: null,
    diagnosticManifestUrl: null,
    noLanCandidateReason: 'feature_disabled',
    bindOverrideEnv: 'CATS_DESKTOP_APP_HOST=0.0.0.0',
    pairingUrlStatus: 'phase1_pending',
    pairingUrl: null,
    ...overrides,
  };
}

function createPayload(
  desktopOverrides: Partial<AppShellPayload['desktop']> = {},
): AppShellPayload {
  return {
    setupCompleteAt: '2026-04-05T00:00:00.000Z',
    ownerDisplayName: 'Kenny',
    ownerAvatarColor: null,
    ownerAvatarUrl: null,
    guideCat: null,
    lastProductSurface: 'chat',
    desktop: {
      startAtLogin: true,
      openWindowOnStartup: false,
      systemTrayEnabled: true,
      mobilePairing: createMobilePairing(),
      ...desktopOverrides,
    },
    lobby: {
      animationMode: 'reduced',
      cats: [],
    },
    products: [
      {
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
      },
      {
        id: 'code',
        surface: 'code',
        routePrefix: '/code',
        productName: 'Cats Code',
        subtitle: 'Repos, runs, and codespaces',
        group: 'office',
        installPolicy: 'required',
        installState: 'installed',
        maturity: 'preview',
        setup: {
          selectable: true,
        },
      },
    ],
    chat: {
      showVerboseMessages: false,
    },
    runtime: {
      baseUrl: 'http://127.0.0.1:3110',
      reachable: true,
      status: 'ok',
      service: 'cats-runtime',
    },
    runtimeSetup: {
      source: 'runtime',
      bootstrapRequired: false,
      status: 'ready',
      stateStatus: 'ready',
      summary: 'Runtime ready',
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
      generatedAt: '2026-04-05T00:00:00.000Z',
      host: '127.0.0.1',
      port: 8181,
    },
    bootstrapAttemptId: null,
  } as unknown as AppShellPayload;
}

test('PlatformSettingsDesktopStartup renders desktop controls with system tray before window opening', () => {
  const previousBridge = (globalThis as typeof globalThis & {
    catsDesktopHost?: object;
  }).catsDesktopHost;
  (globalThis as typeof globalThis & {
    catsDesktopHost?: object;
  }).catsDesktopHost = {};

  const markup = renderToStaticMarkup(
    <StaticRouter location="/settings/desktop">
      <PlatformSettingsDesktopStartup
        payload={createPayload()}
        onPayloadUpdate={() => {}}
      />
    </StaticRouter>,
  );

  try {
    // Shell title (`>Desktop<`) is no longer rendered by the page body;
    // PlatformSettingsRoutes owns the shell wrapper. Body-only assertions here.
    assert.match(markup, /Start Cats Desktop when you sign in to your computer/u);
    assert.match(markup, /Keep Cats in the system tray when you close the window/u);
    assert.match(markup, /Open Cats after sign-in startup/u);
    assert.match(markup, /When enabled, closing the window hides Cats and keeps it running\./u);
    assert.ok(
      markup.indexOf('Keep Cats in the system tray when you close the window')
        < markup.indexOf('Open Cats after sign-in startup'),
      'expected system tray option before window opening option',
    );
  } finally {
    if (previousBridge === undefined) {
      delete (globalThis as typeof globalThis & { catsDesktopHost?: object }).catsDesktopHost;
    } else {
      (globalThis as typeof globalThis & { catsDesktopHost?: object }).catsDesktopHost = previousBridge;
    }
  }
});

test('PlatformSettingsDesktopStartup can enable mobile pairing when the payload gate is disabled', () => {
  const markup = renderToStaticMarkup(
    <StaticRouter location="/settings/desktop">
      <PlatformSettingsDesktopStartup
        payload={createPayload()}
        onPayloadUpdate={() => {}}
      />
    </StaticRouter>,
  );

  assert.match(markup, /Mobile pairing/u);
  assert.match(markup, /Disabled/u);
  assert.match(markup, /Enable mobile pairing/u);
  assert.match(markup, /Restart Cats Desktop after applying/u);
});

test('PlatformSettingsDesktopStartup shows loopback-only mobile pairing recovery', () => {
  const markup = renderToStaticMarkup(
    <StaticRouter location="/settings/desktop">
      <PlatformSettingsDesktopStartup
        payload={createPayload({
          mobilePairing: createMobilePairing({
            enabled: true,
            noLanCandidateReason: 'loopback_bound',
            bindOverrideEnv: 'CATS_DESKTOP_APP_HOST=0.0.0.0',
          }),
        })}
        onPayloadUpdate={() => {}}
      />
    </StaticRouter>,
  );

  assert.match(markup, /Mobile pairing/u);
  assert.match(markup, /Loopback only/u);
  assert.match(markup, /Apply and restart/u);
  assert.match(markup, /CATS_DESKTOP_APP_HOST=0\.0\.0\.0/u);
  assert.doesNotMatch(markup, /Diagnostic manifest/u);
});

test('PlatformSettingsDesktopStartup shows diagnostic manifest when LAN-ready', () => {
  const markup = renderToStaticMarkup(
    <StaticRouter location="/settings/desktop">
      <PlatformSettingsDesktopStartup
        payload={createPayload({
          mobilePairing: createMobilePairing({
            enabled: true,
            bindHost: '0.0.0.0',
            bindReachability: 'all_interfaces',
            canReachFromLan: true,
            selectedLanIp: '192.168.1.25',
            selectedLanUrl: 'http://192.168.1.25:8181',
            diagnosticManifestUrl: 'http://192.168.1.25:8181/api/mobile/manifest',
            noLanCandidateReason: null,
            bindOverrideEnv: null,
            pairingUrlStatus: 'ready',
            pairingUrl: 'exp://192.168.1.25:8181',
          }),
        })}
        onPayloadUpdate={() => {}}
      />
    </StaticRouter>,
  );

  assert.match(markup, /Mobile pairing/u);
  assert.match(markup, /192\.168\.1\.25/u);
  assert.match(markup, /Diagnostic manifest/u);
  assert.match(markup, /http:\/\/192\.168\.1\.25:8181\/api\/mobile\/manifest/u);
  assert.match(markup, /Expo Go URL/u);
  assert.match(markup, /exp:\/\/192\.168\.1\.25:8181/u);
  assert.match(markup, /Mobile pairing QR code/u);
  assert.doesNotMatch(markup, /QR pending/u);
  assert.doesNotMatch(markup, /Apply and restart/u);
});
