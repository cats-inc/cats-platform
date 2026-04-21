import assert from 'node:assert/strict';
import test from 'node:test';

import {
  attachExecutionLabelToProviderTarget,
  catalogMatchesTarget,
  countRequestScopedControls,
  filterPersistentControlValues,
  formatCatalogEntryLabel,
  hasExplicitDefaultEnumOption,
  PROVIDER_REGISTRY_AUTO_RECHECK_COOLDOWN_MS,
  listPersistentControlOptions,
  resolveProviderRegistryHint,
  resolveProviderRegistryAutoRecheckDelayMs,
  resolveProviderRegistrySetupHref,
  resolveProviderRegistryPlaceholder,
  resolveDisplayedEnumControlValue,
  resolveExecutionLabelForProviderTarget,
  resolveProviderModelFieldsViewState,
  resolveProviderSupportBadge,
  resolveSelectedInstanceEventCapabilities,
  resolveUnsupportedPersistentControlWarning,
  sanitizePersistentTargetSelection,
  shouldAutoRecheckProviderRegistry,
  shouldAllowLegacyManualModelEntry,
  shouldTreatPersistedTargetAsLegacyModel,
  shouldShowInstanceField,
  shouldDeferCatalogTargetReconciliation,
  updatePersistentControlValues,
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
        applicableEntryIds: ['opus', 'sonnet'],
        values: [
          { value: 'low', label: 'Low', applicableEntryIds: ['opus', 'sonnet'] },
          { value: 'medium', label: 'Medium (default)', applicableEntryIds: ['opus', 'sonnet'] },
          { value: 'high', label: 'High', applicableEntryIds: ['opus', 'sonnet'] },
          { value: 'max', label: 'Max', applicableEntryIds: ['opus'] },
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
          'gpt-5.3-codex-spark',
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
              'gpt-5.3-codex-spark',
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
              'gpt-5.3-codex-spark',
              'gpt-5.2-codex',
              'gpt-5.2',
              'gpt-5.1-codex-max',
            ],
          },
          {
            value: 'medium',
            label: 'Medium',
            applicableEntryIds: [
              'gpt-5.3-codex-spark',
            ],
          },
          {
            value: 'high',
            label: 'High (default)',
            applicableEntryIds: [
              'gpt-5.3-codex-spark',
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

test('createStaticProviderModelCatalog preserves the curated Gemini CLI order', () => {
  const catalog = createStaticProviderModelCatalog('gemini', { instance: 'native' });

  assert.equal(catalog.defaultModel, 'gemini-3.1-pro-preview');
  assert.deepEqual(
    catalog.models.map((model) => model.id),
    [
      'gemini-3.1-pro-preview',
      'gemini-3-flash-preview',
      'gemini-3.1-flash-lite-preview',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
    ],
  );
});

test('createStaticProviderModelCatalog exposes Cursor Composer 2 Fast as the static default', () => {
  const catalog = createStaticProviderModelCatalog('cursor', { instance: 'native' });

  assert.equal(catalog.defaultModel, 'composer-2-fast');
  assert.equal(
    catalog.models.find((model) => model.default)?.id,
    'composer-2-fast',
  );
});

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

test('catalog entry labels hide available markers but keep actionable statuses', () => {
  assert.equal(
    formatCatalogEntryLabel({
      label: 'GPT-5.4',
      status: 'available',
    }),
    'GPT-5.4',
  );
  assert.equal(
    formatCatalogEntryLabel({
      label: 'GPT-5.4',
      status: ' supported ',
    }),
    'GPT-5.4',
  );
  assert.equal(
    formatCatalogEntryLabel({
      label: 'GPT-5.4',
      status: 'Preview',
    }),
    'GPT-5.4 (preview)',
  );
  assert.equal(
    formatCatalogEntryLabel({
      label: 'GPT-5.4',
      status: 'deprecated',
    }),
    'GPT-5.4 (deprecated)',
  );
  assert.equal(
    formatCatalogEntryLabel({
      label: 'GPT-5.4',
      status: 'experimental',
    }),
    'GPT-5.4 (experimental)',
  );
});

test('provider registry empty states distinguish runtime failure from no usable targets', () => {
  assert.equal(
    resolveProviderRegistryPlaceholder({
      providersLoaded: false,
      registryState: 'ready',
    }),
    'Loading available providers...',
  );
  assert.equal(
    resolveProviderRegistryPlaceholder({
      providersLoaded: true,
      registryState: 'runtime_unreachable',
    }),
    'Could not load runtime-backed providers',
  );
  assert.equal(
    resolveProviderRegistryHint({
      providersLoaded: true,
      registry: {
        state: 'runtime_unreachable',
        providers: [],
        warnings: ['Runtime provider registry timed out.'],
      },
    }),
    'Runtime provider registry timed out.',
  );
  assert.equal(
    resolveProviderRegistryHint({
      providersLoaded: true,
      registry: {
        state: 'no_usable_targets',
        providers: [],
      },
    }),
    'cats-runtime is connected, but it did not report any currently usable provider targets.',
  );
  assert.equal(
    resolveProviderRegistrySetupHref({
      state: 'no_usable_targets',
      providers: [],
      recovery: {
        openRuntimeSetupPath: '/runtime/setup',
      },
    }),
    '/runtime/setup',
  );
  assert.equal(
    resolveProviderRegistrySetupHref({
      state: 'runtime_unreachable',
      providers: [],
      recovery: {
        retryable: true,
      },
    }),
    null,
  );
});

test('provider registry auto-recheck only triggers for empty truthful states after returning to a visible window', () => {
  assert.equal(shouldAutoRecheckProviderRegistry({
    providersLoaded: false,
    providerCount: 0,
    registryState: 'runtime_unreachable',
    retryable: true,
    hasSetupHref: true,
    documentVisible: true,
    lastAutoRecheckAt: 0,
    now: PROVIDER_REGISTRY_AUTO_RECHECK_COOLDOWN_MS,
  }), false);

  assert.equal(shouldAutoRecheckProviderRegistry({
    providersLoaded: true,
    providerCount: 1,
    registryState: 'runtime_unreachable',
    retryable: true,
    hasSetupHref: true,
    documentVisible: true,
    lastAutoRecheckAt: 0,
    now: PROVIDER_REGISTRY_AUTO_RECHECK_COOLDOWN_MS,
  }), false);

  assert.equal(shouldAutoRecheckProviderRegistry({
    providersLoaded: true,
    providerCount: 0,
    registryState: 'runtime_unreachable',
    retryable: true,
    hasSetupHref: false,
    documentVisible: true,
    lastAutoRecheckAt: 0,
    now: PROVIDER_REGISTRY_AUTO_RECHECK_COOLDOWN_MS,
  }), true);

  assert.equal(shouldAutoRecheckProviderRegistry({
    providersLoaded: true,
    providerCount: 0,
    registryState: 'runtime_unreachable',
    retryable: true,
    hasSetupHref: true,
    documentVisible: false,
    lastAutoRecheckAt: 0,
    now: PROVIDER_REGISTRY_AUTO_RECHECK_COOLDOWN_MS,
  }), false);

  assert.equal(shouldAutoRecheckProviderRegistry({
    providersLoaded: true,
    providerCount: 0,
    registryState: 'no_usable_targets',
    retryable: true,
    hasSetupHref: true,
    documentVisible: true,
    lastAutoRecheckAt: 1000,
    now: 1000 + PROVIDER_REGISTRY_AUTO_RECHECK_COOLDOWN_MS - 1,
  }), false);

  assert.equal(shouldAutoRecheckProviderRegistry({
    providersLoaded: true,
    providerCount: 0,
    registryState: 'no_usable_targets',
    retryable: true,
    hasSetupHref: true,
    documentVisible: true,
    lastAutoRecheckAt: 1000,
    now: 1000 + PROVIDER_REGISTRY_AUTO_RECHECK_COOLDOWN_MS,
  }), true);
});

test('provider registry auto-recheck delay schedules retry instead of waiting for focus events only', () => {
  assert.equal(PROVIDER_REGISTRY_AUTO_RECHECK_COOLDOWN_MS, 30_000);

  assert.equal(resolveProviderRegistryAutoRecheckDelayMs({
    providersLoaded: true,
    providerCount: 0,
    registryState: 'runtime_unreachable',
    retryable: true,
    hasSetupHref: false,
    documentVisible: true,
    lastAutoRecheckAt: 0,
    now: 10_000,
  }), PROVIDER_REGISTRY_AUTO_RECHECK_COOLDOWN_MS - 10_000);

  assert.equal(resolveProviderRegistryAutoRecheckDelayMs({
    providersLoaded: true,
    providerCount: 0,
    registryState: 'runtime_unreachable',
    retryable: true,
    hasSetupHref: false,
    documentVisible: true,
    lastAutoRecheckAt: 10_000,
    now: 10_000 + PROVIDER_REGISTRY_AUTO_RECHECK_COOLDOWN_MS - 250,
  }), 250);

  assert.equal(resolveProviderRegistryAutoRecheckDelayMs({
    providersLoaded: true,
    providerCount: 1,
    registryState: 'runtime_unreachable',
    retryable: true,
    hasSetupHref: false,
    documentVisible: true,
    lastAutoRecheckAt: 10_000,
    now: 20_000,
  }), null);
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
      applicableEntryIds: ['opus', 'sonnet'],
      values: [
        { value: 'low', label: 'Low', applicableEntryIds: ['opus', 'sonnet'] },
        { value: 'medium', label: 'Medium', applicableEntryIds: ['opus', 'sonnet'] },
        { value: 'high', label: 'High', applicableEntryIds: ['opus', 'sonnet'] },
        { value: 'max', label: 'Max', applicableEntryIds: ['opus'] },
      ],
    },
  ];

  assert.deepEqual(listPersistentControlOptions(controls, 'haiku'), []);
});

