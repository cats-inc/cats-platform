// Must come first: React captures `canUseDOM` when its module body runs.
import { resetTestDom } from './helpers/installDomBeforeReact.ts';

import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanup, render, waitFor } from '@testing-library/react';
import React, { useCallback, useState } from 'react';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { clearProviderCatalogClientCache } from '../src/app/renderer/providerCatalogClient.ts';
import { clearProviderRegistryClientCache } from '../src/app/renderer/providerRegistryClient.ts';
import {
  ProviderModelFields,
  createStaticProviderRegistryReadModel,
} from '../src/design/components/ProviderModelFields.tsx';
import { shouldPublishReadyPayload } from '../src/products/shared/renderer/hooks/usePublishReadyPayload.ts';
import { clearRememberedExecutionLabels } from '../src/shared/executionLabel.ts';
import { enCatalog } from '../src/shared/i18n/catalogs/en.ts';
import { zhTWCatalog } from '../src/shared/i18n/catalogs/zh-TW.ts';
import { messageKeys } from '../src/shared/i18n/messageKeys.ts';
import { getDefaultProviderInstance } from '../src/shared/providerCatalog.ts';
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
const MODEL_ID = 'gpt-5.6-sol';
const RUNTIME_LABEL = 'GPT-5.6-Sol';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

function codexInstance(): string {
  return getDefaultProviderInstance('codex') ?? 'native';
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
  clearRememberedExecutionLabels();
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
}) {
  const [target, setTarget] = useState<{
    instance: string;
    model: string;
    modelSelection: ProviderModelSelection | null;
  }>({ instance: codexInstance(), model: MODEL_ID, modelSelection: null });
  const { models, advanced, onChange } = props;
  const fetchProviderRegistry = useCallback(
    async () => createStaticProviderRegistryReadModel(),
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
        onTargetChange={onTargetChange}
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

