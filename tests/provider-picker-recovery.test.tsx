import { resetTestDom, testDomWindow } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React from 'react';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { ProviderModelBrainCard } from '../src/design/components/ProviderModelBrainCard.tsx';
import { PlatformSetupWizard } from '../src/app/renderer/setup/PlatformSetupWizard.tsx';
import { startProviderReadLoop } from '../src/app/renderer/providerReadLoop.ts';
import { useProviderCatalogState } from '../src/design/components/useProviderCatalogState.ts';
import { refreshProviderModelCatalogs } from '../src/products/shared/renderer/api/providers.ts';
import { normalizeProviderModelCatalog, normalizeProviderAdvancedModelCatalog } from '../src/shared/providerCatalog.ts';
import {
  clearProviderRegistryClientCache, fetchProviderRegistryFromClientCache,
} from '../src/app/renderer/providerRegistryClient.ts';
import {
  fetchProviderAdvancedCatalogFromClientCache, fetchProviderModelCatalogFromClientCache,
  refreshProviderCatalogClientCache,
} from '../src/app/renderer/providerCatalogClient.ts';
import type { ProviderTargetSelection } from '../src/shared/providerSelection.ts';
import type { PlatformHostEnvelope } from '../src/shared/platform-contract.ts';

// Async act in esbuild's ESM bundle leaks React MessageChannel ports. Drain
// real event-loop turns instead; the deterministic clock only owns retry timers.
async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn++) await nextTurn();
}

function installClock(t: TestContext) {
  resetTestDom();
  clearProviderRegistryClientCache();
  let now = Date.parse('2026-09-18T00:00:00Z');
  let visible = true;
  let nextId = 0;
  const timers = new Map<number, { callback: () => void; at: number }>();
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'setTimeout', (callback: () => void, delay = 0) => {
    timers.set(++nextId, { callback, at: now + delay });
    return nextId;
  });
  t.mock.method(globalThis, 'clearTimeout', (id: number) => timers.delete(id));
  Object.defineProperty(document, 'visibilityState', {
    configurable: true, get: () => visible ? 'visible' : 'hidden',
  });
  t.after(() => { cleanup(); clearProviderRegistryClientCache(); Reflect.deleteProperty(document, 'visibilityState'); });
  return {
    timers,
    async advance(ms: number) {
      now += ms;
      act(() => {
        for (const [id, timer] of [...timers]) {
          if (timer.at <= now && timers.delete(id)) timer.callback();
        }
      });
      await settle();
    },
    async visibility(value: boolean) {
      visible = value;
      act(() => { document.dispatchEvent(new testDomWindow.Event('visibilitychange')); });
      await settle();
    },
  };
}

function catalog(provider: string, instance: string | null, model = 'model-a') {
  return { provider, instance, backend: 'cli', defaultModel: model, source: 'dynamic', cache: null,
    models: [{ id: model, label: model, default: true }],
    entries: [{ id: model, label: model, default: true }],
    presets: [], controls: [], defaultSelection: { entryId: model, entryMode: 'explicit' },
    support: { tier: 'full', notes: [] }, warnings: [] };
}

function api() {
  const state = { registryFailures: 0, modelFailures: 0, advancedFailures: 0,
    registryCalls: 0, modelCalls: 0, advancedCalls: 0, revision: 'one', selected: true,
    revalidating: false, emptyCatalog: false };
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/providers') {
      state.registryCalls++;
      if (state.registryFailures-- > 0) throw new Error('The operation was aborted due to timeout');
      return Response.json({ revision: state.revision, state: state.selected ? 'ready' : 'no_usable_targets',
        providers: state.selected ? [{ id: 'claude', label: 'Claude', defaultInstance: 'native', defaultBackend: 'cli',
          instances: [{ id: 'native', backend: 'cli', target: 'cli/native', label: 'Native', default: true }],
          modelsPath: '/api/providers/claude/models' }] : [],
        warnings: state.revalidating
          ? ['Using cached provider targets because runtime refresh failed: timeout'] : [],
        recovery: { openRuntimeSetupPath: '/runtime/setup', retryable: true } });
    }
    const advanced = url.pathname.endsWith('/advanced');
    if (advanced) state.advancedCalls++; else state.modelCalls++;
    if ((advanced ? state.advancedFailures-- : state.modelFailures--) > 0) {
      throw new Error('The operation was aborted due to timeout');
    }
    return Response.json({ catalog: { ...catalog('claude', url.searchParams.get('instance')),
      ...(state.emptyCatalog ? { models: [], entries: [], defaultModel: null, defaultSelection: null } : {}),
      warnings: state.revalidating
        ? ['Using cached model catalog because runtime refresh failed: timeout'] : [] } });
  };
  const props = {
    provider: 'claude', instance: 'cli/native', model: 'model-a',
    onTargetChange: (_target: ProviderTargetSelection) => {},
    fetchProviderRegistry: () => fetchProviderRegistryFromClientCache({ fetchImpl }),
    fetchProviderModels: (provider: string, instance?: string | null) =>
      fetchProviderModelCatalogFromClientCache({ provider, instance, fetchImpl }),
    fetchAdvancedProviderModels: (provider: string, instance?: string | null) =>
      fetchProviderAdvancedCatalogFromClientCache({ provider, instance, fetchImpl }),
  };
  return { state, props, fetchImpl };
}

