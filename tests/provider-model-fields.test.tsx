import assert from 'node:assert/strict';
import test from 'node:test';

import {
  catalogMatchesTarget,
  countRequestScopedControls,
  filterPersistentControlValues,
  listPersistentControlOptions,
  resolveProviderSupportBadge,
  resolveSelectedInstanceEventCapabilities,
  shouldTreatPersistedTargetAsLegacyModel,
  shouldShowInstanceField,
  shouldDeferCatalogTargetReconciliation,
} from '../src/design/components/ProviderModelFields.tsx';
import { formatProviderEventCapabilitiesSummary } from '../src/shared/providerEventCapabilities.ts';

test('static fallback catalogs do not overwrite an existing model selection during panel reopen', () => {
  assert.equal(
    shouldDeferCatalogTargetReconciliation({
      catalogSource: 'static',
      advancedCatalogSource: 'static',
      model: 'claude-opus-4-6',
      modelSelection: {
        entryId: 'claude-opus-4-6',
        entryMode: 'explicit',
        presetId: 'deep-reasoning',
      },
    }),
    true,
  );
});

test('static fallback catalogs still resolve an initial empty target', () => {
  assert.equal(
    shouldDeferCatalogTargetReconciliation({
      catalogSource: 'static',
      advancedCatalogSource: 'static',
      model: '',
      modelSelection: null,
    }),
    false,
  );
});

test('stale catalogs from the previous instance are ignored during instance switches', () => {
  assert.equal(
    catalogMatchesTarget({
      catalogProvider: 'claude',
      catalogInstance: 'sdk',
      provider: 'claude',
      instance: 'sonnet',
    }),
    false,
  );
  assert.equal(
    catalogMatchesTarget({
      catalogProvider: 'claude',
      catalogInstance: 'sonnet',
      provider: 'claude',
      instance: 'sonnet',
    }),
    true,
  );
});

test('instance field stays hidden when a provider only exposes one runtime instance', () => {
  assert.equal(
    shouldShowInstanceField({
      resolvedInstance: 'native',
      instanceOptions: [
        {
          id: 'native',
          label: 'cli/native',
          target: 'cli/native',
          backend: 'cli',
        },
      ],
    }),
    false,
  );
});

test('selected instance capability summary reflects runtime-owned event truth', () => {
  const capabilities = resolveSelectedInstanceEventCapabilities({
    resolvedInstance: 'native',
    instanceOptions: [
      {
        id: 'native',
        label: 'cli/native',
        target: 'cli/native',
        backend: 'cli',
        eventCapabilities: {
          normalizedStream: {
            text: { mode: 'chunk', stepwise: true },
            toolUse: 'native',
            toolResult: 'native',
            progress: 'derived',
            reasoning: 'none',
          },
          transcript: {
            contentBlocks: 'native',
          },
          presentation: {
            recommended: 'content_blocks',
          },
          notes: [],
        },
      },
    ],
  });

  assert.equal(
    formatProviderEventCapabilitiesSummary(capabilities),
    'Runtime event surface: chunk text, tool use, tool results, derived progress, transcript blocks. Recommended host view: content blocks.',
  );
});

test('unknown capability truth stays silent in provider hints', () => {
  assert.equal(
    formatProviderEventCapabilitiesSummary({
      normalizedStream: {
        text: { mode: 'unknown', stepwise: false },
        toolUse: 'unknown',
        toolResult: 'unknown',
        progress: 'unknown',
        reasoning: 'unknown',
      },
      transcript: {
        contentBlocks: 'unknown',
      },
      presentation: {
        recommended: 'unknown',
      },
      notes: [],
    }),
    null,
  );
});

test('support badge labels match runtime catalog support tiers', () => {
  assert.deepEqual(resolveProviderSupportBadge('full'), {
    label: 'Advanced',
    tone: 'advanced',
  });
  assert.deepEqual(resolveProviderSupportBadge('entry_only'), {
    label: 'Catalog',
    tone: 'catalog',
  });
  assert.deepEqual(resolveProviderSupportBadge('read_only'), {
    label: 'Read-only',
    tone: 'readOnly',
  });
});

test('static fallback catalogs do not classify unknown persisted models as legacy before runtime data arrives', () => {
  assert.equal(
    shouldTreatPersistedTargetAsLegacyModel({
      catalog: {
        provider: 'claude',
        backend: 'cli',
        instance: 'native',
        defaultModel: 'claude-opus-4-6',
        source: 'static',
        cache: null,
        models: [
          { id: 'claude-opus-4-6', label: 'Opus 4.6', default: true },
        ],
        warnings: [],
      },
      model: 'claude-sonnet-4-6',
      modelSelection: null,
    }),
    false,
  );
});

test('persistent selector controls exclude request-only overrides for the chosen entry', () => {
  const controls = [
    {
      key: 'openai.reasoning_effort',
      label: 'Reasoning effort',
      kind: 'enum',
      scope: 'session_default',
      values: [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
      ],
      applicableEntryIds: ['gpt-5.4'],
    },
    {
      key: 'openai.max_output_tokens',
      label: 'Max output tokens',
      kind: 'number',
      scope: 'request',
      applicableEntryIds: ['gpt-5.4'],
    },
  ];

  assert.deepEqual(
    listPersistentControlOptions(controls, 'gpt-5.4').map((control) => control.key),
    ['openai.reasoning_effort'],
  );
  assert.equal(countRequestScopedControls(controls, 'gpt-5.4'), 1);
  assert.deepEqual(
    filterPersistentControlValues(controls, 'gpt-5.4', {
      'openai.reasoning_effort': 'medium',
      'openai.max_output_tokens': 2048,
    }),
    {
      'openai.reasoning_effort': 'medium',
    },
  );
});
