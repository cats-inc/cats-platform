import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import React, { useCallback, useState } from 'react';
import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { clearProviderCatalogClientCache } from '../src/app/renderer/providerCatalogClient.ts';
import { clearProviderRegistryClientCache } from '../src/app/renderer/providerRegistryClient.ts';
import { ProviderModelFields }
  from '../src/design/components/ProviderModelFields.tsx';
import {
  createProviderAdvancedCatalogFromModelCatalog,
  createStaticProviderModelCatalog,
  listProductProviders,
  type ProviderAdvancedModelCatalog,
} from '../src/shared/providerCatalog.ts';
import type { ProviderTargetSelection } from '../src/shared/providerSelection.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

// A non-first runtime default deliberately differs from the warm static catalog.
const codex: ProviderAdvancedModelCatalog = {
  provider: 'codex', backend: 'cli', instance: 'cli/native', source: 'static', cache: null,
  defaultModel: 'gpt-5.6-sol',
  entries: [
    { id: 'gpt-6-astra', label: 'gpt-6-astra',
      controlDefaults: { 'codex.reasoning_effort': 'medium' } },
    { id: 'gpt-5.6-sol', label: 'gpt-5.6-sol', default: true,
      controlDefaults: { 'codex.reasoning_effort': 'low' } },
  ],
  presets: [],
  controls: [{
    key: 'codex.reasoning_effort', label: 'Reasoning effort', kind: 'enum', scope: 'both',
    values: [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' },
    ],
  }],
  defaultSelection: { entryMode: 'explicit', entryId: 'gpt-5.6-sol',
    controls: { 'codex.reasoning_effort': 'low' } },
  support: { tier: 'full', notes: [] }, warnings: [],
};
const claude = createStaticProviderModelCatalog('claude', { instance: 'cli/native' });
const gooseModels = { ...createStaticProviderModelCatalog('goose', { instance: 'cli/native' }),
  defaultModel: null };
const goose = { ...createProviderAdvancedCatalogFromModelCatalog(gooseModels),
  defaultSelection: { entryMode: 'explicit' as const, entryId: 'chatgpt_codex/gpt-5.6-sol' } };
const auggieModels = { ...createStaticProviderModelCatalog('auggie', { instance: 'cli/native' }),
  defaultModel: null };
const auggie = { ...createProviderAdvancedCatalogFromModelCatalog(auggieModels),
  defaultSelection: null };
const junieModels = createStaticProviderModelCatalog('junie', { instance: 'cli/native' });
const junie: ProviderAdvancedModelCatalog = {
  ...createProviderAdvancedCatalogFromModelCatalog(junieModels),
  entries: junieModels.models.map(entry => ({ ...entry,
    label: entry.label.replace(/ \(default\)$/, '') })),
  defaultSelection: { entryMode: 'explicit', entryId: 'Gemini 3.7 Flash' },
};
const agyModels = createStaticProviderModelCatalog('antigravity', { instance: 'cli/native' });
const grokModels = createStaticProviderModelCatalog('grok', { instance: 'cli/native' });
const grok: ProviderAdvancedModelCatalog = {
  ...createProviderAdvancedCatalogFromModelCatalog(grokModels),
  backend: 'cli', defaultModel: null, defaultSelection: null,
  controls: [{
    key: 'grok.reasoning_effort', label: 'Reasoning effort', kind: 'enum', scope: 'both',
    values: [
      { value: 'xhigh', label: 'Extra High Effort', applicableEntryIds: ['grok-4.6'] },
      ...['High', 'Medium', 'Low'].map((label) => ({ value: label.toLowerCase(),
        label: `${label} Effort`, applicableEntryIds: ['grok-4.6', 'grok-4.5'] })),
    ],
  }],
};
const agy: ProviderAdvancedModelCatalog = {
  ...createProviderAdvancedCatalogFromModelCatalog(agyModels),
  backend: 'cli', defaultModel: null, defaultSelection: null,
  controls: [{
    key: 'antigravity.effort', label: 'Effort', kind: 'enum', scope: 'both',
    applicableEntryIds: agyModels.models.slice(0, 4).map((model) => model.id),
    values: ['low', 'medium', 'high'].map((value) => ({
      value, label: value,
      applicableEntryIds: agyModels.models.slice(0, value === 'medium' ? 3 : 4).map((model) => model.id),
    })),
  }],
};

