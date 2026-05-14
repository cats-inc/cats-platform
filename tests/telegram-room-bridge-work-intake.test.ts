import assert from 'node:assert/strict';
import test from 'node:test';

import { PROVIDER_AGENT_DECISION_CONTRACT_VERSION } from '../src/platform/orchestration/index.js';
import type { RuntimeClient } from '../src/platform/runtime/client.js';
import {
  buildTelegramWorkExecutionPreparationChoiceResponse,
  buildTelegramWorkIntakeProposalChoiceResponse,
} from '../src/platform/transports/telegram/bridge.js';
import { upsertCoreWorkItem } from '../src/core/model/index.js';
import { createChatTelegramRoomBridge } from '../src/products/chat/state/telegramBridgeAdapter.js';
import { createDefaultChatState } from '../src/products/chat/state/defaults.js';
import { MemoryCompanionBoxStore } from '../src/products/chat/state/companion-box/index.js';
import { MemoryChatStore } from '../src/products/chat/state/store.js';
import {
  buildChannelView,
  createChannel,
  setBossCat,
  setChannelCatLease,
} from '../src/products/chat/state/model/index.js';
import {
  WORK_EXTERNAL_IMPORT_ISSUE_TOOL,
  WORK_ITEM_PREPARE_EXECUTION_TOOL,
  WORK_ITEM_PROPOSE_SPLIT_TOOL,
} from '../src/products/work/shared/workToolSurface.js';
import { WORK_MCP_PROFILE_ID } from '../src/products/work/shared/workToolIntent.js';
import { buildTelegramBotTransportBindingId } from '../src/shared/chatCoreIds.js';

const strongClaudeNativeBootstrapConfig = {
  version: 1 as const,
  profiles: [
    {
      id: 'claude-native-sonnet-strong',
      selector: {
        provider: 'claude',
        instance: 'native',
        model: 'sonnet',
        control: 'default',
      },
      initialTreatment: 'strong_agent' as const,
      confidenceLevel: 'catalog_only' as const,
      reason: 'Telegram bridge fixture treats Claude native Sonnet as a strong Cat.',
    },
  ],
};

function createRuntimeStub(): RuntimeClient {
  let nextSession = 1;
  return {
    async createSession(input) {
      const sessionId = `session-telegram-work-${nextSession++}`;
      return {
        id: sessionId,
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? null,
      };
    },
    async sendMessage() {
      return {
        segments: [
          { kind: 'text', text: 'Work intake proposal prepared.', toolName: null, toolId: null },
        ],
        inputTokens: 1,
        outputTokens: 1,
        tokensUsed: 2,
      };
    },
  } as unknown as RuntimeClient;
}

