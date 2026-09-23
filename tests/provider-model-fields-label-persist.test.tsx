// Must come first: React captures `canUseDOM` when its module body runs.
import { resetTestDom } from './helpers/installDomBeforeReact.ts';

import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import React, { useCallback, useState } from 'react';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { clearProviderCatalogClientCache } from '../src/app/renderer/providerCatalogClient.ts';
import { clearProviderRegistryClientCache } from '../src/app/renderer/providerRegistryClient.ts';
import {
  ProviderModelFields,
} from '../src/design/components/ProviderModelFields.tsx';
import { shouldPublishReadyPayload } from '../src/products/shared/renderer/hooks/usePublishReadyPayload.ts';
import { enCatalog } from '../src/shared/i18n/catalogs/en.ts';
import { zhTWCatalog } from '../src/shared/i18n/catalogs/zh-TW.ts';
import { messageKeys } from '../src/shared/i18n/messageKeys.ts';
import { getDefaultProviderInstance, listProductProviders } from '../src/shared/providerCatalog.ts';
import type {
  ProviderAdvancedModelCatalog,
  ProviderModelCatalog,
} from '../src/shared/providerCatalog.ts';
import {
  clearLiveProviderModelLabels,
  recordLiveProviderModelLabels,
} from '../src/shared/providerModelLabelRegistry.ts';
import type {
  ProviderModelSelection,
  ProviderTargetSelection,
} from '../src/shared/providerSelection.ts';

// A model the runtime serves but the static fallback table does not carry, so
// the fallback label is the raw id and the runtime label is something else.
const MODEL_ID = 'codex-label-test-model';
const RUNTIME_LABEL = 'Codex Label Test Model';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

function codexInstance(): string {
  const instance = getDefaultProviderInstance('codex') ?? 'native';
  return instance.includes('/') ? instance : `cli/${instance}`;
}

function runtimeCatalog(): ProviderModelCatalog {
  return {
    provider: 'codex',
    backend: 'cli',
    instance: codexInstance(),
    defaultModel: MODEL_ID,
    source: 'dynamic',
    cache: null,
    models: [{ id: MODEL_ID, label: RUNTIME_LABEL, default: true }],
    warnings: [],
  };
}

function runtimeAdvancedCatalog(): ProviderAdvancedModelCatalog {
  return {
    provider: 'codex',
    backend: 'cli',
    instance: codexInstance(),
    defaultModel: MODEL_ID,
    source: 'dynamic',
    cache: null,
    entries: [{ id: MODEL_ID, label: RUNTIME_LABEL, default: true }],
    presets: [],
    controls: [],
    defaultSelection: { entryId: MODEL_ID, entryMode: 'explicit', controls: {} },
    support: { tier: 'full', notes: [] },
    warnings: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}



function resetSharedState(): void {
  // Unmount first: effect cleanups need the DOM they registered against.
  cleanup();
  resetTestDom();
  clearProviderCatalogClientCache();
  clearProviderRegistryClientCache();
  clearLiveProviderModelLabels();
}

/**
 * A parent that behaves like the real one: it applies every `onTargetChange`
 * back into the picker's props. Without that, the catalog reconciliation
 * keeps seeing the pre-reconciliation selection and re-emits on every render,
 * which is a harness artifact rather than the behaviour under test. The fetch
 * callbacks are stable across renders for the same reason the app's are --
 * a new identity would make the catalog hook refetch.
 */
function ControlledPicker(props: {
  models: Promise<ProviderModelCatalog>;
  advanced: Promise<ProviderAdvancedModelCatalog>;
  onChange: (target: ProviderTargetSelection) => void;
  /** Changing this forces a render without touching the picker's own props. */
  bump: number;
  unstableHandler?: boolean;
  initialSelection?: ProviderModelSelection;
}) {
  const [target, setTarget] = useState<{
    instance: string;
    model: string;
    modelSelection: ProviderModelSelection | null;
  }>({ instance: codexInstance(), model: MODEL_ID, modelSelection: props.initialSelection ?? null });
  const { models, advanced, onChange } = props;
  const fetchProviderRegistry = useCallback(
    async () => ({ state: 'ready' as const, revision: 'selected-codex',
      providers: listProductProviders().filter((provider) => provider.id === 'codex') }),
    [],
  );
  const fetchProviderModels = useCallback(() => models, [models]);
  const fetchAdvancedProviderModels = useCallback(() => advanced, [advanced]);
  const onTargetChange = useCallback((next: ProviderTargetSelection) => {
    onChange(next);
    setTarget({
      instance: next.instance,
      model: next.model,
      modelSelection: next.modelSelection ?? null,
    });
  }, [onChange]);
  return (
    <I18nProvider locale="en">
      <span data-bump={props.bump} />
      <ProviderModelFields
        provider="codex"
        instance={target.instance}
        model={target.model}
        modelSelection={target.modelSelection}
        onTargetChange={props.unstableHandler ? next => onTargetChange(structuredClone(next)) : onTargetChange}
        fetchProviderRegistry={fetchProviderRegistry}
        fetchProviderModels={fetchProviderModels}
        fetchAdvancedProviderModels={fetchAdvancedProviderModels}
      />
    </I18nProvider>
  );
}

/**
 * Let pending effects and promise continuations run. Deliberately not React's
 * async act: in this ESM test bundle it cannot reach `setImmediate` and falls
 * back to a `MessageChannel` per call that it never closes, and each open port
 * keeps the whole test runner alive. `render`/`rerender` are already
 * act-wrapped by testing-library, and the assertions below poll through
 * `waitFor`, which handles React flushing itself.
 */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 60));
}

