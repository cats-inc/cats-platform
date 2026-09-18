import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isLegacyProviderModelTarget,
  resolveCatalogTargetSelection,
  resolveSelectedProviderInstance,
} from '../build/server/shared/providerSelection.js';
import {
  createStaticProviderModelCatalog,
  normalizeProviderAdvancedModelCatalog,
} from '../build/server/shared/providerCatalog.js';

test('resolveSelectedProviderInstance picks the runtime default instance when none is selected', () => {
  const provider = {
    id: 'codex',
    label: 'Codex',
    defaultModel: null,
    defaultInstance: 'agent/bridge',
    defaultBackend: 'agent',
    instances: [
      { id: 'agent/bridge', label: 'agent/bridge', target: 'agent/bridge', backend: 'agent', default: true },
      { id: 'ubuntu', label: 'cli/ubuntu', target: 'cli/ubuntu', backend: 'cli' },
    ],
    modelsPath: '/api/providers/codex/models',
  };

  assert.equal(resolveSelectedProviderInstance(provider, ''), 'agent/bridge');
  assert.equal(resolveSelectedProviderInstance(provider, 'ubuntu'), 'cli/ubuntu');
});

test('resolveSelectedProviderInstance offers no instance until the runtime registry is loaded', () => {
  const provider = {
    id: 'claude',
    label: 'Claude',
    defaultModel: null,
    defaultInstance: null,
    defaultBackend: null,
    instances: [],
    modelsPath: '/api/providers/claude/models',
  };

  assert.equal(resolveSelectedProviderInstance(provider, 'native'), '');
});

test('static Codex catalog keeps raw model labels without a synthetic default suffix', () => {
  const catalog = createStaticProviderModelCatalog('codex');
  assert.equal(catalog.models[0]?.id, 'gpt-6-astra');
  assert.equal(catalog.models[0]?.label, 'gpt-6-astra');
});

test('OpenCode shortlist preserves labels, starts at the first row, and retains custom model strings', () => {
  const catalog = createStaticProviderModelCatalog('opencode');
  assert.deepEqual(catalog.models.map(({ id, label }) => ({ id, label })), [
    { id: 'opencode-go/union-alpha', label: 'Union Alpha Free' },
    { id: 'opencode-go/deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash' },
    { id: 'opencode-go/hy4-preview', label: 'Hy4 preview' },
    { id: 'opencode-go/glm-5.3-flash', label: 'GLM-5.3-Flash' },
    { id: 'opencode-go/qwen3.8-flash', label: 'Qwen3.8 Flash' },
    { id: 'opencode-go/minimax-m3', label: 'MiniMax-M3' },
  ]);
  assert.ok(catalog.models.every(model => !model.default));
  const target = { provider: 'opencode', instance: 'native', model: '' };
  assert.equal(resolveCatalogTargetSelection({ target, catalog }).model, 'opencode-go/union-alpha');
  const custom = resolveCatalogTargetSelection({
    target: { ...target, model: 'another-provider/custom-model', modelSelection: null },
    catalog, preserveCurrentModel: true, preserveCurrentSelection: true,
  });
  assert.equal(custom.model, 'another-provider/custom-model');
  assert.equal(custom.modelSelection, null);
});

