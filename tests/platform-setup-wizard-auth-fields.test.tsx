import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { PlatformSetupWizard } from '../src/app/renderer/setup/index.ts';
import type { PlatformHostEnvelope } from '../src/shared/platform-contract.ts';

test('setup wizard separates owner profile name from first-admin credentials', () => {
  const markup = renderToStaticMarkup(
    <I18nProvider locale="en">
      <PlatformSetupWizard envelope={createEnvelope()} onComplete={() => {}} />
    </I18nProvider>,
  );

  assert.match(markup, /Your name/u);
  assert.match(markup, /Admin login email/u);
  assert.match(markup, /Admin password/u);
  assert.match(markup, /Use these credentials to sign in after setup/u);
  assert.match(markup, /type="password"/u);
  assert.match(markup, /autoComplete="new-password"/u);
});

function createEnvelope(): PlatformHostEnvelope {
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
      mobilePairing: {
        enabled: false,
        bindHost: '127.0.0.1',
        bindPort: 8181,
        bindReachability: 'loopback',
        canReachFromLan: false,
        selectedLanIp: null,
        selectedLanUrl: null,
        diagnosticManifestUrl: null,
        noLanCandidateReason: 'feature_disabled',
        bindOverrideEnv: null,
        pairingUrlStatus: 'phase1_pending',
        pairingUrl: null,
      },
    },
    language: {
      uiLanguagePreference: 'en',
      assistantLanguagePreference: 'unspecified',
    },
    lobby: {
      animationMode: 'reduced',
      cats: [],
      clowders: [],
      catteries: [],
      guideCatAssist: null,
    },
    guideCatAssist: {
      codeNewDraft: null,
    },
    runtime: {
      baseUrl: 'http://127.0.0.1:3110',
      reachable: false,
      status: 'unavailable',
      service: 'cats-runtime',
    },
    runtimeSetup: {
      source: 'runtime',
      bootstrapRequired: true,
      status: 'attention',
      stateStatus: 'unknown',
      summary: 'Runtime not configured',
      scannedAt: null,
      lastManualScanAt: null,
      appliedAt: null,
      providerCount: 0,
      availableCount: 0,
      providersReadyToApply: [],
      providersNeedingAttention: [],
      suggestedProviders: [],
      canRunManualScan: false,
      canApply: false,
      error: null,
    },
    metadata: {
      generatedAt: '2026-05-10T00:00:00.000Z',
      host: '127.0.0.1',
      port: 8181,
    },
    bootstrapAttemptId: 'attempt-1',
    scopeId: 'scope-1',
    setupCompleteAt: null,
    ownerDisplayName: '',
    ownerAvatarColor: null,
    ownerAvatarUrl: null,
    lastProductSurface: null,
    guideCat: null,
  };
}
