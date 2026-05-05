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
});

test('execution target equality compares normalized nullable fields and model selection content', () => {
  assert.equal(
    sameExecutionTargetValue(
      {
        provider: 'claude',
        instance: undefined,
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
