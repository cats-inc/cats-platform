import assert from 'node:assert/strict';
import test from 'node:test';

import {
  catalogMatchesTarget,
  countRequestScopedControls,
  filterPersistentControlValues,
  hasExplicitDefaultEnumOption,
  listPersistentControlOptions,
  resolveDisplayedEnumControlValue,
  resolveProviderSupportBadge,
  resolveSelectedInstanceEventCapabilities,
  sanitizePersistentTargetSelection,
  shouldAllowLegacyManualModelEntry,
  shouldTreatPersistedTargetAsLegacyModel,
  shouldShowInstanceField,
  shouldDeferCatalogTargetReconciliation,
} from '../src/design/components/ProviderModelFields.tsx';
import {
  createStaticProviderModelCatalog,
  normalizeProviderAdvancedModelCatalog,
} from '../src/shared/providerCatalog.ts';
import { formatProviderEventCapabilitiesSummary } from '../src/shared/providerEventCapabilities.ts';
import { resolveCatalogTargetSelection } from '../src/shared/providerSelection.ts';

function buildCurrentAdvancedCatalog(provider: 'claude' | 'codex') {
  const baseCatalog = createStaticProviderModelCatalog(provider, { instance: 'native' });
  const controls = provider === 'claude'
    ? [{
        key: 'claude.reasoning_effort',
        label: 'Reasoning effort',
        kind: 'enum',
        scope: 'both',
        applicableEntryIds: ['default', 'sonnet'],
        values: [
          { value: 'low', label: 'Low', applicableEntryIds: ['default', 'sonnet'] },
          { value: 'medium', label: 'Medium (default)', applicableEntryIds: ['default', 'sonnet'] },
          { value: 'high', label: 'High', applicableEntryIds: ['default', 'sonnet'] },
          { value: 'max', label: 'Max', applicableEntryIds: ['default'] },
        ],
      }]
    : [{
        key: 'codex.reasoning_effort',
        label: 'Reasoning effort',
        kind: 'enum',
        scope: 'both',
        applicableEntryIds: [
          'gpt-5.4',
          'gpt-5.4-mini',
          'gpt-5.3-codex',
          'gpt-5.2-codex',
          'gpt-5.2',
          'gpt-5.1-codex-max',
          'gpt-5.1-codex-mini',
        ],
        values: [
          {
            value: 'low',
            label: 'Low',
            applicableEntryIds: [
              'gpt-5.4',
              'gpt-5.4-mini',
              'gpt-5.3-codex',
              'gpt-5.2-codex',
              'gpt-5.2',
              'gpt-5.1-codex-max',
            ],
          },
          {
            value: 'medium',
            label: 'Medium (default)',
            applicableEntryIds: [
              'gpt-5.4',
              'gpt-5.4-mini',
              'gpt-5.3-codex',
              'gpt-5.2-codex',
              'gpt-5.2',
              'gpt-5.1-codex-max',
              'gpt-5.1-codex-mini',
            ],
          },
          {
            value: 'high',
            label: 'High',
            applicableEntryIds: [
              'gpt-5.4',
              'gpt-5.4-mini',
              'gpt-5.3-codex',
              'gpt-5.2-codex',
              'gpt-5.2',
              'gpt-5.1-codex-max',
              'gpt-5.1-codex-mini',
            ],
          },
          {
            value: 'xhigh',
            label: 'Extra high',
            applicableEntryIds: [
              'gpt-5.4',
              'gpt-5.4-mini',
              'gpt-5.3-codex',
              'gpt-5.2-codex',
              'gpt-5.2',
              'gpt-5.1-codex-max',
            ],
          },
        ],
      }];
  const controlKey = provider === 'claude'
    ? 'claude.reasoning_effort'
    : 'codex.reasoning_effort';

  const catalog = {
    ...baseCatalog,
    backend: 'cli',
    source: 'dynamic' as const,
  };
  const advancedCatalog = normalizeProviderAdvancedModelCatalog({
    provider,
    backend: 'cli',
    instance: 'native',
    defaultModel: catalog.defaultModel,
    source: 'dynamic',
    cache: null,
    entries: catalog.models,
    presets: [],
    controls,
    defaultSelection: catalog.defaultModel
      ? {
          entryId: catalog.defaultModel,
          entryMode: 'explicit',
          controls: {
            [controlKey]: 'medium',
          },
        }
      : null,
    support: {
      tier: 'full',
      notes: [],
    },
    warnings: [],
  }, provider);

  return { catalog, advancedCatalog, controlKey };
}

