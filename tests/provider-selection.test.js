import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveCatalogTargetSelection,
  resolveSelectedProviderInstance,
} from '../dist-server/shared/providerSelection.js';
import { normalizeProviderAdvancedModelCatalog } from '../dist-server/shared/providerCatalog.js';

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
  assert.equal(resolveSelectedProviderInstance(provider, 'ubuntu'), 'ubuntu');
});

test('resolveSelectedProviderInstance preserves an existing instance until the runtime registry is loaded', () => {
  const provider = {
    id: 'claude',
    label: 'Claude',
    defaultModel: null,
    defaultInstance: null,
    defaultBackend: null,
    instances: [],
    modelsPath: '/api/providers/claude/models',
  };

  assert.equal(resolveSelectedProviderInstance(provider, 'native'), 'native');
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

  assert.equal(nextTarget.model, 'claude-opus-4-6');
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
