import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeProviderAdvancedModelCatalog, type ProductProviderRegistryReadModel } from '../src/shared/providerCatalog.ts';
import { reconcileRuntimeBackedExecutionTargetValue } from '../src/products/shared/renderer/hooks/useWorkspaceExecutionTargetState.ts';
import { resolveDispatchExecutionTargetValue } from '../src/products/chat/renderer/hooks/useComposerSubmit.ts';

function createProviderRegistry(): ProductProviderRegistryReadModel {
  return {
    state: 'ready',
    providers: [
      {
        id: 'claude',
        label: 'Claude',
        defaultModel: 'opus',
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
        modelsPath: '/api/providers/claude/models',
      },
    ],
  };
}

test('runtime-backed execution target reconciliation adopts the advanced default effort for bare Claude opus targets', async () => {
  const reconciled = await reconcileRuntimeBackedExecutionTargetValue({
    target: {
      provider: 'claude',
      instance: 'native',
      model: 'opus',
      modelSelection: null,
      executionLabel: null,
    },
    fetchProviderRegistryFn: async () => createProviderRegistry(),
    fetchProviderModelsFn: async () => ({
      provider: 'claude',
      backend: 'cli',
      instance: 'native',
      defaultModel: 'opus',
      source: 'dynamic',
      cache: null,
      models: [
        { id: 'opus', label: 'Opus 4.7 with 1M context', default: true },
        { id: 'sonnet', label: 'Sonnet 4.6' },
      ],
      warnings: [],
    }),
    fetchAdvancedProviderModelsFn: async () => normalizeProviderAdvancedModelCatalog({
      provider: 'claude',
      backend: 'cli',
      instance: 'native',
      defaultModel: 'opus',
      source: 'dynamic',
      cache: null,
      entries: [
        { id: 'opus', label: 'Opus 4.7 with 1M context', default: true },
        { id: 'sonnet', label: 'Sonnet 4.6' },
      ],
      presets: [],
      controls: [
        {
          key: 'claude.reasoning_effort',
          label: 'Reasoning effort',
          kind: 'enum',
          scope: 'both',
          applicableEntryIds: ['opus', 'sonnet'],
          values: [
            { value: 'medium', label: 'Medium', applicableEntryIds: ['sonnet'] },
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
    }, 'claude'),
  });

  assert.deepEqual(reconciled.modelSelection, {
    entryId: 'opus',
    entryMode: 'explicit',
    controls: {
      'claude.reasoning_effort': 'xhigh',
    },
  });
  assert.equal(
    reconciled.executionLabel,
    'Claude-CLI · Opus 4.7 with 1M context · xHigh',
  );
});

test('runtime-backed execution target reconciliation sanitizes stale Claude effort controls without inferring a replacement effort', async () => {
  const reconciled = await reconcileRuntimeBackedExecutionTargetValue({
    target: {
      provider: 'claude',
      instance: 'native',
      model: 'sonnet',
      modelSelection: {
        entryId: 'sonnet',
        entryMode: 'explicit',
        controls: {
          'claude.reasoning_effort': 'xhigh',
        },
      },
      executionLabel: null,
    },
    fetchProviderRegistryFn: async () => createProviderRegistry(),
    fetchProviderModelsFn: async () => ({
      provider: 'claude',
      backend: 'cli',
      instance: 'native',
      defaultModel: 'opus',
      source: 'dynamic',
      cache: null,
      models: [
        { id: 'opus', label: 'Opus 4.7 with 1M context', default: true },
        { id: 'sonnet', label: 'Sonnet 4.6' },
      ],
      warnings: [],
    }),
    fetchAdvancedProviderModelsFn: async () => normalizeProviderAdvancedModelCatalog({
      provider: 'claude',
      backend: 'cli',
      instance: 'native',
      defaultModel: 'opus',
      source: 'dynamic',
      cache: null,
      entries: [
        { id: 'opus', label: 'Opus 4.7 with 1M context', default: true },
        { id: 'sonnet', label: 'Sonnet 4.6' },
      ],
      presets: [],
      controls: [
        {
          key: 'claude.reasoning_effort',
          label: 'Reasoning effort',
          kind: 'enum',
          scope: 'both',
          applicableEntryIds: ['opus', 'sonnet'],
          values: [
            { value: 'medium', label: 'Medium (default)', applicableEntryIds: ['sonnet'] },
            { value: 'xhigh', label: 'xHigh', applicableEntryIds: ['opus'] },
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
    }, 'claude'),
  });

  assert.deepEqual(reconciled.modelSelection, {
    entryId: 'sonnet',
    entryMode: 'explicit',
  });
  assert.equal(
    reconciled.executionLabel,
    'Claude-CLI · Sonnet 4.6',
  );
});

test('runtime-backed execution target reconciliation normalizes legacy Claude opus ids to the current opus entry', async () => {
  const reconciled = await reconcileRuntimeBackedExecutionTargetValue({
    target: {
      provider: 'claude',
      instance: 'native',
      model: 'claude-opus-4-6',
      modelSelection: null,
      executionLabel: null,
    },
    fetchProviderRegistryFn: async () => createProviderRegistry(),
    fetchProviderModelsFn: async () => ({
      provider: 'claude',
      backend: 'cli',
      instance: 'native',
      defaultModel: 'opus',
      source: 'dynamic',
      cache: null,
      models: [
        { id: 'opus', label: 'Opus 4.7 with 1M context', default: true },
        { id: 'sonnet', label: 'Sonnet 4.6' },
      ],
      warnings: [],
    }),
    fetchAdvancedProviderModelsFn: async () => normalizeProviderAdvancedModelCatalog({
      provider: 'claude',
      backend: 'cli',
      instance: 'native',
      defaultModel: 'opus',
      source: 'dynamic',
      cache: null,
      entries: [
        { id: 'opus', label: 'Opus 4.7 with 1M context', default: true },
        { id: 'sonnet', label: 'Sonnet 4.6' },
      ],
      presets: [],
      controls: [],
      defaultSelection: {
        entryId: 'opus',
        entryMode: 'explicit',
      },
      support: {
        tier: 'full',
        notes: [],
      },
      warnings: [],
    }, 'claude'),
  });

  assert.equal(reconciled.model, 'opus');
  assert.deepEqual(reconciled.modelSelection, {
    entryId: 'opus',
    entryMode: 'explicit',
  });
  assert.equal(
    reconciled.executionLabel,
    'Claude-CLI · Opus 4.7 with 1M context',
  );
});

test('dispatch execution target resolution keeps advanced default effort explicit before send', async () => {
  const resolved = await resolveDispatchExecutionTargetValue(
    {
      provider: 'claude',
      instance: 'native',
      model: 'opus',
      modelSelection: null,
      executionLabel: null,
    },
    async ({ target }) => ({
      ...target,
      modelSelection: {
        entryId: 'opus',
        entryMode: 'explicit',
        controls: {
          'claude.reasoning_effort': 'xhigh',
        },
      },
      executionLabel: 'Claude-CLI · Opus 4.7 with 1M context · xHigh',
    }),
  );

  assert.deepEqual(resolved.modelSelection, {
    entryId: 'opus',
    entryMode: 'explicit',
    controls: {
      'claude.reasoning_effort': 'xhigh',
    },
  });
});

test('dispatch execution target resolution falls back to the original target when reconciliation fails', async () => {
  const resolved = await resolveDispatchExecutionTargetValue(
    {
      provider: 'claude',
      instance: 'native',
      model: 'opus',
      modelSelection: null,
      executionLabel: null,
    },
    async () => {
      throw new Error('catalog unavailable');
    },
  );

  assert.deepEqual(resolved, {
    provider: 'claude',
    instance: 'native',
    model: 'opus',
    modelSelection: null,
    executionLabel: null,
  });
});
