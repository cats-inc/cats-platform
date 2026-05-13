import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState, upsertCoreWorkItem } from '../src/core/model/index.ts';
import { EXTERNAL_WORK_BINDING_METADATA_KEY } from '../src/products/work/shared/externalWorkBinding.ts';
import {
  WORK_EXTERNAL_LINK_ISSUE_TOOL,
} from '../src/products/work/shared/workToolSurface.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import {
  createChannel,
  requireChannel,
  resolveChannelCanonicalIdentity,
} from '../src/products/chat/state/model/index.ts';
import { MemoryChatStore } from '../src/products/chat/state/store.ts';
import {
  beginChannelMessageDispatch,
} from '../src/products/chat/state/runtime-dispatch/routing.ts';
import type { RuntimeClient } from '../src/platform/runtime/client.ts';
import {
  PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
  type ProviderAgentBoundedObservation,
} from '../src/platform/orchestration/index.ts';
import {
  parseProviderCapabilityBootstrapConfigDocument,
  type ProviderCapabilityBootstrapConfig,
} from '../src/platform/supervision/index.ts';

function runtimeStub(): RuntimeClient {
  return {
    async closeSession() {},
  } as RuntimeClient;
}

function fixtureBootstrapConfig(): ProviderCapabilityBootstrapConfig {
  const parsed = parseProviderCapabilityBootstrapConfigDocument(
    {
      version: 1,
      profiles: [
        {
          id: 'claude-native-sonnet-strong',
          selector: {
            provider: 'claude',
            instance: 'native',
            model: 'sonnet',
            control: 'default',
          },
          initialTreatment: 'strong_agent',
          confidenceLevel: 'catalog_only',
          reason: 'Operator-approved strong Chat candidate.',
        },
      ],
    },
    { observedAt: '2026-05-13T00:00:00.000Z' },
  );
  if (!parsed.config) {
    throw new Error('Expected fixture bootstrap config.');
  }
  return parsed.config;
}

function observationToolNames(observation: ProviderAgentBoundedObservation | null): string[] {
  return observation?.availableTools.map((tool) => tool.manifest.name) ?? [];
}

function readExternalBindings(metadata: unknown): Array<Record<string, unknown>> {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    return [];
  }
  const container = (metadata as Record<string, unknown>)[EXTERNAL_WORK_BINDING_METADATA_KEY];
  if (typeof container !== 'object' || container === null || Array.isArray(container)) {
    return [];
  }
  const bindings = (container as Record<string, unknown>).bindings;
  return Array.isArray(bindings)
    ? bindings.filter((binding): binding is Record<string, unknown> =>
        typeof binding === 'object' && binding !== null && !Array.isArray(binding))
    : [];
}

test('Chat provider-agent external binding tool request writes local Work metadata', async () => {
  const now = new Date('2026-05-13T11:00:00.000Z');
  let state = createChannel(
    createDefaultChatState(),
    {
      title: '',
      topic: 'External tracker binding',
      originSurface: 'chat',
      entryKind: 'direct',
      roomMode: 'direct_message',
      cats: [
        {
          name: 'Boss Cat',
          provider: 'claude',
          instance: 'native',
          model: 'sonnet',
        },
      ],
    },
    now,
  );
  const bossCatId = state.cats[0]?.id;
  if (!bossCatId) {
    throw new Error('Expected Boss Cat id.');
  }
  state = {
    ...state,
    bossCatId,
  };
  const channelId = state.selectedChannelId;
  const { conversationId } = resolveChannelCanonicalIdentity(state, channelId);
  const core = upsertCoreWorkItem(
    createDefaultCoreState(),
    {
      id: 'work-item-external-chat-1',
      title: 'Bind chat external issue',
      status: 'planned',
      projectId: null,
      conversationId,
      taskId: null,
      parentWorkItemId: null,
      ownerActorId: 'actor-owner',
      assignedActorIds: [],
      summary: null,
      metadata: {},
    },
    now,
  ).core;
  const store = new MemoryChatStore(state);
  await store.writeCore(core);
  let capturedObservation: ProviderAgentBoundedObservation | null = null;
  const externalUrl = 'https://github.com/cats-inc/cats-platform/issues/321';

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: `Boss Cat link work-item-external-chat-1 to ${externalUrl}`,
    },
    runtimeStub(),
    new Date('2026-05-13T11:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      providerAgentDecisionRequester: async ({ observation }) => {
        capturedObservation = observation;
        return {
          contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
          kind: 'tool_request',
          decisionId: 'decision-external-link-1',
          confidence: 'high',
          toolName: WORK_EXTERNAL_LINK_ISSUE_TOOL,
          target: {
            kind: 'execution_target',
            provider: 'claude',
            model: 'sonnet',
          },
          input: {},
          rationaleSummary: 'The owner explicitly asked to link a local Work Item to GitHub.',
        };
      },
    },
  );

  assert.equal(
    observationToolNames(capturedObservation).includes(WORK_EXTERNAL_LINK_ISSUE_TOOL),
    true,
  );
  const persistedCore = await store.readCore();
  const workItem = persistedCore.workItems.find((item) =>
    item.id === 'work-item-external-chat-1');
  const bindings = readExternalBindings(workItem?.metadata);
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0]?.provider, 'github');
  assert.equal(bindings[0]?.externalType, 'issue');
  assert.equal(bindings[0]?.externalId, '321');
  assert.equal(bindings[0]?.externalUrl, externalUrl);

  const channel = requireChannel(begun.state, channelId);
  const resultMessage = channel.messages.find((message) =>
    message.metadata.workExternalBindingResult);
  assert.equal(resultMessage?.metadata.event, 'work_external_binding_result');
  assert.equal(resultMessage?.body, 'Linked github issue 321 to Work Item work-item-external-chat-1.');
});
