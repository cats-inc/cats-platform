import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreProject,
  upsertCoreWorkItem,
} from '../src/core/model/index.ts';
import {
  WORK_ITEM_ASSIGN_PROJECT_TOOL,
  WORK_ITEM_UPDATE_TOOL,
  WORK_PROJECT_CREATE_TOOL,
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

test('Chat provider-agent Work project create request writes one Project', async () => {
  const now = new Date('2026-05-13T12:10:00.000Z');
  const state = createChannel(
    createDefaultChatState(),
    {
      title: '',
      topic: 'Work project create',
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
  const channelId = state.selectedChannelId;
  const { conversationId } = resolveChannelCanonicalIdentity(state, channelId);
  const store = new MemoryChatStore(state);
  await store.writeCore(createDefaultCoreState());

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: 'Boss Cat create project Cats Mobile',
    },
    runtimeStub(),
    new Date('2026-05-13T12:11:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      providerAgentDecisionRequester: async ({ observation }) => {
        assert.equal(
          observation.availableTools.some((tool) =>
            tool.manifest.name === WORK_PROJECT_CREATE_TOOL),
          true,
        );
        return {
          contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
          kind: 'tool_request',
          decisionId: 'decision-work-project-create-1',
          confidence: 'high',
          toolName: WORK_PROJECT_CREATE_TOOL,
          target: {
            kind: 'execution_target',
            provider: 'claude',
            model: 'sonnet',
          },
          input: {
            title: 'Cats Mobile',
            summary: 'Mobile companion for Cats.',
            status: 'planned',
          },
          rationaleSummary: 'The owner explicitly asked to create a Project.',
        };
      },
    },
  );

  const persistedCore = await store.readCore();
  const project = persistedCore.projects.find((candidate) =>
    candidate.title === 'Cats Mobile');
  assert.ok(project);
  assert.equal(project.status, 'planned');
  assert.equal(project.summary, 'Mobile companion for Cats.');
  assert.equal(project.primaryConversationId, conversationId);
  assert.equal(
    persistedCore.activities.some((activity) =>
      activity.message === 'Created Project: Cats Mobile'),
    true,
  );

  const channel = requireChannel(begun.state, channelId);
  const resultMessage = channel.messages.find((message) =>
    message.metadata.workProjectCreateResult);
  const metadata = resultMessage?.metadata.workProjectCreateResult as
    | { projectId?: string; title?: string; created?: boolean }
    | undefined;
  assert.equal(resultMessage?.metadata.event, 'work_project_create_result');
  assert.equal(metadata?.title, 'Cats Mobile');
  assert.equal(metadata?.created, true);
  assert.equal(metadata?.projectId, project.id);
  assert.match(resultMessage?.body ?? '', /^Created Project Cats Mobile \(project-/u);
});

test('Chat provider-agent Work Item update request writes bounded planning fields', async () => {
  const now = new Date('2026-05-13T12:20:00.000Z');
  const state = createChannel(
    createDefaultChatState(),
    {
      title: '',
      topic: 'Work item update',
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
  const channelId = state.selectedChannelId;
  const { conversationId } = resolveChannelCanonicalIdentity(state, channelId);
  const core = upsertCoreWorkItem(
    createDefaultCoreState(),
    {
      id: 'work-item-chat-update-1',
      title: 'Draft project setup',
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
      body: 'Boss Cat update work-item-chat-update-1 and mark it ready',
    },
    runtimeStub(),
    new Date('2026-05-13T12:21:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      providerAgentDecisionRequester: async ({ observation }) => {
        assert.equal(
          observation.availableTools.some((tool) =>
            tool.manifest.name === WORK_ITEM_UPDATE_TOOL),
          true,
        );
        return {
          contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
          kind: 'tool_request',
          decisionId: 'decision-work-item-update-1',
          confidence: 'high',
          toolName: WORK_ITEM_UPDATE_TOOL,
          target: {
            kind: 'execution_target',
            provider: 'claude',
            model: 'sonnet',
          },
          input: {
            title: 'Ready project setup',
            status: 'ready',
            priority: 'high',
            openQuestions: ['Confirm owner approval path.'],
          },
          rationaleSummary: 'The owner explicitly asked to update one Work Item.',
        };
      },
    },
  );

  const persistedCore = await store.readCore();
  const workItem = persistedCore.workItems.find((candidate) =>
    candidate.id === 'work-item-chat-update-1');
  assert.equal(workItem?.title, 'Ready project setup');
  assert.equal(workItem?.status, 'ready');
  assert.equal(
    persistedCore.activities.some((activity) =>
      activity.message === 'Updated Work Item: Ready project setup'),
    true,
  );

  const channel = requireChannel(begun.state, channelId);
  const resultMessage = channel.messages.find((message) =>
    message.metadata.workItemUpdateResult);
  const metadata = resultMessage?.metadata.workItemUpdateResult as
    | { workItemId?: string; status?: string; updated?: boolean }
    | undefined;
  assert.equal(resultMessage?.metadata.event, 'work_item_update_result');
  assert.equal(metadata?.workItemId, 'work-item-chat-update-1');
  assert.equal(metadata?.status, 'ready');
  assert.equal(metadata?.updated, true);
  assert.equal(resultMessage?.body, 'Updated Work Item work-item-chat-update-1 (ready).');
});

test('Chat provider-agent Work Item assign Project request writes server-resolved ids', async () => {
  const now = new Date('2026-05-13T12:30:00.000Z');
  const state = createChannel(
    createDefaultChatState(),
    {
      title: '',
      topic: 'Work item assign project',
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
      id: 'work-item-chat-assign-1',
      title: 'Route item into project',
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
      body: 'Boss Cat assign work-item-chat-assign-1 to project-cats-platform',
    },
    runtimeStub(),
    new Date('2026-05-13T12:31:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      providerAgentDecisionRequester: async ({ observation }) => {
        assert.equal(
          observation.availableTools.some((tool) =>
            tool.manifest.name === WORK_ITEM_ASSIGN_PROJECT_TOOL),
          true,
        );
        return {
          contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
          kind: 'tool_request',
          decisionId: 'decision-work-item-assign-project-1',
          confidence: 'high',
          toolName: WORK_ITEM_ASSIGN_PROJECT_TOOL,
          target: {
            kind: 'execution_target',
            provider: 'claude',
            model: 'sonnet',
          },
          input: {
            workItemId: 'work-item-model-supplied-id-is-ignored',
            projectId: 'project-model-supplied-id-is-ignored',
            note: 'Owner asked to attach this Work Item to the Cats Platform Project.',
          },
          rationaleSummary: 'The owner explicitly asked to assign one Work Item to one Project.',
        };
      },
    },
  );

  const persistedCore = await store.readCore();
  const workItem = persistedCore.workItems.find((candidate) =>
    candidate.id === 'work-item-chat-assign-1');
  assert.equal(workItem?.projectId, 'project-cats-platform');
  assert.equal(
    persistedCore.activities.some((activity) =>
      activity.message === 'Assigned Work Item to Project: Route item into project'),
    true,
  );

  const channel = requireChannel(begun.state, channelId);
  const resultMessage = channel.messages.find((message) =>
    message.metadata.workItemAssignProjectResult);
  const metadata = resultMessage?.metadata.workItemAssignProjectResult as
    | { workItemId?: string; projectId?: string; assigned?: boolean }
    | undefined;
  assert.equal(resultMessage?.metadata.event, 'work_item_assign_project_result');
  assert.equal(metadata?.workItemId, 'work-item-chat-assign-1');
  assert.equal(metadata?.projectId, 'project-cats-platform');
  assert.equal(metadata?.assigned, true);
  assert.equal(
    resultMessage?.body,
    'Assigned Work Item work-item-chat-assign-1 to Project project-cats-platform.',
  );
});
