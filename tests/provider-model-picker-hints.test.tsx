// Must come first: React captures `canUseDOM` when its module body runs.
import { resetTestDom } from './helpers/installDomBeforeReact.ts';

import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanup, render, waitFor } from '@testing-library/react';
import React from 'react';

import { createFixtureProviderAdvancedCatalog, createFixtureProviderModelCatalog } from './helpers/catalogFixture.js';
import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { clearProviderCatalogClientCache } from '../src/app/renderer/providerCatalogClient.ts';
import { clearProviderRegistryClientCache } from '../src/app/renderer/providerRegistryClient.ts';
import { ProviderModelFields } from '../src/design/components/ProviderModelFields.tsx';
import { listProductProviders } from '../src/shared/providerCatalog.ts';
import type { ProviderModelSelection } from '../src/shared/providerSelection.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

function reset(): void {
  cleanup();
  resetTestDom();
  clearProviderCatalogClientCache();
  clearProviderRegistryClientCache();
}

const INSTANCE = 'cli/native';
const PRESET_DESCRIPTION = 'Deep mode spends more effort per turn.';
const REQUEST_CONTROL_DESCRIPTION = 'Caps output tokens for one request.';

// Every descriptive line the picker used to print under its fields.
const REMOVED_HINTS = [
  'Runtime event surface',
  'Recommended host view',
  'Picker description',
  'Controls Claude Code effort',
  PRESET_DESCRIPTION,
  REQUEST_CONTROL_DESCRIPTION,
  'Extra tuning for this model',
  'exposes only the base catalog entry',
  'Request-only runtime overrides',
];

const fetchProviderRegistry = async () => ({
  state: 'ready' as const,
  providers: listProductProviders().filter((provider) => provider.id === 'claude').map((provider) => ({
    ...provider,
    instances: provider.instances.map((instance) => ({
      ...instance,
      eventCapabilities: {
        normalizedStream: {
          text: { mode: 'chunk' as const, stepwise: true },
          toolUse: 'native' as const,
          toolResult: 'native' as const,
          progress: 'derived' as const,
          reasoning: 'none' as const,
        },
        transcript: { contentBlocks: 'native' as const },
        presentation: { recommended: 'content_blocks' as const },
        notes: [],
      },
    })),
  })),
});
const fetchProviderModels = async () => createFixtureProviderModelCatalog('claude', { instance: INSTANCE });

function renderPicker(input: {
  fetchAdvancedProviderModels: () => Promise<ReturnType<typeof createFixtureProviderAdvancedCatalog>>;
  modelSelection: ProviderModelSelection | null;
}) {
  return render(<I18nProvider locale="en"><ProviderModelFields provider="claude" instance={INSTANCE}
    model="opus" modelSelection={input.modelSelection} onTargetChange={() => {}}
    fetchProviderRegistry={fetchProviderRegistry} fetchProviderModels={fetchProviderModels}
    fetchAdvancedProviderModels={input.fetchAdvancedProviderModels} /></I18nProvider>);
}

function assertNoDescriptiveHints(container: HTMLElement): void {
  for (const hint of REMOVED_HINTS) {
    assert.ok(!container.textContent?.includes(hint), `picker still shows "${hint}"`);
  }
  assert.equal(container.querySelectorAll('.fieldHint').length, 0);
}

test('the picker shows no descriptive hints for a selected mode and request-only controls', async (t) => {
  reset(); t.after(reset);
  const advanced = createFixtureProviderAdvancedCatalog('claude', { instance: INSTANCE });
  advanced.presets = [{ id: 'deep', label: 'Deep', description: PRESET_DESCRIPTION, applicableEntryIds: ['opus'] }];
  const opus = advanced.entries.find((entry) => entry.id === 'opus');
  assert.ok(opus);
  opus.controls = [...(opus.controls ?? []), {
    key: 'claude.max_output_tokens',
    label: 'Max output tokens',
    description: REQUEST_CONTROL_DESCRIPTION,
    kind: 'number',
    scope: 'request',
  }];
  const view = renderPicker({
    fetchAdvancedProviderModels: async () => advanced,
    modelSelection: { entryId: 'opus', entryMode: 'explicit', presetId: 'deep', controls: {} },
  });

  await waitFor(() => {
    assert.equal((view.getByRole('combobox', { name: /^Model/ }) as HTMLSelectElement).value, 'opus');
    assert.equal((view.getByRole('combobox', { name: 'Mode' }) as HTMLSelectElement).value, 'deep');
    assert.ok(view.getByRole('combobox', { name: 'Reasoning effort' }));
  });
  assertNoDescriptiveHints(view.container);
});

test('the picker shows no hint when a target offers only the standard mode', async (t) => {
  reset(); t.after(reset);
  const view = renderPicker({
    fetchAdvancedProviderModels: async () => createFixtureProviderAdvancedCatalog('claude', { instance: INSTANCE }),
    modelSelection: null,
  });

  await waitFor(() => {
    assert.equal((view.getByRole('combobox', { name: /^Model/ }) as HTMLSelectElement).value, 'opus');
    assert.ok(view.getByRole('combobox', { name: 'Reasoning effort' }));
  });
  assertNoDescriptiveHints(view.container);
});