function Picker(props: {
  ready: Promise<void>;
  initialTarget?: ProviderTargetSelection;
  onChange: (target: ProviderTargetSelection) => void;
}) {
  const [target, setTarget] = useState<ProviderTargetSelection>(props.initialTarget ?? {
    provider: 'claude', instance: 'cli/native', model: '', modelSelection: null,
  });
  const { ready, onChange } = props;
  const registry = useCallback(async () => ({ state: 'ready' as const, revision: 'selected-claude-codex',
    providers: listProductProviders().filter((provider) => ['claude', 'codex', 'antigravity', 'grok', 'junie', 'auggie', 'goose'].includes(provider.id)),
  }), []);
  const models = useCallback(async (provider: string) => {
    if (provider === 'goose') return gooseModels;
    if (provider === 'auggie') return auggieModels;
    if (provider === 'junie') return junieModels;
    if (provider === 'grok') return { ...grokModels, defaultModel: null };
    if (provider === 'antigravity') return { ...agyModels, defaultModel: null };
    if (provider !== 'codex') return claude;
    await ready;
    return { ...codex, models: codex.entries };
  }, [ready]);
  const advanced = useCallback(async (provider: string) => {
    if (provider === 'goose') return goose;
    if (provider === 'auggie') return auggie;
    if (provider === 'junie') return junie;
    if (provider === 'grok') return grok;
    if (provider === 'antigravity') return agy;
    if (provider !== 'codex') return createProviderAdvancedCatalogFromModelCatalog(claude);
    await ready;
    return codex;
  }, [ready]);
  const changed = useCallback((next: ProviderTargetSelection) => {
    onChange(next);
    setTarget(next);
  }, [onChange]);
  return <I18nProvider locale="en"><ProviderModelFields
    provider={target.provider} instance={target.instance} model={target.model}
    modelSelection={target.modelSelection} onTargetChange={changed}
    fetchProviderRegistry={registry} fetchProviderModels={models} fetchAdvancedProviderModels={advanced}
  /></I18nProvider>;
}

function reset(): void {
  cleanup();
  resetTestDom();
  clearProviderCatalogClientCache();
  clearProviderRegistryClientCache();
}

test('Junie keeps its runtime default label and fixed effort across model changes and reopen', async (t) => {
  reset();
  t.after(reset);
  const changes: ProviderTargetSelection[] = [];
  const onChange = (target: ProviderTargetSelection) => { changes.push(target); };
  const ready = Promise.resolve();
  let view = render(<Picker ready={ready} onChange={onChange} />);
  const model = () => view.getByRole('combobox', { name: /^Model/ }) as HTMLSelectElement;
  await waitFor(() => assert.equal(changes.at(-1)?.model, 'opus'));
  fireEvent.change(view.getByRole('combobox', { name: 'Provider' }), { target: { value: 'junie' } });
  await waitFor(() => assert.equal(changes.at(-1)?.modelSelection?.entryId, 'Gemini 3.7 Flash'));
  assert.equal(model().value, 'Gemini 3.7 Flash');
  assert.equal(model().selectedOptions[0].textContent, 'Gemini 3.7 Flash — Medium (default)');
  assert.equal([...model().options].filter(option => option.textContent?.includes('(default)')).length, 1);
  assert.equal(model().options.length, 6);
  assert.equal(view.queryByRole('combobox', { name: /effort/i }), null);
  fireEvent.change(model(), { target: { value: 'GPT-5.6-SOL' } });
  await waitFor(() => assert.equal(changes.at(-1)?.modelSelection?.entryId, 'GPT-5.6-SOL'));
  assert.equal(model().selectedOptions[0].textContent, 'GPT-5.6-SOL — Low');
  assert.equal(changes.at(-1)?.modelSelection?.controls, undefined);
  const saved = changes.at(-1)!;
  view.unmount();
  view = render(<Picker ready={ready} initialTarget={saved} onChange={onChange} />);
  await waitFor(() => assert.equal(model().value, 'GPT-5.6-SOL'));
});