test('Kilo shortlist preserves labels, starts at the first row, and retains custom model strings', () => {
  const catalog = createStaticProviderModelCatalog('kilo');
  assert.deepEqual(catalog.models.map(({ id, label }) => ({ id, label })), [
    { id: 'kilo/deepseek/deepseek-v4.1-flash', label: 'DeepSeek: DeepSeek V4.1 Flash' },
    { id: 'kilo/z-ai/glm-5.3-flash', label: 'Z.ai: GLM 5.3 Flash' },
    { id: 'kilo/moonshotai/kimi-k3', label: 'MoonshotAI: Kimi K3' },
    { id: 'kilo/minimax/minimax-m3', label: 'MiniMax: MiniMax M3' },
    { id: 'kilo/bytedance-seed/seed-2-1-turbo', label: 'ByteDance Seed: Seed 2.1 Turbo Thinking' },
    { id: 'kilo/google/gemini-3-pro-image', label: 'Google: Nano Banana Pro (Gemini 3 Pro Image) Thinking' },
  ]);
  assert.ok(catalog.models.every(model => !model.default));
  const target = { provider: 'kilo', instance: 'native', model: '' };
  assert.equal(resolveCatalogTargetSelection({ target, catalog }).model, 'kilo/deepseek/deepseek-v4.1-flash');
  const custom = resolveCatalogTargetSelection({
    target: { ...target, model: 'another-provider/custom-model', modelSelection: null },
    catalog, preserveCurrentModel: true, preserveCurrentSelection: true,
  });
  assert.equal(custom.model, 'another-provider/custom-model');
  assert.equal(custom.modelSelection, null);
});

test('ClinePass starts at GLM and retains a custom string after catalog refresh', () => {
  const catalog = createStaticProviderModelCatalog('cline');
  const target = { provider: 'cline', instance: 'native', model: '' };
  assert.equal(resolveCatalogTargetSelection({ target, catalog }).model, 'cline-pass/glm-5.3');
  assert.ok(catalog.models.every(model => !model.default));
  const custom = resolveCatalogTargetSelection({
    target: { ...target, model: 'vendor/CaseSensitive.Model', modelSelection: null }, catalog,
    preserveCurrentModel: true, preserveCurrentSelection: true,
  });
  assert.equal(custom.model, 'vendor/CaseSensitive.Model');
  assert.equal(custom.modelSelection, null);
});

test('Kiro starts at the first raw id and retains custom input through refresh', () => {
  const catalog = createStaticProviderModelCatalog('kiro');
  const ids = ['claude-opus-5', 'claude-sonnet-5', 'gpt-5.6-sol', 'gpt-5.6-terra',
    'gpt-5.6-luna', 'claude-haiku-4.5'];
  assert.deepEqual(catalog.models.map(({ id, label }) => ({ id, label })),
    ids.map(id => ({ id, label: id })));
  assert.ok(catalog.models.every(model => !model.default));
  const target = { provider: 'kiro', instance: 'native', model: '' };
  assert.equal(resolveCatalogTargetSelection({ target, catalog }).model, ids[0]);
  const custom = resolveCatalogTargetSelection({
    target: { ...target, model: 'Vendor/CaseSensitive.Model', modelSelection: null }, catalog,
    preserveCurrentModel: true, preserveCurrentSelection: true,
  });
  assert.equal(custom.model, 'Vendor/CaseSensitive.Model');
  assert.equal(custom.modelSelection, null);
});

test('Devin starts at Adaptive and preserves a custom model outside the shortlist', () => {
  const catalog = createStaticProviderModelCatalog('devin');
  assert.equal(catalog.models.length, 6);
  assert.ok(catalog.models.every(model => !model.default));
  const target = { provider: 'devin', instance: 'agent/acp', model: '' };
  assert.equal(resolveCatalogTargetSelection({ target, catalog }).model, 'adaptive');
  const custom = resolveCatalogTargetSelection({
    target: { ...target, model: 'custom-devin-model', modelSelection: null }, catalog,
    preserveCurrentModel: true, preserveCurrentSelection: true,
  });
  assert.equal(custom.model, 'custom-devin-model');
  assert.equal(custom.modelSelection, null);
});

test('advanced catalog preserves scalar per-entry defaults and drops malformed values', () => {
  const catalog = normalizeProviderAdvancedModelCatalog({
    entries: [
      { id: 'gpt-5.6-sol', controlDefaults: {
        'codex.reasoning_effort': 'low', count: 0, enabled: false,
        missing: null, invalid: { value: 'medium' },
      } },
      { id: 'gpt-5.5', controlDefaults: [] },
    ],
  }, 'codex');
  assert.deepEqual(catalog.entries[0].controlDefaults, {
    'codex.reasoning_effort': 'low', count: 0, enabled: false,
  });
  assert.equal(catalog.entries[1].controlDefaults, undefined);
});