function assertNoManualRecovery(container: HTMLElement) {
  assert.doesNotMatch(container.textContent ?? '', /aborted|timeout|Retry|Runtime setup|重試|執行階段設定/i);
  assert.equal(container.querySelectorAll('button, a').length, 0);
}

test('catalog refresh without a selected provider never starts a loading spinner or request', async (t) => {
  installClock(t);
  const noModels = async () => { throw new Error('no target must make no request'); };
  function Probe() {
    const state = useProviderCatalogState({ provider: '', resolvedInstance: '', hasSelectedProvider: false,
      fetchProviderModels: noModels, fetchAdvancedProviderModels: noModels });
    return <output>{String(state.catalogLoading)}</output>;
  }
  const view = render(<Probe />); await settle();
  assert.equal(view.container.textContent, 'false');
  act(() => { refreshProviderCatalogClientCache(); }); await settle();
  assert.equal(view.container.textContent, 'false');
});

test('a mounted picker keeps a coherent snapshot while base and advanced revisions or activations differ', async (t) => {
  const clock = installClock(t);
  let baseRevision = 'one'; let advancedRevision = 'one';
  let baseActivation = 'a'; let advancedActivation = 'a';
  const fetchModels = async () => normalizeProviderModelCatalog({ catalog: {
    ...catalog('claude', 'cli/native', baseRevision), catalogRevision: baseRevision, catalogActivationId: baseActivation,
  } }, 'claude');
  const fetchAdvanced = async () => normalizeProviderAdvancedModelCatalog({ catalog: {
    ...catalog('claude', 'cli/native', advancedRevision), catalogRevision: advancedRevision, catalogActivationId: advancedActivation,
  } }, 'claude');
  function Probe() {
    const state = useProviderCatalogState({ provider: 'claude', resolvedInstance: 'cli/native', hasSelectedProvider: true,
      fetchProviderModels: fetchModels, fetchAdvancedProviderModels: fetchAdvanced });
    return <output>{JSON.stringify([state.effectiveCatalog.catalogRevision, state.effectiveAdvancedCatalog.catalogRevision,
      state.effectiveCatalog.catalogActivationId, state.effectiveAdvancedCatalog.catalogActivationId])}</output>;
  }
  const view = render(<Probe />);
  await settle();
  assert.equal(view.container.textContent, '["one","one","a","a"]');
  baseRevision = 'two'; baseActivation = 'b';
  await clock.advance(60_000);
  assert.equal(view.container.textContent, '["one","one","a","a"]');
  advancedRevision = 'two';
  await clock.advance(2_000);
  assert.equal(view.container.textContent, '["one","one","a","a"]', 'same revision alone does not identify an activation');
  advancedActivation = 'b';
  await clock.advance(4_000);
  assert.equal(view.container.textContent, '["two","two","b","b"]');
  baseRevision = advancedRevision = 'three';
  baseActivation = advancedActivation = 'c';
  t.mock.method(globalThis, 'fetch', async () => Response.json({ refreshed: 1, failures: [] }));
  await refreshProviderModelCatalogs();
  await settle();
  assert.equal(view.container.textContent, '["three","three","c","c"]', 'explicit refresh updates mounted pickers without waiting 60 seconds');
});

