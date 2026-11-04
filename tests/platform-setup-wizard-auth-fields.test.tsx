import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { clearProviderRegistryClientCache } from '../src/app/renderer/providerRegistryClient.ts';
import { clearProviderCatalogClientCache } from '../src/app/renderer/providerCatalogClient.ts';
import { listProductProviders } from '../src/shared/providerCatalog.ts';
import { createFixtureProviderModelCatalog, createFixtureProviderAdvancedCatalog } from './helpers/catalogFixture.js';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { PlatformSetupWizard } from '../src/app/renderer/setup/index.ts';
import type { PlatformHostEnvelope } from '../src/shared/platform-contract.ts';

test('setup wizard separates owner profile name from first-admin credentials', (t) => {
  resetTestDom();
  t.after(() => { cleanup(); resetTestDom(); });
  const view = render(
    <I18nProvider locale="en">
      <PlatformSetupWizard envelope={createEnvelope()} onComplete={() => {}} />
    </I18nProvider>,
  );
  const markup = view.container.innerHTML;

  assert.match(markup, /Your name/u);
  assert.match(markup, /Admin login email/u);
  assert.match(markup, /Admin password/u);
  assert.match(markup, /You use it to sign in to Cats/u);
  assert.match(markup, /type="password"/u);
  assert.match(markup, /autocomplete="new-password"/u);
});

test('Catlas: the tool list chooses the tool, a user override holds, and the shown target is submitted', async (t) => {
  resetTestDom(); clearProviderRegistryClientCache(); clearProviderCatalogClientCache();
  const originalFetch = globalThis.fetch;
  const submitted: Array<Record<string, unknown>> = [];
  const requests: string[] = [];
  let completed = false;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push(url);
    if (url === '/api/providers') return Response.json({ state: 'ready', providers: listProductProviders().filter(p => p.id === 'codex' || p.id === 'claude') });
    const catalog = /^\/api\/providers\/(codex|claude)\/models(\/advanced)?/u.exec(url);
    // A catalog answers for the target it was asked about, as the real route does.
    if (catalog) return Response.json({ catalog: catalog[2]
      ? createFixtureProviderAdvancedCatalog(catalog[1], { instance: 'cli/native' })
      : createFixtureProviderModelCatalog(catalog[1], { instance: 'cli/native' }) });
    if (url === '/api/platform/setup/complete') {
      submitted.push(JSON.parse(String(init?.body)));
      return Response.json({ ...createEnvelope(), setupCompleteAt: '2099-01-01T00:00:00.000Z' });
    }
    return Response.json({});
  }) as typeof fetch;
  t.after(() => { cleanup(); resetTestDom(); globalThis.fetch = originalFetch;
    clearProviderRegistryClientCache(); clearProviderCatalogClientCache(); });
  const view = render(<I18nProvider locale="en"><PlatformSetupWizard envelope={createEnvelope()} onComplete={() => { completed = true; }} /></I18nProvider>);
  fireEvent.change(view.getByLabelText('Your name'), { target: { value: 'Test' } });
  fireEvent.change(view.getByLabelText('Admin login email'), { target: { value: 'test@example.test' } });
  fireEvent.change(view.getByLabelText('Admin password'), { target: { value: 'fixture-password' } });
  fireEvent.click(view.getByRole('button', { name: 'Next' }));
  const tool = (id: string) => view.container.querySelector(`#setup-guide-${id}`) as HTMLInputElement;
  await waitFor(() => assert.ok(tool('codex')));
  assert.equal(view.queryByRole('combobox', { name: 'Provider' }), null);
  fireEvent.click(tool('claude'));
  await waitFor(() => assert.equal(tool('claude').checked, true));
  fireEvent.click(view.container.querySelector('#setup-guide-off') as HTMLInputElement);
  fireEvent.click(view.container.querySelector('#setup-guide-on') as HTMLInputElement);
  await waitFor(() => assert.equal(tool('claude').checked, true));
  fireEvent.click(tool('codex'));
  const entryId = createFixtureProviderAdvancedCatalog('codex').entries[0].id;
  const model = () => view.getByRole('combobox', { name: /^Model/ }) as HTMLSelectElement;
  await waitFor(() => assert.ok([...model().options].some(option => option.value === entryId),
    JSON.stringify({ requests, modelOptions: [...model().options].map(option => [option.value, option.text]) })));
  fireEvent.change(model(), { target: { value: entryId } });
  const finish = () => view.container.querySelector('.setupPrimaryButton') as HTMLButtonElement;
  await waitFor(() => assert.equal(finish().disabled, false));
  fireEvent.click(finish());
  await waitFor(() => assert.equal(completed, true));
  assert.equal(submitted.at(-1)?.guideCatProvider, 'codex');
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
      assistantResponseLanguage: 'unspecified',
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
      status: 'attention_required',
      stateStatus: 'pending',
      summary: 'Runtime not configured',
      scannedAt: null,
      lastManualScanAt: null,
      appliedAt: null,
      providerCount: 0,
      availableCount: 0,
      providersReady: [],
      providersNeedingAttention: [],
      selectedProviders: [],
      canRunManualScan: false,
      canManageSelection: false,
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