test('Telegram room bridge passes provider tool decisions into Work intake sidecars', async () => {
  let state = createDefaultChatState();
  state = createChannel(
    state,
    {
      title: 'Telegram Work Intake',
      topic: 'Route Telegram todos into Cats Work.',
      originSurface: 'chat',
      roomMode: 'direct_message',
      cats: [
        {
          name: 'Work',
          provider: 'claude',
          instance: 'native',
          model: 'sonnet',
          roles: ['planner'],
          skillProfile: 'companion',
          mcpProfile: WORK_MCP_PROFILE_ID,
        },
      ],
    },
    new Date('2026-05-13T00:00:00.000Z'),
  );
  const roomId = state.selectedChannelId;
  assert.ok(roomId);

  const chatStore = new MemoryChatStore(state);
  const companionStore = new MemoryCompanionBoxStore();
  let decisionRequests = 0;
  let observedToolNames: string[] = [];
  const bridge = createChatTelegramRoomBridge({
    chatStore,
    companionStore,
    naturalProductIntentMode: 'cat_tool',
    providerCapabilityBootstrapConfig: strongClaudeNativeBootstrapConfig,
    providerAgentDecisionRequester: async ({ observation }) => {
      decisionRequests += 1;
      observedToolNames = observation.availableTools.map((tool) => tool.manifest.name);
      return {
        contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
        kind: 'tool_request',
        decisionId: 'decision-telegram-work-intake-1',
        confidence: 'high',
        toolName: WORK_ITEM_PROPOSE_SPLIT_TOOL,
        target: {
          kind: 'worker_tool',
          toolName: WORK_ITEM_PROPOSE_SPLIT_TOOL,
        },
        input: {
          maxItems: 2,
          defaultKind: 'todo',
          defaultPriority: 'medium',
        },
        rationaleSummary: 'Propose structured Work Items from the Telegram owner message.',
      };
    },
  });

  const routed = await bridge.routeRoomMessage({
    state,
    roomId,
    body: 'Draft the MCP adapter contract; Add Telegram Work intake coverage',
    senderName: 'Kenneth',
    bindingId: 'bot-binding-1',
    runtimeClient: createRuntimeStub(),
    timestamp: new Date('2026-05-13T00:01:00.000Z'),
  });

  assert.equal(observedToolNames.includes(WORK_ITEM_PROPOSE_SPLIT_TOOL), true);
  assert.equal(routed.results.length, 0);

  const channel = buildChannelView(routed.state, roomId);
  const proposalMessage = channel.messages.find((message) =>
    message.metadata.event === 'work_intake_proposal_created');
  const proposal = proposalMessage?.metadata.workIntakeProposal;

  assert.equal(proposalMessage?.senderName, 'Cats Work');
  assert.equal(
    proposalMessage?.choices?.[0]?.options.some((option) =>
      option.id === 'capture_work_items' && option.style === 'primary'),
    true,
  );
  assert.deepEqual(
    proposal?.candidates?.map((candidate) => candidate.title),
    [
      'Draft the MCP adapter contract',
      'Add Telegram Work intake coverage',
    ],
  );
  assert.equal(proposal?.source?.surface, 'telegram');
  assert.equal(
    proposal?.source?.transportBindingId,
    buildTelegramBotTransportBindingId('bot-binding-1'),
  );

  const core = await chatStore.readCore();
  assert.equal(
    core.workItems.filter((candidate) => Boolean(candidate.metadata.workIntake)).length,
    0,
  );

  if (!proposalMessage) {
    throw new Error('Expected Telegram Work intake proposal message.');
  }
  const choicePayload = buildTelegramWorkIntakeProposalChoiceResponse({
    message: proposalMessage,
    action: 'decline',
    submittedAt: '2026-05-13T00:02:00.000Z',
  });
  assert.ok(choicePayload);

  const declined = await bridge.routeRoomMessage({
    state: routed.state,
    roomId,
    body: choicePayload.body,
    choiceResponse: choicePayload.choiceResponse,
    senderName: 'Kenneth',
    bindingId: 'bot-binding-1',
    runtimeClient: createRuntimeStub(),
    timestamp: new Date('2026-05-13T00:02:00.000Z'),
  });

  const declinedChannel = buildChannelView(declined.state, roomId);
  const declinedMessage = declinedChannel.messages.find((message) =>
    message.metadata.event === 'work_intake_proposal_declined');
  const transition = declinedMessage?.metadata.workIntakeProposalTransition;
  const declinedCore = await chatStore.readCore();

  assert.equal(declinedMessage?.body, 'Work intake proposal ignored.');
  assert.equal(transition?.event, 'declined');
  assert.deepEqual(transition?.capturedWorkItemIds, []);
  assert.equal(
    declinedCore.workItems.filter((candidate) => Boolean(candidate.metadata.workIntake)).length,
    0,
  );
  assert.equal(decisionRequests, 1);
});