for (const authStatus of [401, 403]) {
  test(`first setup step 2 automatically recovers from ${authStatus}, registry and model timeouts`, async (t) => {
    const clock = installClock(t);
    const { state, fetchImpl } = api();
    state.registryFailures = state.modelFailures = state.advancedFailures = 1;
    let authFailures = 1;
    let providerReads = 0;
    t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const pathname = new URL(String(input), 'http://localhost').pathname;
      if (pathname === '/api/platform/bootstrap-diagnostics/opened') return Response.json({});
      if (pathname === '/api/providers') {
        providerReads++;
        if (authFailures-- > 0) return Response.json({ error: { message: 'Authentication is required.' } }, { status: authStatus });
      }
      assert.ok(pathname.startsWith('/api/providers'), 'verification must not submit setup or write user state');
      return fetchImpl(input, init);
    });
    // Deliberately partial: this renderer only reads the attempt ID and Runtime
    // reachability. All HTTP calls are stubbed; no host or persisted state exists.
    const envelope = { bootstrapAttemptId: 'isolated-recovery', runtime: { reachable: false } } as PlatformHostEnvelope;
    const view = render(<I18nProvider locale="en"><PlatformSetupWizard envelope={envelope} onComplete={() => {}} /></I18nProvider>);
    fireEvent.change(view.getByRole('textbox', { name: 'Your name' }), { target: { value: 'Test Owner' } });
    fireEvent.change(view.getByRole('textbox', { name: 'Admin login email' }), { target: { value: 'owner@example.test' } });
    fireEvent.change(view.getByLabelText('Admin password'), { target: { value: 'test-password' } });
    fireEvent.click(view.getByRole('button', { name: 'Get started' }));
    await settle();
    assert.equal(providerReads, 0, 'Guide Cat opt-in owns provider reads');
    fireEvent.click(view.getByRole('checkbox', { name: /Enable Catlas/ }));
    await settle();
    function assertAutomaticRecovery() {
      assert.doesNotMatch(view.container.textContent ?? '', /Authentication is required|aborted|timeout|Retry|Runtime setup/i);
      assert.equal(view.queryByRole('button', { name: /retry|runtime/i }), null);
      assert.equal(view.container.querySelectorAll('a').length, 0);
      assert.ok(view.container.querySelector('[role="status"] .providerPickerSpinner'));
    }
    assert.equal(providerReads, 1, 'wizard prefetch and picker share the same request');
    assertAutomaticRecovery();
    await clock.advance(2_000);
    assertAutomaticRecovery();
    await clock.advance(4_000);
    assertAutomaticRecovery();
    await clock.advance(2_000);
    assert.equal((view.getByRole('combobox', { name: 'Provider' }) as HTMLSelectElement).value, 'claude');
    assert.equal((view.getByRole('combobox', { name: /Model/ }) as HTMLSelectElement).value, 'model-a');
    assert.equal(view.container.querySelectorAll('[role="status"]').length, 0);
    assert.equal((view.getByRole('button', { name: 'Open Cats' }) as HTMLButtonElement).disabled, false);
    const calls = providerReads;
    fireEvent.click(view.getByRole('checkbox', { name: /Enable Catlas/ }));
    await clock.advance(60_000);
    assert.equal(providerReads, calls, 'disabling Guide Cat stops recovery reads');
    assert.equal(clock.timers.size, 0);
  });
}

test('cold picker retries consecutive timeouts automatically and replaces its spinner with data', async (t) => {
  const clock = installClock(t);
  const { state, props } = api();
  state.registryFailures = 2;
  const view = render(<I18nProvider locale="en"><ProviderModelBrainCard {...props} /></I18nProvider>);
  await settle();
  assertNoManualRecovery(view.container);
  assert.ok(view.container.querySelector('[role="status"] .providerPickerSpinner'));
  await clock.advance(2_000);
  assert.equal(state.registryCalls, 2);
  assertNoManualRecovery(view.container);
  await clock.advance(4_000);
  assert.equal(state.registryCalls, 3);
  assert.equal(view.getByRole('combobox', { name: 'Provider' }).getAttribute('disabled'), null);
  assert.ok(view.container.querySelector('option[value="model-a"]'));
  assert.equal(view.container.querySelectorAll('[role="status"]').length, 0);
});

test('base models remain selectable while only the failed advanced request retries', async (t) => {
  const clock = installClock(t);
  const { state, props } = api();
  state.advancedFailures = 2;
  const view = render(<I18nProvider locale="en"><ProviderModelBrainCard {...props} /></I18nProvider>);
  await settle();
  const model = view.getByRole('combobox', { name: /Model/ }) as HTMLSelectElement;
  assert.equal(model.disabled, false);
  assert.equal(model.value, 'model-a');
  assert.ok(view.container.querySelector('[role="status"]'));
  await clock.advance(2_000);
  assert.equal(state.modelCalls, 1);
  assert.equal(state.advancedCalls, 2);
  assert.equal(model.value, 'model-a');
  await clock.advance(4_000);
  assert.equal(state.advancedCalls, 3);
  assert.equal(view.container.querySelectorAll('[role="status"]').length, 0);
  assertNoManualRecovery(view.container);
});

test('reopening after a day retains choices and a custom model through a failed refresh', async (t) => {
  const clock = installClock(t);
  const { state, props } = api();
  await props.fetchProviderRegistry();
  await props.fetchProviderModels('claude', 'cli/native');
  await props.fetchAdvancedProviderModels('claude', 'cli/native');
  await clock.advance(24 * 60 * 60_000);
  state.registryFailures = state.modelFailures = state.advancedFailures = 2;
  const changes: ProviderTargetSelection[] = [];
  const view = render(<I18nProvider locale="en"><ProviderModelBrainCard {...props}
    model="my-custom-model" onTargetChange={(value) => changes.push(value)} /></I18nProvider>);
  assert.ok(view.container.querySelector('option[value="claude"]'));
  assert.ok(view.container.querySelector('option[value="model-a"]'));
  await settle();
  assert.ok(view.container.querySelector('option[value="claude"]'));
  assert.equal((view.getByRole('textbox') as HTMLInputElement).value, 'my-custom-model');
  assert.equal(changes.length, 0, 'failed reads must not rewrite the saved target');
  assertNoManualRecovery(view.container);
});