test('label publication stays bounded with changing parent callbacks and cloned selections', async (t) => {
  resetSharedState(); t.after(resetSharedState);
  const changes: ProviderTargetSelection[] = [];
  const models = Promise.resolve(runtimeCatalog());
  const advanced = Promise.resolve(runtimeAdvancedCatalog());
  const onChange = (target: ProviderTargetSelection) => {
    changes.push(target);
    assert.ok(changes.length < 8, 'label persistence must not create a parent write loop');
  };
  const view = render(<ControlledPicker models={models} advanced={advanced} onChange={onChange} bump={0} unstableHandler />);
  await waitFor(() => assert.ok(changes.some(change => change.executionLabel?.includes(RUNTIME_LABEL))));
  await settle();
  const count = changes.length;
  view.rerender(<ControlledPicker models={models} advanced={advanced} onChange={onChange} bump={1} unstableHandler />);
  await settle();
  assert.equal(changes.length, count, 'same catalog/target label is published once per picker identity');
});

test('label publication never restores an old revision or a removed control after reconciliation', async (t) => {
  resetSharedState(); t.after(resetSharedState);
  const changes: ProviderTargetSelection[] = [];
  const models = Promise.resolve({ ...runtimeCatalog(), catalogRevision: 'R2', catalogActivationId: 'A2' });
  const advanced = Promise.resolve({ ...runtimeAdvancedCatalog(), catalogRevision: 'R2', catalogActivationId: 'A2' });
  const onChange = (target: ProviderTargetSelection) => { changes.push(target); };
  render(<ControlledPicker models={models} advanced={advanced} onChange={onChange} bump={0}
    initialSelection={{ entryId: MODEL_ID, entryMode: 'explicit', catalogRevision: 'R1',
      controls: { 'codex.removed_control': 'stale' } }} />);
  await waitFor(() => assert.equal(changes.at(-1)?.modelSelection?.catalogRevision, 'R2'));
  await settle();
  assert.ok(changes.length > 0);
  for (const change of changes) {
    assert.equal(change.modelSelection?.catalogRevision, 'R2', 'a label write cannot restore R1');
    assert.equal(change.modelSelection?.controls?.['codex.removed_control'], undefined);
    assert.ok(change.executionLabel?.includes(RUNTIME_LABEL));
  }
});