test('Grok selects the first effort for each model, keeps labels and restores saved effort', async (t) => {
  reset();
  t.after(reset);
  const changes: ProviderTargetSelection[] = [];
  const onChange = (target: ProviderTargetSelection) => { changes.push(target); };
  const ready = Promise.resolve();
  let view = render(<Picker ready={ready} onChange={onChange} />);
  const model = () => view.getByRole('combobox', { name: /^Model/ }) as HTMLSelectElement;
  const effort = () => view.getByRole('combobox', { name: 'Reasoning effort' }) as HTMLSelectElement;
  await waitFor(() => assert.equal(changes.at(-1)?.model, 'opus'));
  fireEvent.change(view.getByRole('combobox', { name: 'Provider' }), { target: { value: 'grok' } });
  await waitFor(() => assert.equal(changes.at(-1)?.model, 'grok-4.6'));
  await waitFor(() => assert.equal(changes.at(-1)?.modelSelection?.controls?.['grok.reasoning_effort'], 'xhigh'));
  assert.equal(model().selectedOptions[0].textContent, 'Grok 4.6');
  assert.equal(effort().value, 'xhigh');
  assert.deepEqual([...effort().options].map((option) => option.textContent),
    ['Extra High Effort', 'High Effort', 'Medium Effort', 'Low Effort']);
  assert.ok([...model().options].every((option) => !/default|active/i.test(option.textContent ?? '')));

  fireEvent.change(model(), { target: { value: 'grok-4.5' } });
  await waitFor(() => assert.equal(effort().value, 'high'));
  assert.equal(changes.at(-1)?.modelSelection?.controls?.['grok.reasoning_effort'], 'high');
  assert.deepEqual([...effort().options].map((option) => option.textContent),
    ['High Effort', 'Medium Effort', 'Low Effort']);
  fireEvent.change(effort(), { target: { value: 'low' } });
  await waitFor(() => assert.equal(changes.at(-1)?.modelSelection?.controls?.['grok.reasoning_effort'], 'low'));
  const saved = changes.at(-1)!;
  view.unmount();
  view = render(<Picker ready={ready} initialTarget={saved} onChange={onChange} />);
  await waitFor(() => assert.equal(effort().value, 'low'));
  fireEvent.change(model(), { target: { value: 'grok-4.6' } });
  await waitFor(() => assert.equal(effort().value, 'xhigh'));
});

test('provider/model switches select and mark runtime defaults while reload preserves explicit effort', async (t) => {
  reset();
  t.after(reset);
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  const changes: ProviderTargetSelection[] = [];
  const onChange = (target: ProviderTargetSelection) => { changes.push(target); };
  let view = render(<Picker ready={ready} onChange={onChange} />);
  const model = () => view.getByRole('combobox', { name: /^Model/ }) as HTMLSelectElement;
  const effort = () => view.getByRole('combobox', { name: 'Reasoning effort' }) as HTMLSelectElement;
  await waitFor(() => assert.equal(model().value, 'opus'));
  await waitFor(() => assert.equal(changes.at(-1)?.model, 'opus'));
  fireEvent.change(view.getByRole('combobox', { name: 'Provider' }), { target: { value: 'codex' } });
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(changes.filter((entry) => entry.provider === 'codex' && entry.model).length, 0);
  release();
  await waitFor(() => assert.equal(model().value, 'gpt-5.6-sol'));
  await waitFor(() => assert.equal(changes.at(-1)?.model, 'gpt-5.6-sol'));
  assert.equal(model().selectedOptions[0].textContent, 'gpt-5.6-sol (default)');
  assert.equal(effort().value, 'low');
  assert.equal(effort().selectedOptions[0].textContent, 'Low (default)');

  fireEvent.change(model(), { target: { value: 'gpt-6-astra' } });
  await waitFor(() => assert.equal(effort().value, 'medium'));
  assert.equal(effort().selectedOptions[0].textContent, 'Medium (default)');
  assert.equal([...effort().options].filter((option) => option.textContent?.includes('(default)')).length, 1);
  fireEvent.change(effort(), { target: { value: 'high' } });
  await waitFor(() => assert.equal(changes.at(-1)?.modelSelection?.controls?.['codex.reasoning_effort'], 'high'));
  const saved = changes.at(-1)!;
  view.unmount();
  view = render(<Picker ready={ready} initialTarget={saved} onChange={onChange} />);
  await waitFor(() => assert.equal(effort().value, 'high'));
  assert.equal([...effort().options].find((option) => option.value === 'medium')?.textContent, 'Medium (default)');
  fireEvent.change(model(), { target: { value: 'gpt-5.6-sol' } });
  await waitFor(() => assert.equal(effort().value, 'low'));
});

test('Antigravity selects first model and effort without synthetic defaults and keeps model-specific effort', async (t) => {
  reset();
  t.after(reset);
  const changes: ProviderTargetSelection[] = [];
  const onChange = (target: ProviderTargetSelection) => { changes.push(target); };
  const ready = Promise.resolve();
  let view = render(<Picker ready={ready} onChange={onChange} />);
  const model = () => view.getByRole('combobox', { name: /^Model/ }) as HTMLSelectElement;
  const effort = () => view.getByRole('combobox', { name: 'Effort' }) as HTMLSelectElement;
  await waitFor(() => assert.equal(model().value, 'opus'));
  await waitFor(() => assert.equal(changes.at(-1)?.model, 'opus'));
  fireEvent.change(view.getByRole('combobox', { name: 'Provider' }), { target: { value: 'antigravity' } });
  await waitFor(() => assert.equal(model().value, 'gemini-3.8-flash-low'));
  await waitFor(() => assert.equal(changes.at(-1)?.model, 'gemini-3.8-flash-low'));
  assert.equal(model().selectedOptions[0].textContent, 'Gemini 3.8 Flash');
  assert.equal(effort().value, 'low');
  assert.deepEqual([...effort().options].map((option) => option.textContent), ['low', 'medium', 'high']);
  assert.ok([...model().options].every((option) => !/default/i.test(option.textContent ?? '')));

  fireEvent.change(effort(), { target: { value: 'high' } });
  await waitFor(() => assert.equal(changes.at(-1)?.modelSelection?.controls?.['antigravity.effort'], 'high'));
  const saved = changes.at(-1)!;
  view.unmount();
  view = render(<Picker ready={ready} initialTarget={saved} onChange={onChange} />);
  await waitFor(() => assert.equal(effort().value, 'high'));
  fireEvent.change(model(), { target: { value: 'gemini-3.1-pro-low' } });
  await waitFor(() => assert.equal(effort().value, 'low'));
  assert.deepEqual([...effort().options].map((option) => option.textContent), ['low', 'high']);

  for (const id of ['claude-sonnet-4-6', 'claude-opus-4-6-thinking', 'gpt-oss-120b-medium']) {
    fireEvent.change(model(), { target: { value: id } });
    await waitFor(() => assert.equal(view.queryByRole('combobox', { name: 'Effort' }), null));
    assert.equal(changes.at(-1)?.modelSelection?.controls?.['antigravity.effort'], undefined);
  }
});