test('confirmed deselection removes retained choices and unmount cancels recovery', async (t) => {
  const clock = installClock(t);
  const { state, props } = api();
  const view = render(<I18nProvider locale="en"><ProviderModelBrainCard {...props} /></I18nProvider>);
  await settle();
  assert.ok(view.container.querySelector('option[value="model-a"]'));
  state.selected = false;
  state.revision = 'two';
  await clock.advance(30_000);
  assert.equal(view.container.querySelector('option[value="claude"]'), null);
  assert.equal(view.container.querySelector('option[value="model-a"]'), null);
  const calls = state.registryCalls;
  view.unmount();
  assert.equal(clock.timers.size, 0);
  await clock.advance(120_000);
  assert.equal(state.registryCalls, calls);
});

test('custom model remains visible when a successfully empty catalog later fails to refresh', async (t) => {
  const clock = installClock(t);
  const { state, props } = api();
  state.emptyCatalog = true;
  const view = render(<I18nProvider locale="en"><ProviderModelBrainCard {...props}
    model="my-custom-model" /></I18nProvider>);
  await settle();
  assert.equal((view.getByRole('textbox') as HTMLInputElement).value, 'my-custom-model');
  state.modelFailures = state.advancedFailures = 2;
  await clock.advance(60_000);
  assert.equal((view.getByRole('textbox') as HTMLInputElement).value, 'my-custom-model');
  assert.ok(view.container.querySelector('[role="status"]'));
});

test('retained server responses keep a spinner until background revalidation succeeds', async (t) => {
  const clock = installClock(t);
  const { state, props } = api();
  state.revalidating = true;
  const view = render(<I18nProvider locale="en"><ProviderModelBrainCard {...props} /></I18nProvider>);
  await settle();
  assert.ok(view.container.querySelector('option[value="model-a"]'));
  assert.equal(view.container.querySelectorAll('[role="status"]').length, 2);
  assertNoManualRecovery(view.container);
  state.revalidating = false;
  await clock.advance(16_000);
  assert.equal(view.container.querySelectorAll('[role="status"]').length, 0);
});

test('unmounted catalog requests cannot overwrite a remounted picker after a selection reset', async (t) => {
  installClock(t);
  const { props } = api();
  let release!: (response: Response) => void;
  const pendingModels = (provider: string, instance?: string | null) =>
    fetchProviderModelCatalogFromClientCache({ provider, instance,
      fetchImpl: () => new Promise((resolve) => { release = resolve; }) });
  const first = render(<I18nProvider locale="en"><ProviderModelBrainCard {...props}
    fetchProviderModels={pendingModels} /></I18nProvider>);
  await settle();
  first.unmount();
  clearProviderRegistryClientCache();
  const next = render(<I18nProvider locale="en"><ProviderModelBrainCard {...props} /></I18nProvider>);
  await settle();
  act(() => { release(Response.json({ catalog: catalog('claude', 'cli/native', 'obsolete') })); });
  await settle();
  assert.equal(next.container.querySelector('option[value="obsolete"]'), null);
  assert.ok(next.container.querySelector('option[value="model-a"]'));
});

test('read loop caps backoff, pauses hidden retries, resumes and never overlaps pending reads', async (t) => {
  const clock = installClock(t);
  let calls = 0;
  let release: (() => void) | undefined;
  const stop = startProviderReadLoop(async () => {
    calls++;
    if (calls === 1) await new Promise<void>((resolve) => { release = resolve; });
    return false;
  });
  t.after(stop);
  await clock.advance(60_000);
  await clock.visibility(false);
  await clock.visibility(true);
  assert.equal(calls, 1);
  act(() => { release?.(); });
  await settle();
  for (const delay of [2_000, 4_000, 8_000, 16_000, 30_000, 30_000]) {
    await clock.advance(delay - 1);
    const before: number = calls;
    await clock.advance(1);
    assert.equal(calls, before + 1);
  }
  await clock.visibility(false);
  await clock.advance(120_000);
  const hiddenCalls = calls;
  assert.equal(clock.timers.size, 0);
  await clock.visibility(true);
  await clock.advance(0);
  assert.equal(calls, hiddenCalls + 1);
  stop();
  assert.equal(clock.timers.size, 0);
});