test('a saved plain model remains selected when it differs from the current catalog default', async (t) => {
  resetSharedState(); t.after(resetSharedState);
  const changes: ProviderTargetSelection[] = [];
  const preferred = { id: 'different-default', label: 'Different default', default: true };
  const saved = { id: MODEL_ID, label: RUNTIME_LABEL };
  const models = Promise.resolve({ ...runtimeCatalog(), defaultModel: preferred.id, models: [preferred, saved] });
  const advanced = Promise.resolve({ ...runtimeAdvancedCatalog(), defaultModel: preferred.id,
    entries: [preferred, saved], defaultSelection: { entryId: preferred.id, entryMode: 'explicit' as const } });
  const onChange = (target: ProviderTargetSelection) => { changes.push(target); };
  render(<ControlledPicker models={models} advanced={advanced} onChange={onChange} bump={0} />);
  await waitFor(() => assert.equal(changes.at(-1)?.modelSelection?.entryId, MODEL_ID));
  await settle();
  assert.ok(changes.every(change => change.model === MODEL_ID), JSON.stringify(changes));
});

test('a late catalog and label from the previous provider cannot overwrite a fresh pick', async (t) => {
  resetSharedState(); t.after(resetSharedState);
  const oldModels = deferred<ProviderModelCatalog>();
  const oldAdvanced = deferred<ProviderAdvancedModelCatalog>();
  const changes: ProviderTargetSelection[] = [];
  const grokModel = 'unfamiliar-grok-selection';
  const newModels = { ...runtimeCatalog(), provider: 'grok', defaultModel: grokModel,
    models: [{ id: grokModel, label: 'Selected Grok model' }], catalogRevision: 'G2', catalogActivationId: 'G2' };
  const newAdvanced = { ...runtimeAdvancedCatalog(), ...newModels, entries: newModels.models,
    defaultSelection: { entryId: grokModel, entryMode: 'explicit' as const } };
  const registry = async () => ({ state: 'ready' as const,
    providers: listProductProviders().filter(provider => ['codex', 'grok'].includes(provider.id)) });
  const models = async (provider: string) => provider === 'codex' ? oldModels.promise : newModels;
  const advanced = async (provider: string) => provider === 'codex' ? oldAdvanced.promise : newAdvanced;
  function SwitchPicker() {
    const [target, setTarget] = useState<ProviderTargetSelection>({ provider: 'codex', instance: codexInstance(),
      model: MODEL_ID, modelSelection: null });
    const change = useCallback((next: ProviderTargetSelection) => { changes.push(next); setTarget(next); }, []);
    return <I18nProvider locale="en"><ProviderModelFields provider={target.provider} instance={target.instance}
      model={target.model} modelSelection={target.modelSelection} onTargetChange={change}
      fetchProviderRegistry={registry} fetchProviderModels={models} fetchAdvancedProviderModels={advanced} /></I18nProvider>;
  }
  const view = render(<SwitchPicker />);
  await waitFor(() => assert.ok([...(view.getByRole('combobox', { name: 'Provider' }) as HTMLSelectElement).options]
    .some(option => option.value === 'grok')));
  fireEvent.change(view.getByRole('combobox', { name: 'Provider' }), { target: { value: 'grok' } });
  await waitFor(() => assert.equal(changes.at(-1)?.model, grokModel));
  oldModels.resolve(runtimeCatalog());
  oldAdvanced.resolve(runtimeAdvancedCatalog());
  await settle();
  assert.equal(changes.at(-1)?.provider, 'grok');
  assert.equal(changes.at(-1)?.model, grokModel);
  const selected = changes.findIndex(change => change.provider === 'grok');
  assert.ok(selected >= 0);
  assert.ok(changes.slice(selected).every(change => change.provider === 'grok'), JSON.stringify(changes));
});