test('runtime reconciliation keeps Claude Max when reopening an Opus selection', () => {
  const { advancedCatalog, target } = reconcileReopenedTarget({
    provider: 'claude',
    model: 'opus',
    modelSelection: {
      entryId: 'opus',
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
      model: 'opus',
      modelSelection: target.modelSelection,
    }),
    false,
  );
  assert.deepEqual(target.modelSelection, {
    entryId: 'opus',
    entryMode: 'explicit',
    controls: {
      'claude.reasoning_effort': 'max',
    },
  });
  assert.equal(
    resolveDisplayedEnumControlValue(advancedCatalog.controls[0], 'opus', target.modelSelection?.controls?.['claude.reasoning_effort']),
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

test('unsupported persistent controls surface a warning before runtime reconciliation sanitizes them', () => {
  const { advancedCatalog } = buildCurrentAdvancedCatalog('claude');

  const warning = resolveUnsupportedPersistentControlWarning({
    controls: advancedCatalog.controls,
    entryId: 'sonnet',
    modelSelection: {
      entryId: 'sonnet',
      entryMode: 'explicit',
      controls: {
        'claude.reasoning_effort': 'max',
      },
    },
  });

  assert.equal(
    warning,
    'Reasoning effort value Max is not supported by sonnet; Cats will use the model default instead.',
  );
});

test('provider model field view state exposes unsupported persistent control warnings', () => {
  const { catalog, advancedCatalog } = buildCurrentAdvancedCatalog('codex');
  const provider = {
    id: 'codex',
    label: 'Codex',
    defaultModel: 'gpt-5.4',
    defaultInstance: 'native',
    defaultBackend: 'cli',
    instances: [
      {
        id: 'native',
        label: 'cli/native',
        target: 'cli/native',
        backend: 'cli',
        default: true,
      },
    ],
    modelsPath: '/api/providers/codex/models',
  };

  const viewState = resolveProviderModelFieldsViewState({
    selectedProvider: provider,
    provider: 'codex',
    instance: 'native',
    model: 'gpt-5.1-codex-mini',
    modelSelection: {
      entryId: 'gpt-5.1-codex-mini',
      entryMode: 'explicit',
      controls: {
        'codex.reasoning_effort': 'xhigh',
      },
    },
    catalogLoading: false,
    providersLoaded: true,
    providerRegistry: {
      state: 'ready',
      providers: [provider],
    },
    effectiveCatalog: catalog,
    effectiveAdvancedCatalog: advancedCatalog,
    isLegacyModelTarget: false,
  });

  assert.equal(
    viewState.unsupportedSelectionWarning,
    'Reasoning effort value Extra high is not supported by gpt-5.1-codex-mini; Cats will use the model default instead.',
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

test('runtime-backed Codex Spark selectors surface High as the explicit default', () => {
  const { advancedCatalog } = reconcileReopenedTarget({
    provider: 'codex',
    model: 'gpt-5.3-codex-spark',
    modelSelection: {
      entryId: 'gpt-5.3-codex-spark',
      entryMode: 'explicit',
    },
  });

  assert.deepEqual(
    listPersistentControlOptions(advancedCatalog.controls, 'gpt-5.3-codex-spark')[0]?.values,
    [
      {
        value: 'low',
        label: 'Low',
        applicableEntryIds: [
          'gpt-5.4',
          'gpt-5.4-mini',
          'gpt-5.3-codex',
          'gpt-5.3-codex-spark',
          'gpt-5.2-codex',
          'gpt-5.2',
          'gpt-5.1-codex-max',
        ],
      },
      {
        value: 'medium',
        label: 'Medium',
        applicableEntryIds: ['gpt-5.3-codex-spark'],
      },
      {
        value: 'high',
        label: 'High (default)',
        applicableEntryIds: ['gpt-5.3-codex-spark'],
      },
      {
        value: 'xhigh',
        label: 'Extra high',
        applicableEntryIds: [
          'gpt-5.4',
          'gpt-5.4-mini',
          'gpt-5.3-codex',
          'gpt-5.3-codex-spark',
          'gpt-5.2-codex',
          'gpt-5.2',
          'gpt-5.1-codex-max',
        ],
      },
    ],
  );
  assert.equal(hasExplicitDefaultEnumOption(advancedCatalog.controls[0], 'gpt-5.3-codex-spark'), true);
  assert.equal(
    resolveDisplayedEnumControlValue(advancedCatalog.controls[0], 'gpt-5.3-codex-spark', undefined),
    'high',
  );
});

test('runtime-backed execution labels prefer advanced catalog entry and control labels over static fallback text', () => {
  assert.equal(
    resolveExecutionLabelForProviderTarget({
      provider: 'claude',
      instance: 'cli/native',
      model: 'opus',
      modelSelection: {
        entryId: 'opus',
        entryMode: 'explicit',
        controls: {
          'claude.reasoning_effort': 'xhigh',
        },
      },
      effectiveCatalog: {
        provider: 'claude',
        backend: 'cli',
        instance: 'native',
        defaultModel: 'opus',
        source: 'static',
        cache: null,
        models: [
          { id: 'opus', label: 'Opus 4.6 with 1M context', default: true },
        ],
        warnings: [],
      },
      effectiveAdvancedCatalog: {
        provider: 'claude',
        backend: 'cli',
        instance: 'native',
        defaultModel: 'opus',
        source: 'dynamic',
        cache: null,
        entries: [
          { id: 'opus', label: 'Opus 4.7 with 1M context', default: true },
        ],
        presets: [],
        controls: [
          {
            key: 'claude.reasoning_effort',
            label: 'Reasoning effort',
            kind: 'enum',
            scope: 'both',
            applicableEntryIds: ['opus'],
            values: [
              { value: 'xhigh', label: 'xHigh (default)', applicableEntryIds: ['opus'] },
            ],
          },
        ],
        defaultSelection: {
          entryId: 'opus',
          entryMode: 'explicit',
          controls: {
            'claude.reasoning_effort': 'xhigh',
          },
        },
        support: {
          tier: 'full',
          notes: [],
        },
        warnings: [],
      },
    }),
    'Claude-CLI · Opus 4.7 with 1M context · xHigh',
  );
});

test('auto-reconciled provider targets keep a runtime-backed execution label snapshot', () => {
  assert.deepEqual(
    attachExecutionLabelToProviderTarget({
      target: {
        provider: 'claude',
        instance: 'native',
        model: 'opus',
        modelSelection: {
          entryId: 'opus',
          entryMode: 'explicit',
          controls: {
            'claude.reasoning_effort': 'max',
          },
        },
      },
      effectiveCatalog: {
        provider: 'claude',
        backend: 'cli',
        instance: 'native',
        defaultModel: 'opus',
        source: 'static',
        cache: null,
        models: [
          { id: 'opus', label: 'Opus 4.6 with 1M context', default: true },
        ],
        warnings: [],
      },
      effectiveAdvancedCatalog: {
        provider: 'claude',
        backend: 'cli',
        instance: 'native',
        defaultModel: 'opus',
        source: 'dynamic',
        cache: null,
        entries: [
          { id: 'opus', label: 'Opus 4.7 with 1M context', default: true },
        ],
        presets: [],
        controls: [
          {
            key: 'claude.reasoning_effort',
            label: 'Reasoning effort',
            kind: 'enum',
            scope: 'both',
            applicableEntryIds: ['opus'],
            values: [
              { value: 'max', label: 'Max', applicableEntryIds: ['opus'] },
            ],
          },
        ],
        defaultSelection: {
          entryId: 'opus',
          entryMode: 'explicit',
          controls: {
            'claude.reasoning_effort': 'max',
          },
        },
        support: {
          tier: 'full',
          notes: [],
        },
        warnings: [],
      },
    }),
    {
      provider: 'claude',
      instance: 'native',
      model: 'opus',
      modelSelection: {
        entryId: 'opus',
        entryMode: 'explicit',
        controls: {
          'claude.reasoning_effort': 'max',
        },
      },
      executionLabel: 'Claude-CLI · Opus 4.7 with 1M context · Max',
    },
  );
});

test('execution labels do not infer default control values from decorated option labels alone', () => {
  assert.equal(
    resolveExecutionLabelForProviderTarget({
      provider: 'claude',
      instance: 'native',
      model: 'opus',
      modelSelection: null,
      effectiveCatalog: {
        provider: 'claude',
        backend: 'cli',
        instance: 'native',
        defaultModel: 'opus',
        source: 'static',
        cache: null,
        models: [
          { id: 'opus', label: 'Opus 4.7 with 1M context', default: true },
        ],
        warnings: [],
      },
      effectiveAdvancedCatalog: {
        provider: 'claude',
        backend: 'cli',
        instance: 'native',
        defaultModel: 'opus',
        source: 'dynamic',
        cache: null,
        entries: [
          { id: 'opus', label: 'Opus 4.7 with 1M context', default: true },
        ],
        presets: [],
        controls: [
          {
            key: 'claude.reasoning_effort',
            label: 'Reasoning effort',
            kind: 'enum',
            scope: 'both',
            applicableEntryIds: ['opus'],
            values: [
              { value: 'xhigh', label: 'xHigh (default)', applicableEntryIds: ['opus'] },
            ],
          },
        ],
        defaultSelection: null,
        support: {
          tier: 'full',
          notes: [],
        },
        warnings: [],
      },
    }),
    'Claude-CLI · Opus 4.7 with 1M context',
  );
});

test('provider model field view state derives instance, entry, and catalog warnings from the resolved target', () => {
  const selectedProvider = {
    id: 'codex',
    label: 'Codex',
    backend: 'cli',
    instances: [
      {
        id: 'native',
        label: 'cli/native',
        target: 'cli/native',
        backend: 'cli',
      },
      {
        id: 'secondary',
        label: 'cli/secondary',
        target: 'cli/secondary',
        backend: 'cli',
      },
    ],
  };

  const viewState = resolveProviderModelFieldsViewState({
    selectedProvider,
    provider: 'codex',
    instance: '',
    model: 'gpt-5.4',
    modelSelection: null,
    catalogLoading: false,
    providersLoaded: true,
    providerRegistry: {
      state: 'ready',
      providers: [selectedProvider],
      recovery: {
        retryable: true,
        openRuntimeSetupPath: '/runtime/setup',
      },
      warnings: [],
    },
    effectiveCatalog: {
      provider: 'codex',
      backend: 'cli',
      instance: 'native',
      defaultModel: 'gpt-5.4',
      source: 'dynamic',
      cache: null,
      models: [
        { id: 'gpt-5.4', label: 'GPT-5.4', default: true, notes: ['Stable default'] },
      ],
      warnings: ['Runtime model catalog unavailable.'],
    },
    effectiveAdvancedCatalog: {
      provider: 'codex',
      backend: 'cli',
      instance: 'native',
      defaultModel: 'gpt-5.4',
      source: 'dynamic',
      cache: null,
      entries: [
        { id: 'gpt-5.4', label: 'GPT-5.4', default: true, notes: ['Stable default'] },
      ],
      presets: [],
      controls: [],
      defaultSelection: null,
      support: {
        tier: 'entry_only',
        notes: [],
      },
      warnings: ['Advanced catalog unavailable.'],
    },
    isLegacyModelTarget: false,
  });

  assert.equal(viewState.resolvedInstance, 'native');
  assert.equal(viewState.showInstanceField, true);
  assert.equal(viewState.selectedEntryId, 'gpt-5.4');
  assert.equal(viewState.modelPlaceholder, 'Select a model');
  assert.equal(viewState.primaryCatalogWarning, 'Advanced catalog unavailable.');
  assert.equal(viewState.providerRegistrySetupHref, '/runtime/setup');
  assert.equal(viewState.canRetryProviderRegistry, false);
});

test('updating persistent control values adds, updates, and removes keyed control state', () => {
  const control = {
    key: 'codex.reasoning_effort',
    label: 'Reasoning effort',
    kind: 'enum',
    scope: 'both',
    values: [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' },
    ],
  } as const;

  assert.deepEqual(
    updatePersistentControlValues({
      control,
      currentValues: {},
      rawValue: 'high',
    }),
    {
      'codex.reasoning_effort': 'high',
    },
  );

  assert.deepEqual(
    updatePersistentControlValues({
      control,
      currentValues: {
        'codex.reasoning_effort': 'high',
        'codex.temperature': 0.2,
      },
      rawValue: '',
    }),
    {
      'codex.temperature': 0.2,
    },
  );
});
