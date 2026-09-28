import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import { createFixtureProviderAdvancedCatalog, createFixtureProviderModelCatalog } from './helpers/catalogFixture.js';
import test from 'node:test';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import React, { useCallback, useState } from 'react';
import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { clearProviderCatalogClientCache } from '../src/app/renderer/providerCatalogClient.ts';
import { clearProviderRegistryClientCache } from '../src/app/renderer/providerRegistryClient.ts';
import { ProviderModelFields } from '../src/design/components/ProviderModelFields.tsx';
import { listProductProviders, normalizeProviderAdvancedModelCatalog } from '../src/shared/providerCatalog.ts';
import type { ProviderTargetSelection } from '../src/shared/providerSelection.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

function reset(): void {
  cleanup();
  resetTestDom();
  clearProviderCatalogClientCache();
  clearProviderRegistryClientCache();
}

function renderPicker(provider: string, locale: 'en' | 'zh-TW', changes: ProviderTargetSelection[]) {
  const registry = async () => ({ state: 'ready' as const,
    providers: listProductProviders().filter((p) => p.id === provider) });
  const models = async () => createFixtureProviderModelCatalog(provider, { instance: 'cli/native' });
  const advanced = async () => createFixtureProviderAdvancedCatalog(provider, { instance: 'cli/native' });
  function Picker() {
    const [target, setTarget] = useState<ProviderTargetSelection>({ provider, instance: 'cli/native', model: '', modelSelection: null });
    const change = useCallback((next: ProviderTargetSelection) => { changes.push(next); setTarget(next); }, []);
    return <I18nProvider locale={locale}><ProviderModelFields provider={target.provider} instance={target.instance}
      model={target.model} modelSelection={target.modelSelection} onTargetChange={change}
      fetchProviderRegistry={registry} fetchProviderModels={models} fetchAdvancedProviderModels={advanced} /></I18nProvider>;
  }
  return render(<Picker />);
}

test('a channel basis shows as a focusable info icon whose tooltip names the channel', async (t) => {
  reset(); t.after(reset);
  const changes: ProviderTargetSelection[] = [];
  const view = renderPicker('pi', 'en', changes);
  const icon = await waitFor(() => view.getByRole('img', { name: /^Model list basis: openai-codex\./ }));
  const hint = 'Models listed for the openai-codex channel. Enter a custom model to use another channel.';
  assert.equal(icon.getAttribute('data-tooltip'), hint);
  assert.equal(icon.getAttribute('data-tooltip-focus'), 'true');
  assert.equal(icon.getAttribute('tabindex'), '0');
  assert.equal(icon.textContent, 'i');
  assert.equal(icon.tagName, 'SPAN');
  // The select keeps its Model name, and clicking the icon neither selects nor submits anything.
  assert.ok(view.getByRole('combobox', { name: /^Model/ }));
  await waitFor(() => assert.ok(changes.length > 0));
  const before = changes.length;
  fireEvent.click(icon);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(changes.length, before);
  assert.ok(changes.every((change) => !JSON.stringify(change).includes('basis')));
});

test('a plan basis uses the localized plan text, and scopes without a basis show no icon', async (t) => {
  reset(); t.after(reset);
  const copilot = renderPicker('copilot', 'zh-TW', []);
  const icon = await waitFor(() => copilot.getByRole('img', { name: /^模型清單依據：Copilot Pro。/ }));
  assert.equal(icon.getAttribute('data-tooltip'), '此清單依據 Copilot Pro 帳號擷取。其他方案可用的模型可能不同。');
  reset();
  const claude = renderPicker('claude', 'en', []);
  await waitFor(() => assert.ok(claude.getByRole('combobox', { name: /^Model/ })));
  assert.equal(claude.queryByRole('img', { name: /Model list basis/ }), null);
});

test('the advanced catalog normalizer keeps a valid basis and drops empty or partial ones', () => {
  const read = (basis: unknown) => normalizeProviderAdvancedModelCatalog({ basis }, 'fixture').basis;
  assert.deepEqual(read({ channel: { id: 'openai-codex', label: 'openai-codex' } }), { channel: { id: 'openai-codex', label: 'openai-codex' } });
  assert.deepEqual(read({ plan: { label: 'Copilot Pro' }, extra: true }), { plan: { label: 'Copilot Pro' } });
  assert.equal(read(undefined), undefined);
  assert.equal(read({ channel: { id: 'x' } }), undefined);
  assert.equal(read({ plan: { label: '  ' } }), undefined);
});