test('Auggie shows six choices plus custom and sends the opaque Prism id without default labels', async (t) => {
  reset();
  t.after(reset);
  const changes: ProviderTargetSelection[] = [];
  const onChange = (target: ProviderTargetSelection) => { changes.push(target); };
  const ready = Promise.resolve();
  let view = render(<Picker ready={ready} onChange={onChange} />);
  const model = () => view.getByRole('combobox', { name: /^Model/ }) as HTMLSelectElement;
  await waitFor(() => assert.equal(changes.at(-1)?.model, 'opus'));
  fireEvent.change(view.getByRole('combobox', { name: 'Provider' }), { target: { value: 'auggie' } });
  await waitFor(() => assert.equal(changes.at(-1)?.modelSelection?.entryId, 'gpt-6-astra'));
  assert.equal(model().selectedOptions[0].textContent, 'GPT-6 Astra');
  assert.equal(model().options.length, 7);
  assert.ok([...model().options].every(option => !option.textContent?.includes('(default)')));
  assert.equal(view.queryByRole('combobox', { name: /effort/i }), null);
  fireEvent.change(model(), { target: { value: 'butler_a' } });
  await waitFor(() => assert.equal(changes.at(-1)?.modelSelection?.entryId, 'butler_a'));
  assert.equal(model().selectedOptions[0].textContent, 'Prism (Claude + GPT)');
  assert.equal(changes.at(-1)?.modelSelection?.controls, undefined);
  const saved = changes.at(-1)!;
  view.unmount();
  view = render(<Picker ready={ready} initialTarget={saved} onChange={onChange} />);
  await waitFor(() => assert.equal(model().value, 'butler_a'));
});

test('Goose shows six fixed Off choices plus custom and preserves the selected fixed combination', async (t) => {
  reset();
  t.after(reset);
  const changes: ProviderTargetSelection[] = [];
  const onChange = (target: ProviderTargetSelection) => { changes.push(target); };
  const ready = Promise.resolve();
  let view = render(<Picker ready={ready} onChange={onChange} />);
  const model = () => view.getByRole('combobox', { name: /^Model/ }) as HTMLSelectElement;
  await waitFor(() => assert.equal(changes.at(-1)?.model, 'opus'));
  fireEvent.change(view.getByRole('combobox', { name: 'Provider' }), { target: { value: 'goose' } });
  await waitFor(() => assert.equal(changes.at(-1)?.modelSelection?.entryId, 'chatgpt_codex/gpt-5.6-sol'));
  assert.equal(model().selectedOptions[0].textContent, 'gpt-5.6-sol — Off');
  assert.equal(changes.at(-1)?.modelSelection?.controls, undefined);
  assert.equal(model().options.length, 7);
  assert.ok([...model().options].every(option => !option.textContent?.includes('(default)')));
  assert.equal(view.queryByRole('combobox', { name: /effort/i }), null);
  fireEvent.change(model(), { target: { value: 'chatgpt_codex/gpt-5.4' } });
  await waitFor(() => assert.equal(changes.at(-1)?.modelSelection?.entryId, 'chatgpt_codex/gpt-5.4'));
  assert.equal(model().selectedOptions[0].textContent, 'gpt-5.4 — Off');
  assert.equal(changes.at(-1)?.modelSelection?.controls, undefined);
  const saved = changes.at(-1)!;
  view.unmount();
  view = render(<Picker ready={ready} initialTarget={saved} onChange={onChange} />);
  await waitFor(() => assert.equal(model().value, 'chatgpt_codex/gpt-5.4'));
});
