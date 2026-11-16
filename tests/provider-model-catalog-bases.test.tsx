import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import React, { useCallback, useState } from 'react';
import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { clearProviderCatalogClientCache, ProviderCatalogBasisUnknownError } from '../src/app/renderer/providerCatalogClient.ts';
import { clearProviderRegistryClientCache } from '../src/app/renderer/providerRegistryClient.ts';
import { ProviderModelFields } from '../src/design/components/ProviderModelFields.tsx';
import {
  listProductProviders,
  normalizeProviderAdvancedModelCatalog,
  type ProviderAdvancedModelCatalog,
  type ProviderModelCatalog,
} from '../src/shared/providerCatalog.ts';
import type { ProviderModelSelection, ProviderTargetSelection } from '../src/shared/providerSelection.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

// Runtime SPEC-045 FR-7: a Kimi target with a global first basis and a detected mainland-cn one.
const REVISION = { catalogRevision: 'R', catalogActivationId: 'A' };
const REGION = {
  global: { id: 'global', label: 'global (kimi.ai)' },
  cn: { id: 'mainland-cn', label: 'mainland-cn (kimi.com)' },
};
const BASES = [
  { label: 'global (kimi.ai)', region: REGION.global, detected: false },
  { id: 'mainland-cn', label: 'mainland-cn (kimi.com)', region: REGION.cn, cliVersion: '2.5.3', lastUpdated: '2026-11-16', detected: true },
];

function advancedFor(basisId: string | null, detected = true): ProviderAdvancedModelCatalog {
  const entries = basisId === 'mainland-cn' ? ['cn-only', 'shared'] : ['k3', 'shared'];
  const bases = BASES.map((basis, index) => ({ ...basis, detected: detected && index === 1 }));
  return normalizeProviderAdvancedModelCatalog({
    provider: 'kimi', backend: 'cli', instance: 'cli/native', ...REVISION, source: 'config',
    entries: entries.map((id) => ({ id, label: `Kimi ${id}` })), controls: [], presets: [],
    defaultSelection: { entryId: entries[0], entryMode: 'explicit', ...(basisId ? { basisId } : {}) },
    support: { tier: 'entry_only', notes: [] },
    basis: basisId === 'mainland-cn' ? { id: 'mainland-cn', region: REGION.cn } : { region: REGION.global },
    ...(basisId ? { basisId } : {}), bases,
    capture: basisId === 'mainland-cn' ? { cliVersion: '2.5.3', lastUpdated: '2026-11-16' } : { cliVersion: '2.5.0' },
    warnings: [],
  }, 'kimi');
}

const MODELS: ProviderModelCatalog = {
  provider: 'kimi', backend: 'cli', instance: 'cli/native', defaultModel: null, source: 'config', cache: null, ...REVISION,
  models: [{ id: 'k3', label: 'Kimi k3' }, { id: 'shared', label: 'Kimi shared' }], warnings: [],
};

function reset(): void {
  cleanup();
  resetTestDom();
  clearProviderCatalogClientCache();
  clearProviderRegistryClientCache();
}