test('resolveCatalogTargetSelection prefers the runtime catalog default over a stale initial model', () => {
  const nextTarget = resolveCatalogTargetSelection({
    target: {
      provider: 'claude',
      instance: 'native',
      model: 'claude-opus-4-6',
    },
    catalog: {
      provider: 'claude',
      backend: 'cli',
      instance: 'native',
      defaultModel: 'claude-sonnet-4-6',
      source: 'config',
      cache: null,
      models: [
        { id: 'claude-opus-4-6', label: 'Opus 4.6' },
        { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', default: true },
      ],
      warnings: [],
    },
    preserveCurrentModel: false,
  });

  assert.equal(nextTarget.instance, 'native');
  assert.equal(nextTarget.model, 'claude-sonnet-4-6');
});

test('resolveCatalogTargetSelection keeps a manual model choice for the same provider target', () => {
  const nextTarget = resolveCatalogTargetSelection({
    target: {
      provider: 'claude',
      instance: 'native',
      model: 'claude-opus-4-6',
    },
    catalog: {
      provider: 'claude',
      backend: 'cli',
      instance: 'native',
      defaultModel: 'claude-sonnet-4-6',
      source: 'config',
      cache: null,
      models: [
        { id: 'claude-opus-4-6', label: 'Opus 4.6' },
        { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', default: true },
      ],
      warnings: [],
    },
    preserveCurrentModel: true,
  });

  assert.equal(nextTarget.model, 'opus');
});

test('resolveCatalogTargetSelection normalizes Claude legacy aliases onto native CLI catalog entries', () => {
  const nextTarget = resolveCatalogTargetSelection({
    target: {
      provider: 'claude',
      instance: 'native',
      model: 'claude-opus-4-6',
      modelSelection: {
        entryId: 'claude-opus-4-6',
        entryMode: 'explicit',
      },
    },
    catalog: {
      provider: 'claude',
      backend: 'cli',
      instance: 'native',
      defaultModel: 'opus',
      source: 'static',
      cache: null,
      models: [
        { id: 'opus', label: 'Opus 4.7 with 1M context', default: true },
        { id: 'sonnet', label: 'Sonnet 4.6' },
        { id: 'haiku', label: 'Haiku 4.5' },
      ],
      warnings: [],
    },
    advancedCatalog: normalizeProviderAdvancedModelCatalog({
      provider: 'claude',
      backend: 'cli',
      instance: 'native',
      defaultModel: 'opus',
      source: 'static',
      cache: null,
      entries: [
        { id: 'opus', label: 'Opus 4.7 with 1M context', default: true },
        { id: 'sonnet', label: 'Sonnet 4.6' },
        { id: 'haiku', label: 'Haiku 4.5' },
      ],
      presets: [],
      controls: [
        {
          key: 'claude.reasoning_effort',
          label: 'Reasoning effort',
          kind: 'enum',
          scope: 'both',
          values: [
            { value: 'low', label: 'Low', applicableEntryIds: ['opus', 'sonnet'] },
            { value: 'medium', label: 'Medium', applicableEntryIds: ['opus', 'sonnet'] },
            { value: 'high', label: 'High', applicableEntryIds: ['opus', 'sonnet'] },
            { value: 'max', label: 'Max', applicableEntryIds: ['opus'] },
          ],
        },
      ],
      defaultSelection: {
        entryId: 'opus',
        entryMode: 'explicit',
        controls: {
          'claude.reasoning_effort': 'medium',
        },
      },
      support: {
        tier: 'full',
      },
      warnings: [],
    }, 'claude'),
    preserveCurrentModel: true,
    preserveCurrentSelection: true,
  });

  assert.equal(nextTarget.model, 'opus');
  assert.deepEqual(nextTarget.modelSelection, {
    entryId: 'opus',
    entryMode: 'explicit',
  });
});

test('isLegacyProviderModelTarget detects a raw model id that is not part of the runtime catalog', () => {
  assert.equal(
    isLegacyProviderModelTarget({
      catalog: {
        provider: 'claude',
        backend: 'cli',
        instance: 'native',
        defaultModel: 'claude-opus-4-6',
        source: 'config',
        cache: null,
        models: [
          { id: 'claude-opus-4-6', label: 'Opus 4.6', default: true },
          { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
        ],
        warnings: [],
      },
      model: 'claude-legacy-unknown',
      modelSelection: null,
    }),
    true,
  );
});

test('isLegacyProviderModelTarget treats Claude native aliases as catalog models', () => {
  assert.equal(
    isLegacyProviderModelTarget({
      catalog: {
        provider: 'claude',
        backend: 'cli',
        instance: 'native',
        defaultModel: 'opus',
        source: 'static',
        cache: null,
        models: [
          { id: 'opus', label: 'Opus 4.7 with 1M context', default: true },
          { id: 'sonnet', label: 'Sonnet 4.6' },
          { id: 'haiku', label: 'Haiku 4.5' },
        ],
        warnings: [],
      },
      model: 'claude-opus-4-6',
      modelSelection: null,
    }),
    false,
  );
});

test('isLegacyProviderModelTarget treats Claude default as a legacy model id after the opus rename', () => {
  assert.equal(
    isLegacyProviderModelTarget({
      catalog: {
        provider: 'claude',
        backend: 'cli',
        instance: 'native',
        defaultModel: 'opus',
        source: 'static',
        cache: null,
        models: [
          { id: 'opus', label: 'Opus 4.7 with 1M context', default: true },
          { id: 'sonnet', label: 'Sonnet 4.6' },
          { id: 'haiku', label: 'Haiku 4.5' },
        ],
        warnings: [],
      },
      model: 'default',
      modelSelection: null,
    }),
    true,
  );
});

test('resolveCatalogTargetSelection preserves a custom legacy model id when the selector is in manual mode', () => {
  const nextTarget = resolveCatalogTargetSelection({
    target: {
      provider: 'claude',
      instance: 'native',
      model: 'claude-legacy-unknown',
      modelSelection: null,
    },
    catalog: {
      provider: 'claude',
      backend: 'cli',
      instance: 'native',
      defaultModel: 'claude-opus-4-6',
      source: 'config',
      cache: null,
      models: [
        { id: 'claude-opus-4-6', label: 'Opus 4.6', default: true },
        { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
      ],
      warnings: [],
    },
    preserveCurrentModel: true,
    preserveCurrentSelection: true,
  });

  assert.equal(nextTarget.model, 'claude-legacy-unknown');
  assert.equal(nextTarget.modelSelection, null);
  assert.equal(nextTarget.modelResolution, null);
});

test('resolveCatalogTargetSelection preserves a legacy model id even when selection defaults are not preserved', () => {
  const nextTarget = resolveCatalogTargetSelection({
    target: {
      provider: 'claude',
      instance: 'native',
      model: 'claude-legacy-unknown',
      modelSelection: null,
    },
    catalog: {
      provider: 'claude',
      backend: 'cli',
      instance: 'native',
      defaultModel: 'claude-opus-4-6',
      source: 'config',
      cache: null,
      models: [
        { id: 'claude-opus-4-6', label: 'Opus 4.6', default: true },
        { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
      ],
      warnings: [],
    },
    advancedCatalog: normalizeProviderAdvancedModelCatalog({
      provider: 'claude',
      backend: 'cli',
      instance: 'native',
      defaultModel: 'claude-opus-4-6',
      source: 'config',
      cache: null,
      entries: [
        { id: 'claude-opus-4-6', label: 'Opus 4.6', default: true },
        { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
      ],
      presets: [
        {
          id: 'deep_reasoning',
          label: 'Deep Reasoning',
          availability: 'supported',
          applicableEntryIds: ['claude-opus-4-6'],
        },
      ],
      controls: [],
      defaultSelection: {
        entryMode: 'auto',
        entryId: 'claude-opus-4-6',
        presetId: 'deep_reasoning',
      },
      support: {
        tier: 'full',
      },
      warnings: [],
    }, 'claude'),
    preserveCurrentModel: true,
    preserveCurrentSelection: false,
  });

  assert.equal(nextTarget.model, 'claude-legacy-unknown');
  assert.equal(nextTarget.modelSelection, null);
  assert.equal(nextTarget.modelResolution, null);
});

test('resolveCatalogTargetSelection adopts advanced default selection presets and controls', () => {
  const nextTarget = resolveCatalogTargetSelection({
    target: {
      provider: 'codex',
      instance: 'main',
      model: '',
      modelSelection: null,
    },
    catalog: {
      provider: 'codex',
      backend: 'api',
      instance: 'main',
      defaultModel: 'gpt-5.4',
      source: 'config',
      cache: null,
      models: [
        { id: 'gpt-5.4', label: 'GPT-5.4', default: true },
        { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
      ],
      warnings: [],
    },
    advancedCatalog: normalizeProviderAdvancedModelCatalog({
      provider: 'codex',
      backend: 'api',
      instance: 'main',
      defaultModel: 'gpt-5.4',
      source: 'config',
      cache: null,
      entries: [
        { id: 'gpt-5.4', label: 'GPT-5.4', default: true },
        { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
      ],
      presets: [
        {
          id: 'balanced',
          label: 'Balanced',
          availability: 'supported',
          applicableEntryIds: ['gpt-5.4'],
          preferredEntryId: 'gpt-5.4',
          controlDefaults: {
            'openai.reasoning_effort': 'medium',
          },
        },
      ],
      controls: [
        {
          key: 'openai.reasoning_effort',
          label: 'Reasoning effort',
          kind: 'enum',
          scope: 'session_default',
          values: ['low', 'medium', 'high'],
        },
      ],
      defaultSelection: {
        entryMode: 'auto',
        entryId: 'gpt-5.4',
        presetId: 'balanced',
        controls: {
          'openai.reasoning_effort': 'medium',
        },
      },
      support: {
        tier: 'entry_only',
      },
      warnings: ['Advanced catalog is runtime-owned.'],
    }, 'codex'),
    preserveCurrentModel: false,
  });

  assert.equal(nextTarget.model, 'gpt-5.4');
  assert.deepEqual(nextTarget.modelSelection, {
    entryMode: 'auto',
    entryId: 'gpt-5.4',
    presetId: 'balanced',
    controls: {
      'openai.reasoning_effort': 'medium',
    },
  });
  assert.deepEqual(nextTarget.modelResolution, {
    entryId: 'gpt-5.4',
    model: 'gpt-5.4',
    entryMode: 'auto',
    presetId: 'balanced',
    controls: {
      'openai.reasoning_effort': 'medium',
    },
    supportTier: 'entry_only',
    warnings: ['Advanced catalog is runtime-owned.'],
  });
});

test('resolveCatalogTargetSelection preserves caller-supplied controls, including request-scoped values', () => {
  const nextTarget = resolveCatalogTargetSelection({
    target: {
      provider: 'codex',
      instance: 'main',
      model: '',
      modelSelection: null,
    },
    catalog: {
      provider: 'codex',
      backend: 'api',
      instance: 'main',
      defaultModel: 'gpt-5.4',
      source: 'config',
      cache: null,
      models: [
        { id: 'gpt-5.4', label: 'GPT-5.4', default: true },
      ],
      warnings: [],
    },
    advancedCatalog: normalizeProviderAdvancedModelCatalog({
      provider: 'codex',
      backend: 'api',
      instance: 'main',
      defaultModel: 'gpt-5.4',
      source: 'config',
      cache: null,
      entries: [
        { id: 'gpt-5.4', label: 'GPT-5.4', default: true },
      ],
      presets: [
        {
          id: 'balanced',
          label: 'Balanced',
          availability: 'supported',
          applicableEntryIds: ['gpt-5.4'],
          controlDefaults: {
            'openai.reasoning_effort': 'medium',
            'openai.max_output_tokens': 2048,
          },
        },
      ],
      controls: [
        {
          key: 'openai.reasoning_effort',
          label: 'Reasoning effort',
          kind: 'enum',
          scope: 'session_default',
          values: ['low', 'medium', 'high'],
        },
        {
          key: 'openai.max_output_tokens',
          label: 'Max output tokens',
          kind: 'number',
          scope: 'request',
        },
      ],
      defaultSelection: {
        entryMode: 'auto',
        entryId: 'gpt-5.4',
        presetId: 'balanced',
        controls: {
          'openai.reasoning_effort': 'medium',
          'openai.max_output_tokens': 2048,
        },
      },
      support: {
        tier: 'full',
      },
      warnings: [],
    }, 'codex'),
    preserveCurrentModel: false,
  });

  assert.deepEqual(nextTarget.modelSelection, {
    entryMode: 'auto',
    entryId: 'gpt-5.4',
    presetId: 'balanced',
    controls: {
      'openai.reasoning_effort': 'medium',
      'openai.max_output_tokens': 2048,
    },
  });
});

test('resolveCatalogTargetSelection preserves an existing preset selection for the same target', () => {
  const nextTarget = resolveCatalogTargetSelection({
    target: {
      provider: 'codex',
      instance: 'main',
      model: 'gpt-5.4',
      modelSelection: {
        entryMode: 'auto',
        entryId: 'gpt-5.4',
        presetId: 'deep-think',
        controls: {
          'openai.reasoning_effort': 'high',
        },
      },
    },
    catalog: {
      provider: 'codex',
      backend: 'api',
      instance: 'main',
      defaultModel: 'gpt-5.4',
      source: 'config',
      cache: null,
      models: [
        { id: 'gpt-5.4', label: 'GPT-5.4', default: true },
      ],
      warnings: [],
    },
    advancedCatalog: normalizeProviderAdvancedModelCatalog({
      provider: 'codex',
      backend: 'api',
      instance: 'main',
      defaultModel: 'gpt-5.4',
      source: 'config',
      cache: null,
      entries: [
        { id: 'gpt-5.4', label: 'GPT-5.4', default: true },
      ],
      presets: [
        {
          id: 'balanced',
          label: 'Balanced',
          availability: 'supported',
          applicableEntryIds: ['gpt-5.4'],
          controlDefaults: {
            'openai.reasoning_effort': 'medium',
          },
        },
        {
          id: 'deep-think',
          label: 'Deep Think',
          availability: 'supported',
          applicableEntryIds: ['gpt-5.4'],
          controlDefaults: {
            'openai.reasoning_effort': 'high',
          },
        },
      ],
      controls: [
        {
          key: 'openai.reasoning_effort',
          label: 'Reasoning effort',
          kind: 'enum',
          scope: 'session_default',
          values: ['low', 'medium', 'high'],
        },
      ],
      defaultSelection: {
        entryMode: 'auto',
        entryId: 'gpt-5.4',
        presetId: 'balanced',
        controls: {
          'openai.reasoning_effort': 'medium',
        },
      },
      support: {
        tier: 'entry_only',
      },
      warnings: [],
    }, 'codex'),
    preserveCurrentModel: true,
    preserveCurrentSelection: true,
  });

  assert.equal(nextTarget.model, 'gpt-5.4');
  assert.deepEqual(nextTarget.modelSelection, {
    entryMode: 'auto',
    entryId: 'gpt-5.4',
    presetId: 'deep-think',
    controls: {
      'openai.reasoning_effort': 'high',
    },
  });
});

test('resolveCatalogTargetSelection drops a stale preset that no longer exists in the advanced catalog', () => {
  const nextTarget = resolveCatalogTargetSelection({
    target: {
      provider: 'codex',
      instance: 'main',
      model: 'gpt-5.4',
      modelSelection: {
        entryMode: 'auto',
        entryId: 'gpt-5.4',
        presetId: 'deep_reasoning',
        controls: {
          'openai.reasoning_effort': 'high',
        },
      },
    },
    catalog: {
      provider: 'codex',
      backend: 'api',
      instance: 'main',
      defaultModel: 'gpt-5.4',
      source: 'config',
      cache: null,
      models: [
        { id: 'gpt-5.4', label: 'GPT-5.4', default: true },
      ],
      warnings: [],
    },
    advancedCatalog: normalizeProviderAdvancedModelCatalog({
      provider: 'codex',
      backend: 'api',
      instance: 'main',
      defaultModel: 'gpt-5.4',
      source: 'config',
      cache: null,
      entries: [
        { id: 'gpt-5.4', label: 'GPT-5.4', default: true },
      ],
      presets: [
        {
          id: 'balanced',
          label: 'Balanced',
          availability: 'supported',
          applicableEntryIds: ['gpt-5.4'],
          controlDefaults: {
            'openai.reasoning_effort': 'medium',
          },
        },
      ],
      controls: [
        {
          key: 'openai.reasoning_effort',
          label: 'Reasoning effort',
          kind: 'enum',
          scope: 'session_default',
          values: ['low', 'medium', 'high'],
        },
      ],
      defaultSelection: {
        entryMode: 'auto',
        entryId: 'gpt-5.4',
        presetId: 'balanced',
      },
      support: {
        tier: 'entry_only',
      },
      warnings: [],
    }, 'codex'),
    preserveCurrentModel: true,
    preserveCurrentSelection: true,
  });

  assert.equal(nextTarget.model, 'gpt-5.4');
  assert.deepEqual(nextTarget.modelSelection, {
    entryMode: 'auto',
    entryId: 'gpt-5.4',
    controls: {
      'openai.reasoning_effort': 'high',
    },
  });
});

test('normalizeProviderAdvancedModelCatalog preserves runtime preset availability and enum values', () => {
  const catalog = normalizeProviderAdvancedModelCatalog({
    provider: 'codex',
    backend: 'api',
    instance: 'main',
    defaultModel: 'gpt-5.4',
    source: 'config',
    cache: null,
    entries: [
      {
        id: 'gpt-5.4',
        label: 'GPT-5.4',
        default: true,
        limits: {
          contextWindowTokens: 200000,
          maxOutputTokens: 32000,
        },
      },
    ],
    presets: [
      {
        id: 'balanced',
        label: 'Balanced',
        availability: 'supported',
      },
    ],
    controls: [
      {
        key: 'openai.reasoning_effort',
        label: 'Reasoning effort',
        kind: 'enum',
        scope: 'session_default',
        values: ['low', 'medium', 'high'],
      },
    ],
    defaultSelection: {
      entryMode: 'auto',
      presetId: 'balanced',
    },
    support: {
      tier: 'entry_only',
    },
    warnings: [],
  }, 'codex');

  assert.equal(catalog.presets[0]?.availability, 'supported');
  assert.deepEqual(catalog.controls[0]?.values, [
    { value: 'low', label: 'low' },
    { value: 'medium', label: 'medium' },
    { value: 'high', label: 'high' },
  ]);
  assert.equal(catalog.entries[0]?.limits?.contextWindowTokens, 200000);
});
