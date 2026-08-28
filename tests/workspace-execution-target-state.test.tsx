import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeProviderAdvancedModelCatalog, type ProductProviderRegistryReadModel } from '../src/shared/providerCatalog.ts';
import {
  createDefaultExecutionTargetValue,
  createExecutionTargetValueForProvider,
  reconcileRuntimeBackedExecutionTargetValue,
  sameExecutionTargetValue,
  toExecutionTargetValue,
  toDefaultChatExecutionTargetValue,
} from '../src/products/shared/renderer/hooks/useWorkspaceExecutionTargetState.ts';
import { formatWorkspaceExecutionTargetMutationError } from '../src/products/shared/renderer/hooks/workspaceExecutionTargetErrorLabels.ts';
import { resolveDispatchExecutionTargetValue } from '../src/products/chat/renderer/hooks/useComposerSubmit.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

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

test('execution target save feedback localizes known workspace mutation fallbacks', () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    formatWorkspaceExecutionTargetMutationError(
      new Error('cats new chat defaults update returned 500'),
      t('sharedExecutionTargetSaveNewChatDefaultsError'),
      t,
    ),
    '儲存新增聊天室模型預設值失敗。',
  );
  assert.equal(
    formatWorkspaceExecutionTargetMutationError(
      new Error('cats channel update returned 404'),
      t('sharedExecutionTargetSaveChatReplySettingsError'),
      t,
    ),
    '儲存這個聊天室的 AI 回覆設定失敗。',
  );
  assert.equal(
    formatWorkspaceExecutionTargetMutationError(
      new Error('Channel not found: channel-1'),
      t('sharedExecutionTargetSaveChatReplySettingsError'),
      t,
    ),
    '找不到這個聊天室。',
  );
  assert.equal(
    formatWorkspaceExecutionTargetMutationError(
      new Error('provider runtime unavailable'),
      t('sharedExecutionTargetSaveChatReplySettingsError'),
      t,
    ),
    'provider runtime unavailable',
  );
});

test('execution target helper defaults stay Claude-backed and normalize trimmed persisted providers', () => {
  assert.deepEqual(createDefaultExecutionTargetValue(), {
    provider: 'claude',
    instance: 'native',
    model: 'opus',
    modelSelection: null,
    executionLabel: null,
  });
  assert.deepEqual(createExecutionTargetValueForProvider('claude'), {
    provider: 'claude',
    instance: 'native',
    model: 'opus',
    modelSelection: null,
    executionLabel: null,
  });
  assert.deepEqual(toExecutionTargetValue(null), createDefaultExecutionTargetValue());
  assert.deepEqual(toExecutionTargetValue({
    provider: ' codex ',
    model: null,
    instance: null,
    modelSelection: {
      entryId: 'gpt-5.4',
      entryMode: 'explicit',
    },
  }), {
    provider: 'codex',
    model: 'gpt-5.4',
    instance: 'native',
    modelSelection: {
      entryId: 'gpt-5.4',
      entryMode: 'explicit',
    },
    executionLabel: null,
  });
  assert.deepEqual(toExecutionTargetValue({
    provider: 'cline',
    model: null,
    instance: 'native',
    modelSelection: null,
  }), {
    provider: 'cline',
    model: null,
    instance: 'native',
    modelSelection: null,
    executionLabel: null,
  });
});

test('execution target equality compares normalized nullable fields and model selection content', () => {
  assert.equal(
    sameExecutionTargetValue(
      {
        provider: 'claude',
        instance: null,
        model: 'opus',
        modelSelection: {
          entryId: 'opus',
          entryMode: 'explicit',
          controls: {
            'claude.reasoning_effort': 'xhigh',
          },
        },
        executionLabel: 'ignored-left',
      },
      {
        provider: 'claude',
        instance: null,
        model: 'opus',
        modelSelection: {
          entryId: 'opus',
          entryMode: 'explicit',
          controls: {
            'claude.reasoning_effort': 'xhigh',
          },
        },
        executionLabel: 'ignored-right',
      },
    ),
    true,
  );
  assert.equal(
    sameExecutionTargetValue(
      {
        provider: 'claude',
        instance: 'native',
        model: 'opus',
        modelSelection: null,
        executionLabel: null,
      },
      {
        provider: 'claude',
        instance: 'native',
        model: 'opus',
        modelSelection: {
          entryId: 'opus',
          entryMode: 'explicit',
        },
        executionLabel: null,
      },
    ),
    false,
  );
});

test('default channel execution target falls back to the global orchestrator when pending values are absent', () => {
  assert.equal(
    toDefaultChatExecutionTargetValue(null, null),
    null,
  );
  assert.equal(
    toDefaultChatExecutionTargetValue(
      {
        newChatDefaults: null,
        globalOrchestrator: {
          executionTarget: {
            provider: 'claude',
            model: 'opus',
            instance: 'native',
          },
          executionModelSelection: null,
        },
      },
      {
        id: 'channel-participant',
        assignedCats: [{ catId: 'cat-1', status: 'active' }],
        pendingProvider: 'codex',
        pendingModel: null,
        pendingInstance: null,
        pendingModelSelection: null,
      },
    ),
    null,
  );

  assert.deepEqual(
    toDefaultChatExecutionTargetValue(
      {
        newChatDefaults: null,
        globalOrchestrator: {
          executionTarget: {
            provider: 'claude',
            model: 'opus',
            instance: 'native',
          },
          executionModelSelection: {
            entryId: 'opus',
            entryMode: 'explicit',
          },
        },
      },
      {
        id: 'channel-default',
        pendingProvider: null,
        pendingModel: null,
        pendingInstance: null,
        pendingModelSelection: null,
      },
    ),
    {
      provider: 'claude',
      model: 'opus',
      instance: 'native',
      modelSelection: {
        entryId: 'opus',
        entryMode: 'explicit',
      },
      executionLabel: null,
    },
  );

  assert.deepEqual(
    toDefaultChatExecutionTargetValue(
      {
        newChatDefaults: null,
        globalOrchestrator: {
          executionTarget: {
            provider: 'claude',
            model: 'opus',
            instance: 'native',
          },
          executionModelSelection: null,
        },
      },
      {
        id: 'channel-default',
        pendingProvider: 'codex',
        pendingModel: 'gpt-5.4',
        pendingInstance: 'default',
        pendingModelSelection: {
          entryId: 'gpt-5.4',
          entryMode: 'explicit',
        },
      },
    ),
    {
      provider: 'codex',
      model: 'gpt-5.4',
      instance: 'default',
      modelSelection: {
        entryId: 'gpt-5.4',
        entryMode: 'explicit',
      },
      executionLabel: null,
    },
  );
});

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