function renderPicker(initial: { model?: string; modelSelection?: ProviderModelSelection | null }, changes: ProviderTargetSelection[],
  options: { locale?: 'en' | 'zh-TW'; detected?: boolean; reads?: Array<string | null> } = {}) {
  const registry = async () => ({ state: 'ready' as const, providers: listProductProviders().filter((p) => p.id === 'kimi') });
  const models = async () => structuredClone(MODELS);
  const advanced = async (_provider: string, _instance?: string | null, basisId?: string | null) => {
    options.reads?.push(basisId ?? null);
    if (basisId && basisId !== 'mainland-cn') throw new ProviderCatalogBasisUnknownError(`Catalog basis '${basisId}' does not exist`, basisId);
    return advancedFor(basisId ?? null, options.detected ?? true);
  };
  function Picker() {
    const [target, setTarget] = useState<ProviderTargetSelection>({ provider: 'kimi', instance: 'cli/native',
      model: initial.model ?? '', modelSelection: initial.modelSelection ?? null });
    const change = useCallback((next: ProviderTargetSelection) => { changes.push(next); setTarget(next); }, []);
    return <I18nProvider locale={options.locale ?? 'en'}><ProviderModelFields provider={target.provider} instance={target.instance}
      model={target.model} modelSelection={target.modelSelection} onTargetChange={change}
      fetchProviderRegistry={registry} fetchProviderModels={models} fetchAdvancedProviderModels={advanced} /></I18nProvider>;
  }
  return render(<Picker />);
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

test('a new selection starts on the detected basis, shown in one List basis select before Model', async (t) => {
  reset(); t.after(reset);
  const changes: ProviderTargetSelection[] = [];
  const view = renderPicker({}, changes);
  await waitFor(() => assert.equal(changes.at(-1)?.modelSelection?.basisId, 'mainland-cn'));
  // No first-basis default was published on the way.
  assert.ok(changes.every((change) => change.modelSelection?.basisId === 'mainland-cn'), JSON.stringify(changes));
  assert.equal(changes.at(-1)?.model, 'cn-only');
  const basis = view.getByRole('combobox', { name: /^List basis/ }) as HTMLSelectElement;
  assert.deepEqual([...basis.options].map((option) => [option.value, option.textContent]),
    [['', 'global (kimi.ai)'], ['mainland-cn', 'mainland-cn (kimi.com)']]);
  assert.equal(basis.value, 'mainland-cn');
  const selects = view.getAllByRole('combobox');
  assert.ok(selects.indexOf(basis) < selects.indexOf(view.getByRole('combobox', { name: /^Model/ })));
  assert.equal(view.queryByText(/another plan or region/), null);
  // The icon names the region and the capture of the shown basis.
  const icon = view.getByRole('img', { name: /^Model list basis: mainland-cn \(kimi\.com\)\./ });
  assert.equal(icon.getAttribute('data-tooltip'),
    'Models listed for a CLI signed in to the mainland-cn (kimi.com) region. Other regions can offer different models. '
    + 'Captured from CLI 2.5.3 on 2026-11-16.');
});

test('a saved selection without basisId stays on the first basis and gets a mismatch hint', async (t) => {
  reset(); t.after(reset);
  const changes: ProviderTargetSelection[] = [];
  const view = renderPicker({ model: 'k3', modelSelection: { entryId: 'k3', entryMode: 'explicit', catalogRevision: 'R' } }, changes);
  const basis = await waitFor(() => view.getByRole('combobox', { name: /^List basis/ }) as HTMLSelectElement);
  await settle();
  assert.equal(basis.value, '');
  assert.ok(changes.every((change) => !change.modelSelection?.basisId), JSON.stringify(changes));
  assert.ok(view.getByText(/This list is for another plan or region than the CLI sign-in on the Runtime host/));
});

test('changing the basis keeps a listed entry and otherwise takes the new list default', async (t) => {
  reset(); t.after(reset);
  const changes: ProviderTargetSelection[] = [];
  const view = renderPicker({ model: 'shared', modelSelection: { entryId: 'shared', entryMode: 'explicit', catalogRevision: 'R' } }, changes);
  const basis = await waitFor(() => view.getByRole('combobox', { name: /^List basis/ }) as HTMLSelectElement);
  await settle();
  fireEvent.change(basis, { target: { value: 'mainland-cn' } });
  await waitFor(() => assert.equal(changes.at(-1)?.modelSelection?.basisId, 'mainland-cn'));
  assert.equal(changes.at(-1)?.model, 'shared');
  // No notice flashes while the new list loads.
  assert.equal(view.queryByText(/no longer offered/), null);
  // Back to the first basis: it is named by omission.
  // The select stayed mounted while mainland loaded, so this is still the same element.
  assert.equal(basis.isConnected, true);
  fireEvent.change(basis, { target: { value: '' } });
  await waitFor(() => assert.equal(changes.at(-1)?.modelSelection?.basisId, undefined));
  assert.equal(changes.at(-1)?.model, 'shared');

  reset();
  const fromK3: ProviderTargetSelection[] = [];
  const second = renderPicker({ model: 'k3', modelSelection: { entryId: 'k3', entryMode: 'explicit', catalogRevision: 'R' } }, fromK3);
  const secondBasis = await waitFor(() => second.getByRole('combobox', { name: /^List basis/ }) as HTMLSelectElement);
  await settle();
  fireEvent.change(secondBasis, { target: { value: 'mainland-cn' } });
  await waitFor(() => assert.equal(fromK3.at(-1)?.modelSelection?.basisId, 'mainland-cn'));
  assert.equal(fromK3.at(-1)?.model, 'cn-only');
});

test('a saved basis Runtime no longer has stays saved, shown as no longer offered', async (t) => {
  reset(); t.after(reset);
  const changes: ProviderTargetSelection[] = [];
  const reads: Array<string | null> = [];
  const view = renderPicker({ model: 'k3', modelSelection: { basisId: 'retired', entryId: 'k3', entryMode: 'explicit', catalogRevision: 'R' } },
    changes, { reads });
  await waitFor(() => assert.ok(view.getByText('List basis retired is no longer offered. Choose it again.')));
  const basis = view.getByRole('combobox', { name: /^List basis/ }) as HTMLSelectElement;
  assert.equal(basis.selectedOptions[0]?.textContent, 'retired (no longer offered)');
  assert.equal(basis.selectedOptions[0]?.disabled, true);
  await settle();
  // Never substituted, and the unknown basis is not asked for again and again.
  assert.deepEqual(changes, []);
  assert.equal(reads.filter((read) => read === 'retired').length, 1);
});

test('without a detected basis a new selection takes the first basis and shows no hint', async (t) => {
  reset(); t.after(reset);
  const changes: ProviderTargetSelection[] = [];
  const view = renderPicker({}, changes, { detected: false, locale: 'zh-TW' });
  await waitFor(() => assert.equal(changes.at(-1)?.model, 'k3'));
  assert.equal(changes.at(-1)?.modelSelection?.basisId, undefined);
  assert.ok(view.getByRole('combobox', { name: /^清單依據/ }));
  assert.equal(view.queryByText(/方案或地區與 Runtime 主機/), null);
});

test('a custom model string stays as typed when the basis changes', async (t) => {
  reset(); t.after(reset);
  const changes: ProviderTargetSelection[] = [];
  const view = renderPicker({ model: 'kimi-code/my-alias', modelSelection: null }, changes);
  const basis = await waitFor(() => view.getByRole('combobox', { name: /^List basis/ }) as HTMLSelectElement);
  await settle();
  const before = changes.length;
  fireEvent.change(basis, { target: { value: 'mainland-cn' } });
  await waitFor(() => assert.equal(basis.value, 'mainland-cn'));
  await settle();
  assert.ok(changes.slice(before).every((change) => change.model === 'kimi-code/my-alias' && !change.modelSelection),
    JSON.stringify(changes.slice(before)));
});