test('the label persist waits for the loaded catalog and does not re-fire when the live registry fills in later', async (t) => {
  resetSharedState();
  // Runs on failure too, so a failed assertion cannot leave the mounted tree
  // (and its timers) holding the test runner open.
  t.after(resetSharedState);
  const models = deferred<ProviderModelCatalog>();
  const advanced = deferred<ProviderAdvancedModelCatalog>();
  const changes: ProviderTargetSelection[] = [];
  const onChange = (target: ProviderTargetSelection) => {
    changes.push(target);
  };
  const describe = () => JSON.stringify(changes);

  const view = render(
    <ControlledPicker models={models.promise} advanced={advanced.promise} onChange={onChange} bump={0} />,
  );

  // Catalog still loading: nothing authoritative to persist yet. Before the
  // fix this already wrote a label derived from the static fallback.
  await settle();
  assert.equal(changes.length, 0, `no label persist while the catalog is loading: ${describe()}`);

  // The registry filling in from an unrelated catalog load must not make the
  // picker write anything either -- that mid-flight write is what carried the
  // previous provider/model back over a fresh pick.
  recordLiveProviderModelLabels('codex', [{ id: MODEL_ID, label: 'Some other label' }]);
  view.rerender(
    <ControlledPicker models={models.promise} advanced={advanced.promise} onChange={onChange} bump={1} />,
  );
  await settle();
  assert.equal(changes.length, 0, `registry changes alone never trigger a persist: ${describe()}`);

  models.resolve(runtimeCatalog());
  advanced.resolve(runtimeAdvancedCatalog());
  // The loaded catalog legitimately writes: the reconciliation normalizes the
  // selection and the label persist attaches the catalog label. With a
  // controlled parent those converge; wait for them to stop.
  let settledCount = -1;
  await waitFor(() => {
    assert.ok(changes.length >= 1, `the loaded catalog produces a label persist: ${describe()}`);
    if (changes.length !== settledCount) {
      settledCount = changes.length;
      throw new Error('still settling');
    }
  }, { interval: 25, timeout: 3000 });
  const afterLoad = changes.map((change) => JSON.stringify(change));
  for (const change of changes) {
    assert.equal(change.provider, 'codex', `stale provider written: ${describe()}`);
    assert.equal(change.model, MODEL_ID, `stale model written: ${describe()}`);
  }
  assert.ok(
    changes.some((change) => new RegExp(RUNTIME_LABEL).test(change.executionLabel ?? '')),
    `no write carried the catalog label: ${describe()}`,
  );

  // Once the catalog has answered, later registry activity is irrelevant: the
  // persisted label comes from the catalog entry, not the registry.
  recordLiveProviderModelLabels('codex', [{ id: MODEL_ID, label: 'Yet another label' }]);
  view.rerender(
    <ControlledPicker models={models.promise} advanced={advanced.promise} onChange={onChange} bump={2} />,
  );
  await settle();
  assert.deepEqual(
    changes.map((change) => JSON.stringify(change)),
    afterLoad,
    'a registry change after load must not produce another write',
  );
});

test('mutation publishes refuse a payload older than the one already shown', () => {
  const current = { metadata: { generatedAt: '2026-09-04T10:00:05.000Z' } };
  assert.equal(
    shouldPublishReadyPayload(current, { metadata: { generatedAt: '2026-09-04T10:00:01.000Z' } }),
    false,
    'an earlier request landing last must not regress the payload',
  );
  assert.equal(
    shouldPublishReadyPayload(current, { metadata: { generatedAt: '2026-09-04T10:00:05.000Z' } }),
    true,
    'an equal timestamp still applies',
  );
  assert.equal(
    shouldPublishReadyPayload(current, { metadata: { generatedAt: '2026-09-04T10:00:09.000Z' } }),
    true,
  );
  // Payloads that carry no usable timestamp keep the old unconditional
  // behaviour rather than being dropped.
  assert.equal(shouldPublishReadyPayload(current, { metadata: {} }), true);
  assert.equal(shouldPublishReadyPayload({ metadata: {} }, current), true);
  assert.equal(shouldPublishReadyPayload(null, current), true);
});

test('the direct-lane save error is translated in every catalog', () => {
  const key = messageKeys.sharedExecutionTargetSaveDirectLaneError;
  for (const [locale, catalog] of Object.entries({ en: enCatalog, 'zh-TW': zhTWCatalog })) {
    const text = (catalog as Record<string, string>)[key];
    assert.ok(text && text.trim().length > 0, `${locale} is missing ${key}`);
  }
});