test('Telegram room bridge applies provider external issue import decisions', async () => {
  let state = createDefaultChatState();
  state = createChannel(
    state,
    {
      title: 'Telegram Work Import',
      topic: 'Import external tracker issues from Telegram.',
      originSurface: 'chat',
      roomMode: 'direct_message',
      cats: [
        {
          name: 'Work',
          provider: 'claude',
          instance: 'native',
          model: 'sonnet',
          roles: ['planner'],
          skillProfile: 'companion',
          mcpProfile: WORK_MCP_PROFILE_ID,
        },
      ],
    },
    new Date('2026-05-13T00:05:00.000Z'),
  );
  const roomId = state.selectedChannelId;
  assert.ok(roomId);
  const catId = buildChannelView(state, roomId).assignedCats[0]?.catId;
  assert.ok(catId);
  state = setChannelCatLease(
    state,
    roomId,
    catId,
    {
      status: 'ready',
      sessionId: 'session-telegram-work-import',
      laneId: 'lane-telegram-work-import',
    },
    new Date('2026-05-13T00:05:01.000Z'),
  );

  const externalUrl = 'https://github.com/cats-inc/platform/issues/42';
  const chatStore = new MemoryChatStore(state);
  const companionStore = new MemoryCompanionBoxStore();
  let observedToolNames: string[] = [];
  let fetchedUrl: string | null = null;
  const bridge = createChatTelegramRoomBridge({
    chatStore,
    companionStore,
    naturalProductIntentMode: 'cat_tool',
    providerCapabilityBootstrapConfig: strongClaudeNativeBootstrapConfig,
    externalIssueImport: {
      github: {
        fetchImpl: async (url) => {
          fetchedUrl = url;
          assert.match(url, /\/repos\/cats-inc\/platform\/issues\/42$/u);
          return {
            ok: true,
            status: 200,
            async json() {
              return {
                number: 42,
                title: 'Import Telegram GitHub issue',
                body: 'Issue body captured from Telegram.',
                state: 'open',
                html_url: externalUrl,
                labels: [],
                assignees: [],
                updated_at: '2026-05-13T00:05:00.000Z',
                closed_at: null,
              };
            },
          };
        },
      },
    },
    providerAgentDecisionRequester: async ({ observation }) => {
      assert.equal(JSON.stringify(observation).includes(externalUrl), false);
      observedToolNames = observation.availableTools.map((tool) => tool.manifest.name);
      return {
        contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
        kind: 'tool_request',
        decisionId: 'decision-telegram-work-import-1',
        confidence: 'high',
        toolName: WORK_EXTERNAL_IMPORT_ISSUE_TOOL,
        target: {
          kind: 'worker_tool',
          toolName: WORK_EXTERNAL_IMPORT_ISSUE_TOOL,
        },
        input: {
          externalUrl,
          provider: 'github',
        },
        rationaleSummary: 'Import the GitHub issue mentioned by the Telegram owner.',
      };
    },
  });

  const routed = await bridge.routeRoomMessage({
    state,
    roomId,
    body: `Boss Cat import ${externalUrl} into Cats Work`,
    senderName: 'Kenneth',
    bindingId: 'bot-binding-1',
    runtimeClient: createRuntimeStub(),
    timestamp: new Date('2026-05-13T00:06:00.000Z'),
  });

  assert.deepEqual(
    observedToolNames.filter((toolName) => toolName.startsWith('work.external.')),
    [WORK_EXTERNAL_IMPORT_ISSUE_TOOL],
  );
  assert.ok(fetchedUrl);

  const core = await chatStore.readCore();
  const workItem = core.workItems.find((candidate) =>
    candidate.title === 'Import Telegram GitHub issue');
  assert.ok(workItem);
  assert.equal(workItem.summary, 'Issue body captured from Telegram.');
  const bindings = Array.isArray(workItem.metadata.externalWorkBindings?.bindings)
    ? workItem.metadata.externalWorkBindings.bindings
    : [];
  assert.equal(bindings[0]?.provider, 'github');
  assert.equal(bindings[0]?.externalType, 'issue');
  assert.equal(bindings[0]?.externalId, '42');
  assert.equal(bindings[0]?.externalUrl, externalUrl);

  const channel = buildChannelView(routed.state, roomId);
  const resultMessage = channel.messages.find((message) =>
    message.metadata.event === 'work_external_issue_import_result');
  const metadata = resultMessage?.metadata.workExternalIssueImportResult;
  assert.equal(resultMessage?.senderName, 'Cats Work');
  assert.equal(metadata?.event, 'imported');
  assert.equal(metadata?.workItemId, workItem.id);
  assert.equal(metadata?.provider, 'github');
  assert.equal(metadata?.externalId, '42');
});