function reconcileReopenedTarget(input: {
  provider: 'claude' | 'codex';
  model: string;
  modelSelection: {
    entryId: string;
    entryMode: 'explicit' | 'auto';
    controls?: Record<string, string>;
  };
}) {
  const { catalog, advancedCatalog } = buildCurrentAdvancedCatalog(input.provider);
  const resolvedTarget = resolveCatalogTargetSelection({
    target: {
      provider: input.provider,
      instance: 'native',
      model: input.model,
      modelSelection: input.modelSelection,
    },
    catalog,
    advancedCatalog,
    preserveCurrentModel: true,
    preserveCurrentSelection: true,
  });
  return {
    advancedCatalog,
    target: sanitizePersistentTargetSelection({
      target: resolvedTarget,
      controls: advancedCatalog.controls,
    }),
  };
}

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

test('empty truthful catalogs do not automatically unlock manual legacy model entry', () => {
  assert.equal(
    shouldAllowLegacyManualModelEntry({
      entryCount: 0,
      isLegacyModelTarget: false,
    }),
    false,
  );
  assert.equal(
    shouldAllowLegacyManualModelEntry({
      entryCount: 0,
      isLegacyModelTarget: true,
    }),
    true,
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

test('persistent selector sanitization keeps request controls out of modelSelection but preserves modelResolution', () => {
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

  const sanitized = sanitizePersistentTargetSelection({
    controls,
    target: {
      provider: 'codex',
      instance: 'main',
      model: 'gpt-5.4',
      modelSelection: {
        entryId: 'gpt-5.4',
        entryMode: 'auto',
        presetId: 'balanced',
        controls: {
          'openai.reasoning_effort': 'medium',
          'openai.max_output_tokens': 2048,
        },
      },
      modelResolution: {
        entryId: 'gpt-5.4',
        model: 'gpt-5.4',
        entryMode: 'auto',
        presetId: 'balanced',
        controls: {
          'openai.reasoning_effort': 'medium',
          'openai.max_output_tokens': 2048,
        },
        supportTier: 'full',
        warnings: [],
      },
    },
  });

  assert.deepEqual(sanitized.modelSelection?.controls, {
    'openai.reasoning_effort': 'medium',
  });
  assert.deepEqual(sanitized.modelResolution?.controls, {
    'openai.reasoning_effort': 'medium',
    'openai.max_output_tokens': 2048,
  });
});

test('persistent selector only exposes Codex effort values supported by the selected entry', () => {
  const controls = [
    {
      key: 'codex.reasoning_effort',
      label: 'Reasoning effort',
      kind: 'enum',
      scope: 'both',
      applicableEntryIds: ['gpt-5.4', 'gpt-5.1-codex-mini'],
      values: [
        { value: 'low', label: 'Low', applicableEntryIds: ['gpt-5.4'] },
        { value: 'medium', label: 'Medium (default)', applicableEntryIds: ['gpt-5.4', 'gpt-5.1-codex-mini'] },
        { value: 'high', label: 'High', applicableEntryIds: ['gpt-5.4', 'gpt-5.1-codex-mini'] },
        { value: 'xhigh', label: 'Extra high', applicableEntryIds: ['gpt-5.4'] },
      ],
    },
  ];

  assert.deepEqual(
    listPersistentControlOptions(controls, 'gpt-5.1-codex-mini')[0]?.values,
    [
      { value: 'medium', label: 'Medium (default)', applicableEntryIds: ['gpt-5.4', 'gpt-5.1-codex-mini'] },
      { value: 'high', label: 'High', applicableEntryIds: ['gpt-5.4', 'gpt-5.1-codex-mini'] },
    ],
  );
  assert.deepEqual(
    filterPersistentControlValues(controls, 'gpt-5.1-codex-mini', {
      'codex.reasoning_effort': 'xhigh',
    }),
    undefined,
  );
  assert.equal(hasExplicitDefaultEnumOption(controls[0], 'gpt-5.1-codex-mini'), true);
  assert.equal(
    resolveDisplayedEnumControlValue(controls[0], 'gpt-5.1-codex-mini', undefined),
    'medium',
  );
});

test('persistent selector hides Claude effort controls for Haiku', () => {
  const controls = [
    {
      key: 'claude.reasoning_effort',
      label: 'Reasoning effort',
      kind: 'enum',
      scope: 'both',
      applicableEntryIds: ['default', 'sonnet'],
      values: [
        { value: 'low', label: 'Low', applicableEntryIds: ['default', 'sonnet'] },
        { value: 'medium', label: 'Medium', applicableEntryIds: ['default', 'sonnet'] },
        { value: 'high', label: 'High', applicableEntryIds: ['default', 'sonnet'] },
        { value: 'max', label: 'Max', applicableEntryIds: ['default'] },
      ],
    },
  ];

  assert.deepEqual(listPersistentControlOptions(controls, 'haiku'), []);
});

test('runtime reconciliation keeps Claude Max when reopening an Opus selection', () => {
  const { advancedCatalog, target } = reconcileReopenedTarget({
    provider: 'claude',
    model: 'default',
    modelSelection: {
      entryId: 'default',
      entryMode: 'explicit',
      controls: {
        'claude.reasoning_effort': 'max',
      },
    },
  });

  assert.equal(
    shouldDeferCatalogTargetReconciliation({
      catalogSource: 'dynamic',
      advancedCatalogSource: advancedCatalog.source,
      model: 'default',
      modelSelection: target.modelSelection,
    }),
    false,
  );
  assert.deepEqual(target.modelSelection, {
    entryId: 'default',
    entryMode: 'explicit',
    controls: {
      'claude.reasoning_effort': 'max',
    },
  });
  assert.equal(
    resolveDisplayedEnumControlValue(advancedCatalog.controls[0], 'default', target.modelSelection?.controls?.['claude.reasoning_effort']),
    'max',
  );
});

test('runtime reconciliation sanitizes Claude Max when reopening a Sonnet selection', () => {
  const { advancedCatalog, target } = reconcileReopenedTarget({
    provider: 'claude',
    model: 'sonnet',
    modelSelection: {
      entryId: 'sonnet',
      entryMode: 'explicit',
      controls: {
        'claude.reasoning_effort': 'max',
      },
    },
  });

  assert.deepEqual(
    listPersistentControlOptions(advancedCatalog.controls, 'sonnet')[0]?.values?.map((option) => option.value),
    ['low', 'medium', 'high'],
  );
  assert.deepEqual(target.modelSelection, {
    entryId: 'sonnet',
    entryMode: 'explicit',
  });
  assert.equal(
    resolveDisplayedEnumControlValue(advancedCatalog.controls[0], 'sonnet', target.modelSelection?.controls?.['claude.reasoning_effort']),
    'medium',
  );
});

test('runtime reconciliation keeps Codex Extra High when reopening a gpt-5.4 selection', () => {
  const { advancedCatalog, target } = reconcileReopenedTarget({
    provider: 'codex',
    model: 'gpt-5.4',
    modelSelection: {
      entryId: 'gpt-5.4',
      entryMode: 'explicit',
      controls: {
        'codex.reasoning_effort': 'xhigh',
      },
    },
  });

  assert.equal(
    shouldDeferCatalogTargetReconciliation({
      catalogSource: 'dynamic',
      advancedCatalogSource: advancedCatalog.source,
      model: 'gpt-5.4',
      modelSelection: target.modelSelection,
    }),
    false,
  );
  assert.deepEqual(target.modelSelection, {
    entryId: 'gpt-5.4',
    entryMode: 'explicit',
    controls: {
      'codex.reasoning_effort': 'xhigh',
    },
  });
  assert.equal(
    resolveDisplayedEnumControlValue(advancedCatalog.controls[0], 'gpt-5.4', target.modelSelection?.controls?.['codex.reasoning_effort']),
    'xhigh',
  );
});

test('runtime reconciliation sanitizes Codex Extra High when reopening a gpt-5.1-codex-mini selection', () => {
  const { advancedCatalog, target } = reconcileReopenedTarget({
    provider: 'codex',
    model: 'gpt-5.1-codex-mini',
    modelSelection: {
      entryId: 'gpt-5.1-codex-mini',
      entryMode: 'explicit',
      controls: {
        'codex.reasoning_effort': 'xhigh',
      },
    },
  });

  assert.deepEqual(
    listPersistentControlOptions(advancedCatalog.controls, 'gpt-5.1-codex-mini')[0]?.values?.map((option) => option.value),
    ['medium', 'high'],
  );
  assert.deepEqual(target.modelSelection, {
    entryId: 'gpt-5.1-codex-mini',
    entryMode: 'explicit',
  });
  assert.equal(
    resolveDisplayedEnumControlValue(
      advancedCatalog.controls[0],
      'gpt-5.1-codex-mini',
      target.modelSelection?.controls?.['codex.reasoning_effort'],
    ),
    'medium',
  );
});