test('runtime-backed execution target reconciliation replaces the Antigravity placeholder with a catalog id', async () => {
  const registry: ProductProviderRegistryReadModel = {
    state: 'ready',
    providers: [{
      id: 'antigravity',
      label: 'Antigravity',
      defaultModel: 'antigravity-default',
      defaultInstance: 'native',
      defaultBackend: 'cli',
      instances: [{
        id: 'native',
        label: 'cli/native',
        target: 'cli/native',
        backend: 'cli',
        default: true,
      }],
      modelsPath: '/api/providers/antigravity/models',
    }],
  };
  const models = [
    { id: 'gemini-3.7-flash-high', label: 'Gemini 3.7 Flash (High)' },
    { id: 'gemini-3.7-flash-medium', label: 'Gemini 3.7 Flash (Medium)' },
  ];

  const reconciled = await reconcileRuntimeBackedExecutionTargetValue({
    target: {
      provider: 'antigravity',
      instance: 'native',
      model: 'antigravity-default',
      modelSelection: null,
      executionLabel: null,
    },
    fetchProviderRegistryFn: async () => registry,
    fetchProviderModelsFn: async () => ({
      provider: 'antigravity',
      backend: 'cli',
      instance: 'native',
      defaultModel: null,
      source: 'static',
      cache: null,
      models,
      warnings: [],
    }),
    fetchAdvancedProviderModelsFn: async () => normalizeProviderAdvancedModelCatalog({
      provider: 'antigravity',
      backend: 'cli',
      instance: 'native',
      defaultModel: null,
      source: 'static',
      cache: null,
      entries: models,
      presets: [],
      controls: [],
      defaultSelection: null,
      support: {
        tier: 'entry_only',
        notes: [],
      },
      warnings: [],
    }, 'antigravity'),
  });

  assert.equal(reconciled.model, 'gemini-3.7-flash-high');
  assert.deepEqual(reconciled.modelSelection, {
    entryId: 'gemini-3.7-flash-high',
    entryMode: 'explicit',
  });
  assert.equal(
    reconciled.executionLabel,
    'Antigravity-CLI · Gemini 3.7 Flash (High)',
  );
});

for (const providerDefaultTarget of [
  { provider: 'cline', instance: 'native', model: 'cline-default', backend: 'cli' },
  { provider: 'devin', instance: 'acp', model: 'devin-default', backend: 'agent' },
] as const) {
  test(`runtime-backed execution target reconciliation omits ${providerDefaultTarget.provider} placeholder`, async () => {
    const registry: ProductProviderRegistryReadModel = {
      state: 'ready',
      providers: [{
        id: providerDefaultTarget.provider,
        label: providerDefaultTarget.provider,
        defaultModel: providerDefaultTarget.model,
        defaultInstance: providerDefaultTarget.instance,
        defaultBackend: providerDefaultTarget.backend,
        instances: [{
          id: providerDefaultTarget.instance,
          label: `${providerDefaultTarget.backend}/${providerDefaultTarget.instance}`,
          target: `${providerDefaultTarget.backend}/${providerDefaultTarget.instance}`,
          backend: providerDefaultTarget.backend,
          default: true,
        }],
        modelsPath: `/api/providers/${providerDefaultTarget.provider}/models`,
      }],
    };

    const reconciled = await reconcileRuntimeBackedExecutionTargetValue({
      target: {
        provider: providerDefaultTarget.provider,
        instance: providerDefaultTarget.instance,
        model: providerDefaultTarget.model,
        modelSelection: null,
        executionLabel: null,
      },
      fetchProviderRegistryFn: async () => registry,
      fetchProviderModelsFn: async () => ({
        provider: providerDefaultTarget.provider,
        backend: providerDefaultTarget.backend,
        instance: providerDefaultTarget.instance,
        defaultModel: null,
        source: 'static',
        cache: null,
        models: [],
        warnings: [],
      }),
      fetchAdvancedProviderModelsFn: async () => normalizeProviderAdvancedModelCatalog({
        provider: providerDefaultTarget.provider,
        backend: providerDefaultTarget.backend,
        instance: providerDefaultTarget.instance,
        defaultModel: null,
        source: 'static',
        cache: null,
        entries: [],
        presets: [],
        controls: [],
        defaultSelection: null,
        support: {
          tier: 'entry_only',
          notes: [],
        },
        warnings: [],
      }, providerDefaultTarget.provider),
    });

    assert.equal(reconciled.model, null);
    assert.equal(reconciled.modelSelection, null);
    assert.equal(reconciled.executionLabel, null);
  });
}

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