test('Telegram room bridge confirms Boss Work execution preparation into pending Tasks', async () => {
  let state = createDefaultChatState();
  state = createChannel(
    state,
    {
      title: 'Telegram Boss Work',
      topic: 'Start ready Work Items from Telegram.',
      originSurface: 'chat',
      roomMode: 'direct_message',
      cats: [
        {
          name: 'Boss Cat',
          provider: 'claude',
          instance: 'native',
          model: 'sonnet',
          roles: ['planner'],
          skillProfile: 'companion',
          mcpProfile: WORK_MCP_PROFILE_ID,
        },
      ],
    },
    new Date('2026-05-13T00:10:00.000Z'),
  );
  const roomId = state.selectedChannelId;
  assert.ok(roomId);
  const catId = buildChannelView(state, roomId).assignedCats[0]?.catId;
  assert.ok(catId);
  state = setBossCat(state, catId);
  state = setChannelCatLease(
    state,
    roomId,
    catId,
    {
      status: 'ready',
      sessionId: 'session-telegram-work-execution',
      laneId: 'lane-telegram-work-execution',
    },
    new Date('2026-05-13T00:10:01.000Z'),
  );

  const chatStore = new MemoryChatStore(state);
  const companionStore = new MemoryCompanionBoxStore();
  let core = await chatStore.readCore();
  core = upsertCoreWorkItem(
    core,
    {
      id: 'work-item-telegram-start-1',
      title: 'Implement Telegram Boss execution callback',
      status: 'ready',
      projectId: null,
      conversationId: `conversation-channel-${roomId}`,
      taskId: null,
      parentWorkItemId: null,
      ownerActorId: 'actor-owner',
      assignedActorIds: [],
      summary: 'Turn a Telegram execution proposal confirmation into a Task.',
      metadata: {
        workIntake: {
          schemaVersion: 1,
          phase: 'intake',
          runId: 'chat:previous-owner-visible-turn',
        },
      },
    },
    new Date('2026-05-13T00:10:02.000Z'),
  ).core;
  await chatStore.writeCore(core);

  let decisionRequests = 0;
  let observedToolNames: string[] = [];
  const bridge = createChatTelegramRoomBridge({
    chatStore,
    companionStore,
    naturalProductIntentMode: 'cat_tool',
    providerCapabilityBootstrapConfig: strongClaudeNativeBootstrapConfig,
    providerAgentDecisionRequester: async ({ observation }) => {
      decisionRequests += 1;
      observedToolNames = observation.availableTools.map((tool) => tool.manifest.name);
      return {
        contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
        kind: 'tool_request',
        decisionId: 'decision-telegram-work-execution-1',
        confidence: 'high',
        toolName: WORK_ITEM_PREPARE_EXECUTION_TOOL,
        target: {
          kind: 'worker_tool',
          toolName: WORK_ITEM_PREPARE_EXECUTION_TOOL,
        },
        input: {
          executionGoal: 'Open the Telegram callback execution slice.',
        },
        rationaleSummary: 'Prepare selected Work Items for Boss Cat execution.',
      };
    },
  });

  const routed = await bridge.routeRoomMessage({
    state,
    roomId,
    body: 'Boss Cat start work-item-telegram-start-1.',
    senderName: 'Kenneth',
    bindingId: 'bot-binding-1',
    runtimeClient: createRuntimeStub(),
    timestamp: new Date('2026-05-13T00:11:00.000Z'),
  });

  assert.equal(observedToolNames.includes(WORK_ITEM_PREPARE_EXECUTION_TOOL), true);
  const channel = buildChannelView(routed.state, roomId);
  const proposalMessage = channel.messages.find((message) =>
    message.metadata.event === 'work_execution_preparation_proposed');
  const proposal = proposalMessage?.metadata.workExecutionPreparationProposal;
  assert.equal(proposalMessage?.senderName, 'Cats Work');
  assert.deepEqual(proposal?.workItemIds, ['work-item-telegram-start-1']);

  if (!proposalMessage) {
    throw new Error('Expected Telegram Work execution proposal message.');
  }
  const choicePayload = buildTelegramWorkExecutionPreparationChoiceResponse({
    message: proposalMessage,
    action: 'create_tasks',
    submittedAt: '2026-05-13T00:12:00.000Z',
  });
  assert.ok(choicePayload);

  const confirmed = await bridge.routeRoomMessage({
    state: routed.state,
    roomId,
    body: choicePayload.body,
    choiceResponse: choicePayload.choiceResponse,
    senderName: 'Kenneth',
    bindingId: 'bot-binding-1',
    runtimeClient: createRuntimeStub(),
    timestamp: new Date('2026-05-13T00:12:00.000Z'),
  });

  const confirmedChannel = buildChannelView(confirmed.state, roomId);
  const transitionMessage = confirmedChannel.messages.find((message) =>
    message.metadata.event === 'work_execution_preparation_tasks_created');
  const transition = transitionMessage?.metadata.workExecutionPreparationTransition;
  const confirmedCore = await chatStore.readCore();
  const workItem = confirmedCore.workItems.find((candidate) =>
    candidate.id === 'work-item-telegram-start-1');
  const task = confirmedCore.tasks.find((candidate) => candidate.id === workItem?.taskId);

  assert.equal(transitionMessage?.body.includes('Created execution Tasks:'), true);
  assert.deepEqual(
    transition?.createdTasks?.map((created) => [
      created.workItemId,
      created.created,
      created.linked,
    ]),
    [
      ['work-item-telegram-start-1', true, true],
    ],
  );
  assert.equal(task?.title, 'Implement Telegram Boss execution callback');
  assert.equal(task?.status, 'pending_approval');
  assert.equal(task?.approval.status, 'pending');
  assert.equal(decisionRequests, 1);
});
