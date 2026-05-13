import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreProject,
  upsertCoreWorkItem,
} from '../src/core/model/index.ts';
import {
  WORK_PROJECT_LOOKUP_TOOL,
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

test('Chat provider-agent Work triage lookup request returns bounded Project candidates', async () => {
  const now = new Date('2026-05-13T12:00:00.000Z');
  let state = createChannel(
    createDefaultChatState(),
    {
      title: '',
      topic: 'Work triage lookup',
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
  const withProject = upsertCoreProject(
    createDefaultCoreState(),
    {
      id: 'project-cats-platform',
      title: 'Cats Platform',
      status: 'active',
      ownerActorId: 'actor-owner',
      primaryConversationId: conversationId,
      summary: 'Main Cats product work.',
    },
    now,
  ).core;
  const core = upsertCoreWorkItem(
    withProject,
    {
      id: 'work-item-triage-lookup-1',
      title: 'Find project candidates',
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

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: 'Boss Cat triage work-item-triage-lookup-1 and find its Cats project',
    },
    runtimeStub(),
    new Date('2026-05-13T12:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      providerAgentDecisionRequester: async ({ observation }) => {
        assert.equal(
          observation.availableTools.some((tool) =>
            tool.manifest.name === WORK_PROJECT_LOOKUP_TOOL),
          true,
        );
        return {
          contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
          kind: 'tool_request',
          decisionId: 'decision-work-triage-lookup-1',
          confidence: 'high',
          toolName: WORK_PROJECT_LOOKUP_TOOL,
          target: {
            kind: 'execution_target',
            provider: 'claude',
            model: 'sonnet',
          },
          input: {
            query: 'cats',
            limit: 3,
          },
          rationaleSummary: 'The owner asked for project candidates for a Work Item.',
        };
      },
    },
  );

  const persistedCore = await store.readCore();
  assert.equal(persistedCore.projects.length, 1);
  assert.equal(persistedCore.workItems[0]?.projectId, null);

  const channel = requireChannel(begun.state, channelId);
  const resultMessage = channel.messages.find((message) =>
    message.metadata.workTriageLookupResult);
  const metadata = resultMessage?.metadata.workTriageLookupResult as
    | { projects?: Array<{ projectId?: string; title?: string }> }
    | undefined;
  assert.equal(resultMessage?.metadata.event, 'work_triage_lookup_result');
  assert.equal(resultMessage?.body, 'Project candidates: Cats Platform (project-cats-platform).');
  assert.equal(metadata?.projects?.[0]?.projectId, 'project-cats-platform');
});
