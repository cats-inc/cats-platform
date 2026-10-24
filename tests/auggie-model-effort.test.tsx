import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { ProviderModelFields } from '../src/design/components/ProviderModelFields.tsx';
import { clearProviderCatalogClientCache } from '../src/app/renderer/providerCatalogClient.ts';
import { clearProviderRegistryClientCache } from '../src/app/renderer/providerRegistryClient.ts';
import { listProductProviders, normalizeProviderAdvancedModelCatalog,
  normalizeProviderModelCatalog } from '../src/shared/providerCatalog.ts';
import type { ProviderTargetSelection } from '../src/shared/providerSelection.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

test('Auggie renders Runtime-owned per-model effort and carries changes into selection', async (t) => {
  const reset = () => {
    cleanup(); resetTestDom(); clearProviderCatalogClientCache(); clearProviderRegistryClientCache();
  };
  reset(); t.after(reset);
  // Synthetic IDs and levels exercise an unknown future catalog without an authored UI table.
  const entries = [
    { id: 'future-with-effort', label: 'Future with effort', controls: [{
      key: 'auggie.reasoning_effort', label: 'Effort', kind: 'enum', scope: 'both',
      values: [{ value: 'first', label: 'First' }, { value: 'second', label: 'Second' }],
    }] },
    { id: 'future-without-effort', label: 'Future without effort', controls: [] },
  ];
  const envelope = { provider: 'auggie', backend: 'cli', instance: 'cli/native',
    catalogRevision: 'auggie-fixture', defaultModel: null, source: 'static', cache: null,
    models: entries.map(({ id, label }) => ({ id, label })), entries, controls: entries[0].controls,
    presets: [], defaultSelection: { entryId: entries[0].id, entryMode: 'explicit' },
    support: { tier: 'full', notes: [] }, warnings: [] };
  const changes: ProviderTargetSelection[] = [];
  const fetchProviderRegistry = async () => ({ state: 'ready' as const,
    providers: listProductProviders().filter(({ id }) => id === 'auggie') });
  const fetchProviderModels = async () => normalizeProviderModelCatalog(envelope, 'auggie');
  const fetchAdvancedProviderModels = async () => normalizeProviderAdvancedModelCatalog(envelope, 'auggie');
  function picker(model: string) {
    return <I18nProvider locale="en"><ProviderModelFields provider="auggie" instance="cli/native"
      model={model} modelSelection={{ entryId: model, entryMode: 'explicit', catalogRevision: 'auggie-fixture' }}
      onTargetChange={(target) => changes.push(target)} fetchProviderRegistry={fetchProviderRegistry}
      fetchProviderModels={fetchProviderModels} fetchAdvancedProviderModels={fetchAdvancedProviderModels}
    /></I18nProvider>;
  }
  const view = render(picker(entries[0].id));
  const effort = await waitFor(() => view.getByRole('combobox', { name: 'Effort' }) as HTMLSelectElement);
  assert.deepEqual(Array.from(effort.options, ({ value, text }) => [value, text]),
    [['first', 'First'], ['second', 'Second']]);
  assert.equal(effort.value, 'first');
  fireEvent.change(effort, { target: { value: 'second' } });
  assert.equal(changes.at(-1)?.modelSelection?.controls?.['auggie.reasoning_effort'], 'second');
  view.rerender(picker(entries[1].id));
  await waitFor(() => assert.equal(view.queryByRole('combobox', { name: 'Effort' }), null));
  assert.ok(view.getByRole('combobox', { name: /^Model/ }));
});
