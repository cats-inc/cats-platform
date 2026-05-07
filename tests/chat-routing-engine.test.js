import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  appendMessage,
  assignCatToChannel,
  buildChannelView,
  createChannel as createModelChannel,
  createCat,
  createParallelChatGroup as createModelParallelChatGroup,
  removeCatFromChannel,
  requireChannel,
  resetDefaultChatContinuity,
  setChannelCatExecutionTarget,
  setChannelCatLease,
  setChannelOrchestratorLease,
} from '../build/server/products/chat/state/model/index.js';
import {
  beginChannelMessageDispatch,
  continueBegunChannelMessageDispatch,
  routeChannelMessage,
} from '../build/server/products/chat/state/runtimeActions.js';
import { ensureTargetSession } from '../build/server/products/chat/state/runtime-session/wake.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { patchTaskPlanningMetadata } from '../build/server/shared/taskPlanning.js';
import {
  buildChatConversationId,
  buildChatLaneId,
  buildChatWorkItemId,
  buildDirectLaneTransportBindingId,
  CHAT_ROOT_CONTAINER_ID,
} from '../build/server/shared/chatCoreIds.js';

function createChannel(state, input, now) {
  return createModelChannel(
    state,
    {
      originSurface: 'chat',
      ...input,
    },
    now,
  );
}

function createParallelChatGroup(state, input, now) {
  return createModelParallelChatGroup(
    state,
    {
      originSurface: 'chat',
      ...input,
    },
    now,
  );
}

function createRuntimeStub(responder) {
  let nextSession = 1;
  return {
    createdSessions: [],
    closedSessions: [],
    sentMessages: [],
    async getHealth() {
      return {
        baseUrl: 'http://127.0.0.1:3110',
        reachable: true,
        status: 'ok',
        service: 'cats-runtime',
      };
    },
    async getProviderConfig() {
      return {};
    },
    async getProviderModels(provider) {
      return {
        provider,
        backend: 'cli',
        instance: 'default',
        defaultModel: `${provider}-default`,
        source: 'config',
        cache: null,
        models: [
          { id: `${provider}-default`, label: `${provider} default`, default: true },
        ],
        warnings: [],
      };
    },
    async createSession(input) {
      const sessionId = `session-${nextSession++}`;
      const session = {
        id: sessionId,
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? path.join(tmpdir(), '.cats', 'runtime', 'sessions', sessionId),
      };
      this.createdSessions.push({ ...input, id: session.id });
      return session;
    },
    async sendMessage(sessionId, content, input) {
      this.sentMessages.push({ sessionId, content, input });
      return responder({ sessionId, content, input, sentMessages: this.sentMessages });
    },
    async closeSession(sessionId) {
      this.closedSessions.push(sessionId);
    },
    async observeSession(sessionId) {
      return {
        session: {
          id: sessionId,
          inspection: {
            state: 'idle',
          },
        },
        observePath: `/sessions/${sessionId}/observe`,
        stream: {
          path: `/sessions/${sessionId}/stream`,
          available: false,
        },
      };
    },
    async streamSession() {},
  };
}

function usage(content) {
  return {
    segments: [{ kind: 'text', text: content, toolName: null, toolId: null }],
    inputTokens: 11,
    outputTokens: 7,
    tokensUsed: 18,
  };
}

function assertProviderAgentDispatchMetadata(channel, body) {
  const userMessage = channel.messages.find((message) =>
    message.senderKind === 'user' && message.body === body);
  assert.ok(userMessage, `Expected user message for body: ${body}`);
  assert.equal(userMessage.metadata?.orchestratorBoundary, 'chat_message_dispatch');
  assert.match(userMessage.metadata?.orchestratorPlanId ?? '', /^chat-provider-agent:/u);
  assert.equal(userMessage.metadata?.orchestratorPlanner, 'provider_agent_observation');
  assert.equal(userMessage.metadata?.orchestratorLoopMode, 'agent_driven');
  assert.equal(userMessage.metadata?.orchestratorDispatchBoundary, 'supervised_runtime_boundary');
  assert.equal(userMessage.metadata?.orchestratorRuntimeToolBoundary, 'runtime_mcp_facade');
}

function createDeferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

class TrackingChatStore extends MemoryChatStore {
  writeCount = 0;

  async write(state) {
    this.writeCount += 1;
    return super.write(state);
  }
}

class CountingCoreChatStore extends MemoryChatStore {
  readCoreCount = 0;

  async readCore() {
    this.readCoreCount += 1;
    return super.readCore();
  }
}

async function createChannelState() {
  const store = new MemoryChatStore();
  let state = await store.read();
  const now = new Date('2026-03-21T00:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Smelly',
      provider: 'claude',
      roles: ['boss'],
    },
    now,
  );
  const bossCatId = state.cats[0].id;
  state = { ...state, bossCatId };

  state = createCat(
    state,
    {
      name: 'Agent-1',
      provider: 'claude',
      roles: ['reviewer'],
    },
    now,
  );
  const agent1Id = state.cats[0].id;

  state = createCat(
    state,
    {
      name: 'Agent-2',
      provider: 'gemini',
      roles: ['implementer'],
    },
    now,
  );
  const agent2Id = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Routing Engine',
      topic: 'Exercise continuation routing.',
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  state = assignCatToChannel(
    state,
    channelId,
    {
      catId: agent1Id,
      provider: 'claude',
      roles: ['reviewer'],
    },
    now,
  );
  state = assignCatToChannel(
    state,
    channelId,
    {
      catId: agent2Id,
      provider: 'gemini',
      roles: ['implementer'],
    },
    now,
  );

  return { state, channelId, agent1Id, agent2Id };
}

test('explicit multi-target mentions fan out in parallel and persist replies in completion order', async () => {
  const { state, channelId } = await createChannelState();
  const agent1Reply = createDeferred();
  const agent2Reply = createDeferred();
  const bothRequested = createDeferred();
  let agent1Requested = false;
  let agent2Requested = false;
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      agent1Requested = true;
      if (agent2Requested) {
        bothRequested.resolve();
      }
      return agent1Reply.promise;
    }
    if (content.includes('You are Agent-2')) {
      agent2Requested = true;
      if (agent1Requested) {
        bothRequested.resolve();
      }
      return agent2Reply.promise;
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatchedPromise = routeChannelMessage(
    state,
    channelId,
    { body: '@Agent-1 @Agent-2 review this change.' },
    runtimeClient,
    new Date('2026-03-21T00:00:00.000Z'),
  );
  await bothRequested.promise;
  agent2Reply.resolve(usage('Agent-2 finished the review.'));
  await Promise.resolve();
  agent1Reply.resolve(usage('Agent-1 finished the review.'));
  const dispatched = await dispatchedPromise;
  const channel = buildChannelView(dispatched.state, channelId);
  const replies = channel.messages.filter((message) => message.senderKind === 'agent');

  assert.deepEqual(
    replies.map((message) => message.senderName),
    ['Agent-2', 'Agent-1'],
  );
  assert.equal(channel.roomRouting?.lastOutcome?.dispatches.length, 2);
  assert.equal(channel.roomRouting?.lastOutcome?.resolution.routingMode, 'explicit_multi');
  assert.equal(channel.roomRouting?.lastOutcome?.resolution.selectionKind, 'explicit_mentions');
  assert.deepEqual(
    channel.roomRouting?.lastOutcome?.dispatches.map((dispatch) => dispatch.target.participantName),
    ['Agent-1', 'Agent-2'],
  );
  assert.equal(dispatched.results[0].targetName, 'Agent-2');
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.status, 'completed');
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.workflowShape, 'concurrent');
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.stageId, 'turn_completed');
  assert.deepEqual(
    channel.roomRouting?.workflow.turnHistory[0]?.targetStatuses.map((target) => target.status),
    ['completed', 'completed'],
  );
  assert.deepEqual(
    channel.roomRouting?.workflow.turnHistory[0]?.targetStatuses.map((target) => target.branchStrategy),
    ['fresh_no_parent', 'fresh_no_parent'],
  );
  assert.ok(
    channel.roomRouting?.workflow.eventHistory.some((event) => event.kind === 'fan_out'),
  );
  assert.ok(
    channel.roomRouting?.workflow.eventHistory.some((event) => event.kind === 'outcome'),
  );
});

test('current-turn draft audience metadata routes multi-target turns sequentially in audience order', async () => {
  const { state, channelId, agent1Id, agent2Id } = await createChannelState();
  const firstReply = createDeferred();
  const secondRequested = createDeferred();
  let secondHasStarted = false;
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-2')) {
      return firstReply.promise;
    }
    if (content.includes('You are Agent-1')) {
      secondHasStarted = true;
      secondRequested.resolve();
      return usage('Agent-1 handled the second step.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatchedPromise = routeChannelMessage(
    state,
    channelId,
    {
      body: 'Kick off the shared room.',
      messageMetadata: {
        recipientParticipantIds: [agent2Id, agent1Id],
        workflowShape: 'sequential',
      },
    },
    runtimeClient,
    new Date('2026-03-21T00:00:00.000Z'),
  );

  await Promise.resolve();
  assert.equal(secondHasStarted, false);
  firstReply.resolve(usage('Agent-2 handled the first step.'));
  await secondRequested.promise;

  const dispatched = await dispatchedPromise;
  const channel = buildChannelView(dispatched.state, channelId);
  const replies = channel.messages.filter((message) => message.senderKind === 'agent');

  assert.deepEqual(
    runtimeClient.sentMessages.map((message) =>
      message.content.includes('You are Agent-2') ? 'Agent-2' : 'Agent-1'),
    ['Agent-2', 'Agent-1'],
  );
  assert.deepEqual(
    replies.map((message) => message.senderName),
    ['Agent-2', 'Agent-1'],
  );
  assert.match(
    runtimeClient.sentMessages[1]?.content ?? '',
    /\[agent:Agent-2\] Agent-2 handled the first step\./u,
  );
  assert.match(
    runtimeClient.sentMessages[1]?.content ?? '',
    /Latest routed handoff:\nAgent-2 handled the first step\./u,
  );
  assert.equal(runtimeClient.createdSessions.length, 2);
  assert.equal(
    runtimeClient.createdSessions[1]?.context?.metadata?.sourceMessageId,
    replies[0]?.id,
  );
  assert.equal(
    runtimeClient.createdSessions[1]?.context?.metadata?.trigger,
    'continuation_mention',
  );
  assert.equal(
    runtimeClient.createdSessions[1]?.context?.metadata?.branchStrategy,
    'transplant_context',
  );
  assert.equal(
    runtimeClient.createdSessions[1]?.context?.metadata?.handoffReason,
    'workflow_continuation',
  );
  assert.equal(
    runtimeClient.sentMessages[1]?.input?.context?.metadata?.sourceMessageId,
    replies[0]?.id,
  );
  assert.equal(
    runtimeClient.sentMessages[1]?.input?.context?.metadata?.trigger,
    'continuation_mention',
  );
  assert.equal(
    runtimeClient.sentMessages[1]?.input?.context?.metadata?.branchStrategy,
    'transplant_context',
  );
  assert.equal(
    runtimeClient.sentMessages[1]?.input?.context?.metadata?.handoffReason,
    'workflow_continuation',
  );
  assert.equal(
    channel.roomRouting?.workflow.turnHistory[0]?.targetStatuses.find(
      (target) => target.participant.participantName === 'Agent-1',
    )?.sourceMessageId,
    replies[0]?.id,
  );
  assert.equal(
    channel.roomRouting?.workflow.turnHistory[0]?.targetStatuses.find(
      (target) => target.participant.participantName === 'Agent-1',
    )?.branchStrategy,
    'transplant_context',
  );
  assert.equal(
    channel.roomRouting?.workflow.turnHistory[0]?.targetStatuses.find(
      (target) => target.participant.participantName === 'Agent-1',
    )?.trigger,
    'continuation_mention',
  );
  assert.equal(
    channel.roomRouting?.workflow.turnHistory[0]?.targetStatuses.find(
      (target) => target.participant.participantName === 'Agent-1',
    )?.handoffReason,
    'workflow_continuation',
  );
  assert.deepEqual(
    channel.roomRouting?.workflow.turnHistory[0]?.targetStatuses.find(
      (target) => target.participant.participantName === 'Agent-1',
    )?.source,
    {
      participantKind: 'cat',
      participantId: agent2Id,
      participantName: 'Agent-2',
    },
  );
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.workflowShape, 'sequential');
  assert.equal(
    channel.roomRouting?.workflow.eventHistory.some((event) => event.kind === 'fan_out'),
    false,
  );
});

test('initial sequential audience keeps handing off the canonical frontier through later targets', async () => {
  let { state, channelId, agent1Id, agent2Id } = await createChannelState();
  const now = new Date('2026-03-21T00:00:00.000Z');
  state = createCat(
    state,
    {
      name: 'Agent-3',
      provider: 'codex',
      roles: ['synthesizer'],
    },
    now,
  );
  const agent3Id = state.cats[0].id;
  state = assignCatToChannel(
    state,
    channelId,
    {
      catId: agent3Id,
      provider: 'codex',
      roles: ['synthesizer'],
    },
    now,
  );

  const firstReply = createDeferred();
  const secondReply = createDeferred();
  const thirdRequested = createDeferred();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-2')) {
      return firstReply.promise;
    }
    if (content.includes('You are Agent-1')) {
      return secondReply.promise;
    }
    if (content.includes('You are Agent-3')) {
      thirdRequested.resolve();
      return usage('Agent-3 handled the third step.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatchedPromise = routeChannelMessage(
    state,
    channelId,
    {
      body: 'Run the room in sequence.',
      messageMetadata: {
        recipientParticipantIds: [agent2Id, agent1Id, agent3Id],
        workflowShape: 'sequential',
      },
    },
    runtimeClient,
    now,
  );

  firstReply.resolve(usage('Agent-2 handled the first step.'));
  await Promise.resolve();
  secondReply.resolve(usage('Agent-1 handled the second step.'));
  await thirdRequested.promise;

  const dispatched = await dispatchedPromise;
  const channel = buildChannelView(dispatched.state, channelId);
  const replies = channel.messages.filter((message) => message.senderKind === 'agent');

  assert.deepEqual(
    replies.map((message) => message.senderName),
    ['Agent-2', 'Agent-1', 'Agent-3'],
  );
  assert.match(
    runtimeClient.sentMessages[2]?.content ?? '',
    /\[agent:Agent-1\] Agent-1 handled the second step\./u,
  );
  assert.match(
    runtimeClient.sentMessages[2]?.content ?? '',
    /Latest routed handoff:\nAgent-1 handled the second step\./u,
  );
  assert.equal(
    runtimeClient.createdSessions[2]?.context?.metadata?.sourceMessageId,
    replies[1]?.id,
  );
  assert.equal(
    runtimeClient.sentMessages[2]?.input?.context?.metadata?.sourceMessageId,
    replies[1]?.id,
  );
  assert.deepEqual(
    channel.roomRouting?.workflow.turnHistory[0]?.targetStatuses.map((target) => target.sourceMessageId),
    [channel.messages.find((message) => message.senderKind === 'user')?.id, replies[0]?.id, replies[1]?.id],
  );
});

test('initial sequential audience persists continuation checkpoints as the prompt frontier advances', async () => {
  const { state, channelId, agent1Id, agent2Id } = await createChannelState();
  const now = new Date('2026-03-21T00:00:00.000Z');
  const store = new TrackingChatStore(state);
  const firstReply = createDeferred();
  const secondReply = createDeferred();
  const secondRequested = createDeferred();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-2')) {
      return firstReply.promise;
    }
    if (content.includes('You are Agent-1')) {
      secondRequested.resolve();
      return secondReply.promise;
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: 'Run the room in sequence.',
      messageMetadata: {
        recipientParticipantIds: [agent2Id, agent1Id],
        workflowShape: 'sequential',
      },
    },
    runtimeClient,
    now,
    { chatStore: store },
  );
  const begunChannel = requireChannel(begun.state, channelId);
  const begunTargetStatuses = begunChannel.roomRouting.workflow.activeTurn?.targetStatuses ?? [];
  assert.equal(begunTargetStatuses.length, 2);
  assert.deepEqual(
    begunTargetStatuses.map((target) => ({
      participantId: target.participant.participantId,
      status: target.status,
    })),
    [
      { participantId: agent2Id, status: 'pending' },
      { participantId: agent1Id, status: 'pending' },
    ],
  );
  const begunTargetStateId = begunTargetStatuses[0]?.id ?? null;
  assert.ok(begunTargetStateId);
  const dispatchPromise = continueBegunChannelMessageDispatch(
    begun,
    channelId,
    runtimeClient,
    now,
    { chatStore: store },
  );

  firstReply.resolve(usage('Agent-2 handled the first step.'));
  await secondRequested.promise;

  const inFlightState = await store.read();
  const inFlightChannel = buildChannelView(inFlightState, channelId);
  const activeTurn = inFlightChannel.roomRouting?.workflow.activeTurn;
  const firstReplyMessage = inFlightChannel.messages.find((message) =>
    message.senderKind === 'agent' && message.senderName === 'Agent-2');
  const continuationCheckpoint = [...(activeTurn?.events ?? [])].reverse().find((event) =>
    event.kind === 'checkpoint'
    && event.metadata?.checkpointKind === 'continuation'
    && event.metadata?.continuationSourceMessageId === firstReplyMessage?.id);

  assert.ok(activeTurn);
  assert.equal(activeTurn?.stageId, 'continuation_handoff');
  assert.ok(firstReplyMessage);
  assert.ok(continuationCheckpoint);
  assert.deepEqual(
    continuationCheckpoint?.targets.map((target) => target.participantName),
    ['Agent-1'],
  );
  assert.equal(
    continuationCheckpoint?.metadata?.workflowStageId,
    'continuation_handoff',
  );
  assert.equal(
    continuationCheckpoint?.metadata?.workflowShape,
    'sequential',
  );
  assert.equal(
    continuationCheckpoint?.metadata?.branchStrategy,
    'transplant_context',
  );
  assert.equal(
    continuationCheckpoint?.metadata?.continuationSourceMessageId,
    firstReplyMessage?.id,
  );

  secondReply.resolve(usage('Agent-1 handled the second step.'));
  await dispatchPromise;
});

test('sequential room audience does not redispatch queued targets when replies mention the remaining audience', async () => {
  let { state, channelId, agent1Id, agent2Id } = await createChannelState();
  const now = new Date('2026-03-21T00:00:00.000Z');
  state = createCat(
    state,
    {
      name: 'Agent-3',
      provider: 'codex',
      roles: ['synthesizer'],
    },
    now,
  );
  const agent3Id = state.cats[0].id;
  state = assignCatToChannel(
    state,
    channelId,
    {
      catId: agent3Id,
      provider: 'codex',
      roles: ['synthesizer'],
    },
    now,
  );

  const firstReply = createDeferred();
  const secondReply = createDeferred();
  const secondRequested = createDeferred();
  const thirdRequested = createDeferred();
  let secondHasStarted = false;
  let thirdHasStarted = false;
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return firstReply.promise;
    }
    if (content.includes('You are Agent-2')) {
      secondHasStarted = true;
      secondRequested.resolve();
      return secondReply.promise;
    }
    if (content.includes('You are Agent-3')) {
      thirdHasStarted = true;
      thirdRequested.resolve();
      return usage('Agent-3 closed out the room.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatchedPromise = routeChannelMessage(
    state,
    channelId,
    {
      body: 'Handle this in order.',
      messageMetadata: {
        recipientParticipantIds: [agent1Id, agent2Id, agent3Id],
        workflowShape: 'sequential',
      },
    },
    runtimeClient,
    now,
  );

  await Promise.resolve();
  assert.equal(secondHasStarted, false);
  assert.equal(thirdHasStarted, false);

  firstReply.resolve(usage('@Agent-2 @Agent-3 take the next steps in order.'));
  await secondRequested.promise;
  assert.equal(thirdHasStarted, false);

  secondReply.resolve(usage('@Agent-3 finish the room.'));
  await thirdRequested.promise;

  const dispatched = await dispatchedPromise;
  const channel = buildChannelView(dispatched.state, channelId);
  const replies = channel.messages.filter((message) => message.senderKind === 'agent');

  assert.deepEqual(
    runtimeClient.sentMessages.map((message) => {
      if (message.content.includes('You are Agent-1')) {
        return 'Agent-1';
      }
      if (message.content.includes('You are Agent-2')) {
        return 'Agent-2';
      }
      if (message.content.includes('You are Agent-3')) {
        return 'Agent-3';
      }
      return 'unknown';
    }),
    ['Agent-1', 'Agent-2', 'Agent-3'],
  );
  assert.equal(runtimeClient.createdSessions.length, 3);
  assert.deepEqual(
    replies.map((message) => message.senderName),
    ['Agent-1', 'Agent-2', 'Agent-3'],
  );
  assert.match(
    runtimeClient.sentMessages[2]?.content ?? '',
    /\[agent:Agent-2\] @Agent-3 finish the room\./u,
  );
  assert.match(
    runtimeClient.sentMessages[2]?.content ?? '',
    /Latest routed handoff:\n@Agent-3 finish the room\./u,
  );
  assert.equal(
    channel.roomRouting?.workflow.turnHistory[0]?.targetStatuses.find(
      (target) => target.participant.participantName === 'Agent-2',
    )?.branchStrategy,
    'transplant_context',
  );
  assert.equal(
    channel.roomRouting?.workflow.turnHistory[0]?.targetStatuses.find(
      (target) => target.participant.participantName === 'Agent-2',
    )?.trigger,
    'continuation_mention',
  );
  assert.equal(
    channel.roomRouting?.workflow.turnHistory[0]?.targetStatuses.find(
      (target) => target.participant.participantName === 'Agent-2',
    )?.handoffReason,
    'workflow_continuation',
  );
  assert.equal(
    channel.roomRouting?.workflow.turnHistory[0]?.targetStatuses.find(
      (target) => target.participant.participantName === 'Agent-3',
    )?.branchStrategy,
    'transplant_context',
  );
  assert.equal(
    channel.roomRouting?.workflow.turnHistory[0]?.targetStatuses.find(
      (target) => target.participant.participantName === 'Agent-3',
    )?.trigger,
    'continuation_mention',
  );
  assert.equal(
    channel.roomRouting?.workflow.turnHistory[0]?.targetStatuses.find(
      (target) => target.participant.participantName === 'Agent-3',
    )?.handoffReason,
    'workflow_continuation',
  );
  assert.equal(channel.roomRouting?.lastOutcome?.dispatches.length, 3);
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.workflowShape, 'sequential');
  assert.equal(
    channel.roomRouting?.workflow.eventHistory.some((event) => event.kind === 'fan_out'),
    false,
  );
});

test('concurrent room audience does not redispatch completed peer targets from a later branch handoff', async () => {
  let { state, channelId, agent1Id, agent2Id } = await createChannelState();
  const now = new Date('2026-03-21T00:00:00.000Z');
  state = createCat(
    state,
    {
      name: 'Agent-3',
      provider: 'codex',
      roles: ['synthesizer'],
    },
    now,
  );
  const agent3Id = state.cats[0].id;
  state = assignCatToChannel(
    state,
    channelId,
    {
      catId: agent3Id,
      provider: 'codex',
      roles: ['synthesizer'],
    },
    now,
  );

  const firstReply = createDeferred();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return firstReply.promise;
    }
    if (content.includes('You are Agent-2')) {
      return usage('Agent-2 handled the concurrent branch.');
    }
    if (content.includes('You are Agent-3')) {
      return usage('Agent-3 handled the concurrent branch.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatchedPromise = routeChannelMessage(
    state,
    channelId,
    {
      body: 'Handle this together.',
      messageMetadata: {
        recipientParticipantIds: [agent1Id, agent2Id, agent3Id],
        workflowShape: 'concurrent',
      },
    },
    runtimeClient,
    now,
  );

  await Promise.resolve();
  firstReply.resolve(usage('@Agent-2 @Agent-3 summarize your branches.'));

  const dispatched = await dispatchedPromise;
  const channel = buildChannelView(dispatched.state, channelId);
  const replies = channel.messages.filter((message) => message.senderKind === 'agent');
  const dispatches = channel.roomRouting?.lastOutcome?.dispatches ?? [];
  const dispatchesByTarget = new Map();
  const repliesBySender = new Map();
  for (const dispatch of dispatches) {
    dispatchesByTarget.set(
      dispatch.target.participantName,
      (dispatchesByTarget.get(dispatch.target.participantName) ?? 0) + 1,
    );
  }
  for (const reply of replies) {
    repliesBySender.set(
      reply.senderName,
      (repliesBySender.get(reply.senderName) ?? 0) + 1,
    );
  }

  assert.deepEqual(
    runtimeClient.sentMessages.map((message) => {
      if (message.content.includes('You are Agent-1')) {
        return 'Agent-1';
      }
      if (message.content.includes('You are Agent-2')) {
        return 'Agent-2';
      }
      if (message.content.includes('You are Agent-3')) {
        return 'Agent-3';
      }
      return 'unknown';
    }).sort(),
    ['Agent-1', 'Agent-2', 'Agent-3'],
  );
  assert.equal(runtimeClient.createdSessions.length, 3);
  assert.equal(replies.length, 3);
  assert.equal(dispatches.length, 3);
  assert.equal(dispatchesByTarget.get('Agent-1') ?? 0, 1);
  assert.equal(dispatchesByTarget.get('Agent-2') ?? 0, 1);
  assert.equal(dispatchesByTarget.get('Agent-3') ?? 0, 1);
  assert.equal(repliesBySender.get('Agent-1') ?? 0, 1);
  assert.equal(repliesBySender.get('Agent-2') ?? 0, 1);
  assert.equal(repliesBySender.get('Agent-3') ?? 0, 1);
  assert.equal(
    dispatches.some((dispatch) => dispatch.trigger === 'continuation_mention'),
    false,
  );
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.workflowShape, 'concurrent');
});

test('current-turn draft audience metadata respects the configured audience cap', async () => {
  const { state, channelId, agent1Id, agent2Id } = await createChannelState();
  state.capabilities.maxAudienceParticipants = 1;
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-2')) {
      return usage('Agent-2 handled the capped audience turn.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Kick off the capped shared room.',
      messageMetadata: {
        recipientParticipantIds: [agent2Id, agent1Id],
        workflowShape: 'sequential',
      },
    },
    runtimeClient,
    new Date('2026-03-21T00:00:00.000Z'),
  );
  const channel = buildChannelView(dispatched.state, channelId);
  const replies = channel.messages.filter((message) => message.senderKind === 'agent');

  assert.equal(runtimeClient.createdSessions.length, 1);
  assert.equal(runtimeClient.sentMessages[0]?.content.includes('You are Agent-2'), true);
  assert.equal(runtimeClient.sentMessages.some((message) => message.content.includes('You are Agent-1')), false);
  assert.deepEqual(replies.map((message) => message.senderName), ['Agent-2']);
});

test('explicit mentions stay authoritative over current-turn draft audience metadata', async () => {
  const { state, channelId, agent2Id } = await createChannelState();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return usage('Agent-1 handled the explicit mention.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    {
      body: '@Agent-1 take the first pass.',
      messageMetadata: {
        recipientParticipantIds: [agent2Id],
        workflowShape: 'sequential',
      },
    },
    runtimeClient,
    new Date('2026-03-21T00:00:00.000Z'),
  );
  const channel = buildChannelView(dispatched.state, channelId);

  assert.equal(runtimeClient.createdSessions.length, 1);
  assert.equal(runtimeClient.sentMessages[0]?.content.includes('You are Agent-1'), true);
  assert.equal(runtimeClient.sentMessages.some((message) => message.content.includes('You are Agent-2')), false);
  assert.equal(channel.roomRouting?.lastOutcome?.resolution.selectionKind, 'explicit_mentions');
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.workflowShape, 'sequential');
});

test('multi-target converge metadata does not force the turn down the sequential path', async () => {
  const { state, channelId, agent1Id, agent2Id } = await createChannelState();
  const agent1Reply = createDeferred();
  const agent2Reply = createDeferred();
  const bothRequested = createDeferred();
  let agent1Requested = false;
  let agent2Requested = false;
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      agent1Requested = true;
      if (agent2Requested) {
        bothRequested.resolve();
      }
      return agent1Reply.promise;
    }
    if (content.includes('You are Agent-2')) {
      agent2Requested = true;
      if (agent1Requested) {
        bothRequested.resolve();
      }
      return agent2Reply.promise;
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatchedPromise = routeChannelMessage(
    state,
    channelId,
    {
      body: 'Kick off the shared room.',
      messageMetadata: {
        recipientParticipantIds: [agent1Id, agent2Id],
        workflowShape: 'converge',
      },
    },
    runtimeClient,
    new Date('2026-03-21T00:00:00.000Z'),
  );

  await bothRequested.promise;
  agent2Reply.resolve(usage('Agent-2 handled the second branch.'));
  await Promise.resolve();
  agent1Reply.resolve(usage('Agent-1 handled the first branch.'));

  const dispatched = await dispatchedPromise;
  const channel = buildChannelView(dispatched.state, channelId);

  assert.equal(
    channel.roomRouting?.workflow.turnHistory[0]?.workflowShape,
    'concurrent',
  );
  assert.equal(
    channel.roomRouting?.workflow.turnHistory[0]?.events.some(
      (event) => event.kind === 'fan_out',
    ),
    true,
  );
});

test('routeChannelMessage persists in-flight workflow snapshots before the full route completes', async () => {
  const { state, channelId } = await createChannelState();
  const store = new TrackingChatStore(state);
  const agent1Reply = createDeferred();
  const agent2Reply = createDeferred();
  const bothRequested = createDeferred();
  let agent1Requested = false;
  let agent2Requested = false;
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      agent1Requested = true;
      if (agent2Requested) {
        bothRequested.resolve();
      }
      return agent1Reply.promise;
    }
    if (content.includes('You are Agent-2')) {
      agent2Requested = true;
      if (agent1Requested) {
        bothRequested.resolve();
      }
      return agent2Reply.promise;
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatchedPromise = routeChannelMessage(
    state,
    channelId,
    { body: '@Agent-1 @Agent-2 review this change.' },
    runtimeClient,
    new Date('2026-03-21T00:00:00.000Z'),
    { chatStore: store },
  );
  await bothRequested.promise;

  const persistedState = await store.read();
  const persistedChannel = buildChannelView(persistedState, channelId);
  const persistedCore = await store.readCore();
  const persistedRun = persistedCore.runs.find((candidate) =>
    candidate.conversationId === `conversation-channel-${channelId}`,
  );

  assert.ok(store.writeCount >= 2);
  assert.equal(persistedChannel.roomRouting?.workflow.activeTurn?.status, 'running');
  assert.equal(persistedChannel.roomRouting?.workflow.turnHistory.length, 0);
  assert.equal(
    persistedChannel.roomRouting?.workflow.activeTurn?.targetStatuses.length,
    2,
  );
  assert.ok(
    persistedChannel.roomRouting?.workflow.activeTurn?.targetStatuses.every(
      (target) => target.status === 'pending' || target.status === 'running',
    ),
  );
  assert.ok(persistedRun);
  assert.equal(persistedRun?.status, 'running');

  agent2Reply.resolve(usage('Agent-2 finished the review.'));
  await Promise.resolve();
  agent1Reply.resolve(usage('Agent-1 finished the review.'));
  const dispatched = await dispatchedPromise;
  const finalChannel = buildChannelView(dispatched.state, channelId);

  assert.equal(finalChannel.roomRouting?.workflow.activeTurn, null);
  assert.equal(finalChannel.roomRouting?.workflow.turnHistory.length, 1);
});

test('continueBegunChannelMessageDispatch persists pending workflow targets before session wake completes', async () => {
  const { state, channelId } = await createChannelState();
  const store = new TrackingChatStore(state);
  const createSessionGate = createDeferred();
  let createSessionRequested = false;
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return usage('Agent-1 handled the review.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });
  const originalCreateSession = runtimeClient.createSession.bind(runtimeClient);
  runtimeClient.createSession = async (input) => {
    createSessionRequested = true;
    await createSessionGate.promise;
    return originalCreateSession(input);
  };

  const now = new Date('2026-03-21T00:10:00.000Z');
  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    { body: '@Agent-1 review this change.' },
    runtimeClient,
    now,
    { chatStore: store },
  );
  const begunChannel = requireChannel(begun.state, channelId);
  const begunTargetStatuses = begunChannel.roomRouting.workflow.activeTurn?.targetStatuses ?? [];
  assert.equal(begunTargetStatuses.length, 1);
  assert.equal(begunTargetStatuses[0]?.status, 'pending');
  const begunTargetStateId = begunTargetStatuses[0]?.id ?? null;
  assert.ok(begunTargetStateId);
  const dispatchPromise = continueBegunChannelMessageDispatch(
    begun,
    channelId,
    runtimeClient,
    now,
    { chatStore: store },
  );

  while (!createSessionRequested || store.writeCount < 2) {
    await Promise.resolve();
  }

  const persistedChannel = requireChannel(await store.read(), channelId);
  assert.equal(persistedChannel.roomRouting?.workflow.activeTurn?.status, 'running');
  assert.equal(
    persistedChannel.roomRouting?.workflow.activeTurn?.targetStatuses.length,
    1,
  );
  assert.equal(
    persistedChannel.roomRouting?.workflow.activeTurn?.targetStatuses[0]?.status,
    'pending',
  );
  assert.equal(
    persistedChannel.roomRouting?.workflow.activeTurn?.targetStatuses[0]?.id,
    begunTargetStateId,
  );

  createSessionGate.resolve();
  await dispatchPromise;
});

test('continueBegunChannelMessageDispatch keeps preseeded lane ids stable across sequential handoff', async () => {
  const { state, channelId, agent1Id, agent2Id } = await createChannelState();
  const store = new TrackingChatStore(state);
  const firstReply = createDeferred();
  const secondRequested = createDeferred();
  let secondHasStarted = false;
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-2')) {
      return firstReply.promise;
    }
    if (content.includes('You are Agent-1')) {
      secondHasStarted = true;
      secondRequested.resolve();
      return usage('Agent-1 handled the second sequential step.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const now = new Date('2026-03-21T00:12:00.000Z');
  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: 'Handle this in audience order.',
      messageMetadata: {
        recipientParticipantIds: [agent2Id, agent1Id],
        workflowShape: 'sequential',
      },
    },
    runtimeClient,
    now,
    { chatStore: store },
  );
  const begunTargetIds = (
    requireChannel(begun.state, channelId).roomRouting.workflow.activeTurn?.targetStatuses ?? []
  ).map((target) => target.id);
  assert.deepEqual(begunTargetIds.length, 2);

  const dispatchPromise = continueBegunChannelMessageDispatch(
    begun,
    channelId,
    runtimeClient,
    now,
    { chatStore: store },
  );

  await Promise.resolve();
  assert.equal(secondHasStarted, false);
  firstReply.resolve(usage('Agent-2 handled the first sequential step.'));
  await secondRequested.promise;

  const persistedChannel = requireChannel(await store.read(), channelId);
  const persistedTargetStatuses = persistedChannel.roomRouting.workflow.activeTurn?.targetStatuses ?? [];
  assert.deepEqual(
    persistedTargetStatuses.map((target) => target.id),
    begunTargetIds,
  );

  await dispatchPromise;
});

test('routeChannelMessage auto-checks out an approved channel task for the assigned cat session', async () => {
  const { state, channelId } = await createChannelState();
  const store = new CountingCoreChatStore();
  const now = new Date('2026-03-24T03:00:00.000Z');
  await store.write(state);

  const taskId = `task-channel-${channelId}`;
  const approvedCore = await store.readCore();
  await store.writeCore({
    ...approvedCore,
    tasks: approvedCore.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            status: 'approved',
            approval: {
              ...task.approval,
              status: 'approved',
              decidedAt: now.toISOString(),
              decidedByActorId: 'actor-owner',
            },
          }
        : task),
  });
  store.readCoreCount = 0;

  const watcherGate = createDeferred();
  let runCompleted = false;
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    runCompleted = true;
    watcherGate.resolve();
    if (content.includes('You are Agent-1')) {
      return usage('Agent-1 finished the review.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });
  runtimeClient.observeSession = async (sessionId) => ({
    session: {
      id: sessionId,
      inspection: runCompleted
        ? {
            state: 'idle',
            lastRun: {
              id: `runtime-run-${sessionId}`,
              status: 'succeeded',
              startedAt: now.toISOString(),
              endedAt: '2026-03-24T03:01:00.000Z',
              resultSummary: 'Agent-1 finished the review.',
            },
          }
        : {
            state: 'running',
            currentRun: {
              id: `runtime-run-${sessionId}`,
              status: 'running',
              startedAt: now.toISOString(),
            },
          },
    },
    observePath: `/sessions/${sessionId}/observe`,
    stream: {
      path: `/sessions/${sessionId}/stream`,
      available: true,
    },
  });
  runtimeClient.streamSession = async () => {
    await watcherGate.promise;
  };

  const dispatched = await routeChannelMessage(
    await store.read(),
    channelId,
    { body: '@Agent-1 review this change.' },
    runtimeClient,
    now,
    { chatStore: store },
  );
  await store.write(dispatched.state);
  await new Promise((resolve) => setTimeout(resolve, 10));
  const routeReadCoreCount = store.readCoreCount;

  const core = await store.readCore();
  const task = core.tasks.find((candidate) => candidate.id === taskId);
  const run = core.runs.find((candidate) =>
    candidate.taskId === taskId && candidate.metadata?.source === 'task-lifecycle');

  assert.ok(task);
  assert.ok(run);
  // One read primes the task-aware session request, while the watcher performs
  // its initial and terminal reconciliation reads. Dispatch prompt construction
  // reuses the checked-out core snapshot instead of rereading Cats Core.
  assert.equal(routeReadCoreCount, 3);
  assert.equal(runtimeClient.createdSessions[0]?.requestedStrategy, 'react');
  assert.deepEqual(runtimeClient.createdSessions[0]?.correlation, {
    taskId,
    conversationId: `conversation-channel-${channelId}`,
    workItemId: buildChatWorkItemId(channelId),
    product: 'chat',
  });
  assert.equal(run?.status, 'completed');
  assert.equal(run?.metadata.sessionId, 'session-1');
  assert.equal(task?.status, 'completed');
  assert.equal(task?.metadata?.taskLifecycle?.runId, run?.id);
  assert.ok(
    core.activities.some((activity) => activity.runId === run?.id && /started/i.test(activity.message)),
  );
  assert.ok(
    core.activities.some((activity) => activity.runId === run?.id && /completed/i.test(activity.message)),
  );
});

test('routeChannelMessage forwards planning metadata into chat session creation for approved tasks', async () => {
  const { state, channelId } = await createChannelState();
  const store = new MemoryChatStore();
  const now = new Date('2026-03-24T04:00:00.000Z');
  await store.write(state);

  const taskId = `task-channel-${channelId}`;
  const approvedCore = await store.readCore();
  await store.writeCore({
    ...approvedCore,
    tasks: approvedCore.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            status: 'approved',
            approval: {
              ...task.approval,
              status: 'approved',
              decidedAt: now.toISOString(),
              decidedByActorId: 'actor-owner',
            },
            metadata: patchTaskPlanningMetadata(task.metadata, {
              strategyHint: 'tree_of_thoughts',
              acceptanceCriteria: 'Summarize the review and flag any blockers.',
              strategyContext: {
                reviewMode: 'strict',
              },
            }),
          }
        : task),
  });

  const runtimeClient = createRuntimeStub(async () => usage('Agent-1 completed the turn.'));

  await routeChannelMessage(
    await store.read(),
    channelId,
    { body: '@Agent-1 review the latest diff.' },
    runtimeClient,
    now,
    { chatStore: store },
  );

  assert.equal(runtimeClient.createdSessions.length, 1);
  assert.equal(runtimeClient.createdSessions[0].requestedStrategy, 'tree_of_thoughts');
  assert.equal(
    runtimeClient.createdSessions[0].acceptanceCriteria,
    'Summarize the review and flag any blockers.',
  );
  assert.deepEqual(runtimeClient.createdSessions[0].strategyContext, {
    reviewMode: 'strict',
  });
  assert.deepEqual(runtimeClient.createdSessions[0].correlation, {
    taskId,
    conversationId: `conversation-channel-${channelId}`,
    workItemId: buildChatWorkItemId(channelId),
    product: 'chat',
  });
});

test('provider default chat restarts orchestrator sessions when the pending model changes and records provenance', async () => {
  let state = await new MemoryChatStore().read();
  const now = new Date('2026-03-23T00:00:00.000Z');

  state = createChannel(
    state,
    {
      title: 'Default Thread',
      topic: 'Switch between providers per turn.',
      skipBossCatGreeting: true,
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ sessionId }) =>
    usage(`response from ${sessionId}: ${sessionId === 'session-1' ? 'claude' : 'gemini'}`));

  const stableTurns = [
    'First turn',
    'Second turn',
    'Third turn',
    'Fourth turn',
    'Fifth turn',
  ];
  let dispatchedState = state;
  for (let index = 0; index < stableTurns.length; index += 1) {
    const dispatched = await routeChannelMessage(
      dispatchedState,
      channelId,
      {
        body: stableTurns[index],
        pendingProvider: 'claude',
        pendingModel: 'claude-default',
      },
      runtimeClient,
      new Date(`2026-03-23T00:0${index}:00.000Z`),
    );
    dispatchedState = dispatched.state;
  }
  const switchedDispatch = await routeChannelMessage(
    dispatchedState,
    channelId,
    {
      body: 'Switch turn',
      pendingProvider: 'gemini',
      pendingModel: 'gemini-default',
    },
    runtimeClient,
    new Date('2026-03-23T00:09:00.000Z'),
  );
  const channel = buildChannelView(switchedDispatch.state, channelId);
  const defaultChatReplies = channel.messages.filter(
    (message) => message.metadata?.targetKind === 'orchestrator' && message.senderName === 'Orchestrator',
  );

  assert.equal(runtimeClient.createdSessions.length, 2);
  assert.equal(runtimeClient.createdSessions[0].provider, 'claude');
  assert.equal(
    runtimeClient.createdSessions[0]?.context?.metadata?.continuityMode,
    'fresh_start',
  );
  assert.equal(
    runtimeClient.createdSessions[0]?.context?.metadata?.continuityDeliveryMode,
    'none',
  );
  assert.equal(runtimeClient.createdSessions[1].provider, 'gemini');
  assert.equal(runtimeClient.createdSessions[1]?.instructions, undefined);
  assert.equal(
    runtimeClient.createdSessions[1]?.context?.metadata?.continuityMode,
    'full_transplant',
  );
  assert.equal(
    runtimeClient.createdSessions[1]?.context?.metadata?.continuityDeliveryMode,
    'turn_instructions',
  );
  assert.deepEqual(runtimeClient.closedSessions, ['session-1']);
  assert.equal(channel.pendingProvider, 'gemini');
  assert.equal(channel.pendingModel, 'gemini-default');
  assert.equal(defaultChatReplies[0]?.senderKind, 'agent');
  assert.equal(defaultChatReplies[0]?.executionProvider, 'claude');
  assert.equal(defaultChatReplies[0]?.executionModel, 'claude-default');
  assert.equal(defaultChatReplies.at(-1)?.senderKind, 'agent');
  assert.equal(defaultChatReplies.at(-1)?.executionProvider, 'gemini');
  assert.equal(defaultChatReplies.at(-1)?.executionModel, 'gemini-default');
  assert.equal(runtimeClient.sentMessages[0]?.content, 'First turn');
  assert.equal(runtimeClient.sentMessages[0]?.input?.instructions, undefined);
  assert.equal(
    runtimeClient.sentMessages[0]?.input?.context?.metadata?.continuityMode,
    'fresh_start',
  );
  assert.equal(runtimeClient.sentMessages.at(-1)?.content, 'Switch turn');
  assert.match(
    runtimeClient.sentMessages.at(-1)?.input?.instructions ?? '',
    /Same conversation continuity transcript:/u,
  );
  assert.equal(
    runtimeClient.sentMessages.at(-1)?.input?.context?.metadata?.continuityMode,
    'full_transplant',
  );
  assert.equal(
    runtimeClient.sentMessages.at(-1)?.input?.context?.metadata?.continuityDeliveryMode,
    'turn_instructions',
  );
  assert.match(
    runtimeClient.sentMessages.at(-1)?.input?.instructions ?? '',
    /\[user:User\] First turn/u,
  );
  assert.match(
    runtimeClient.sentMessages.at(-1)?.input?.instructions ?? '',
    /\[agent:Orchestrator\] response from session-1: claude/u,
  );
  assert.match(
    runtimeClient.sentMessages.at(-1)?.input?.instructions ?? '',
    /\[user:User\] Fifth turn/u,
  );
});

test('provider default chat full-transplants earlier user-only context on replacement sessions', async () => {
  let state = await new MemoryChatStore().read();
  const now = new Date('2026-03-23T00:00:00.000Z');

  state = createChannel(
    state,
    {
      title: 'Default Thread',
      topic: 'Replacement sessions should not fall back to excerpt-only user context.',
      skipBossCatGreeting: true,
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    now,
  );

  const channelId = state.selectedChannelId;
  state = setChannelOrchestratorLease(
    state,
    channelId,
    {
      sessionId: 'session-existing',
      status: 'ready',
      provider: 'claude',
      model: 'claude-default',
      startedAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
    },
    now,
  );

  for (let index = 0; index < 10; index += 1) {
    state = appendMessage(
      state,
      channelId,
      {
        senderKind: 'user',
        senderName: 'User',
        body: `Earlier user turn ${index + 1}`,
      },
      new Date(`2026-03-23T00:${String(index).padStart(2, '0')}:30.000Z`),
    ).state;
  }

  const runtimeClient = createRuntimeStub(async ({ sessionId }) =>
    usage(`response from ${sessionId}`));

  await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Switch turn',
      pendingProvider: 'gemini',
      pendingModel: 'gemini-default',
    },
    runtimeClient,
    new Date('2026-03-23T00:11:00.000Z'),
  );

  assert.deepEqual(runtimeClient.closedSessions, ['session-existing']);
  assert.equal(runtimeClient.createdSessions.length, 1);
  assert.equal(runtimeClient.createdSessions[0]?.instructions, undefined);
  assert.equal(
    runtimeClient.sentMessages[0]?.input?.context?.metadata?.continuityMode,
    'full_transplant',
  );
  assert.equal(
    runtimeClient.sentMessages[0]?.input?.context?.metadata?.continuityDeliveryMode,
    'turn_instructions',
  );
  assert.match(
    runtimeClient.sentMessages[0]?.input?.instructions ?? '',
    /Same conversation continuity transcript:/u,
  );
  assert.match(
    runtimeClient.sentMessages[0]?.input?.instructions ?? '',
    /\[user:User\] Earlier user turn 1/u,
  );
  assert.match(
    runtimeClient.sentMessages[0]?.input?.instructions ?? '',
    /\[user:User\] Earlier user turn 10/u,
  );
});

test('default-chat replacement-session transplants preserve prior assistant tool labels', async () => {
  let state = await new MemoryChatStore().read();
  const now = new Date('2026-03-23T00:00:00.000Z');

  state = createChannel(
    state,
    {
      title: 'Default Thread',
      topic: 'Carry tool context across a retargeted default restart.',
      skipBossCatGreeting: true,
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ sessionId }) => {
    if (sessionId === 'session-1') {
      return {
        segments: [
          {
            kind: 'tool_use',
            text: '',
            toolName: 'search_repo',
            toolId: 'tool-search',
          },
          {
            kind: 'text',
            text: 'I found the relevant files.',
            toolName: null,
            toolId: null,
          },
        ],
        inputTokens: 9,
        outputTokens: 6,
        tokensUsed: 15,
      };
    }

    return usage(`response from ${sessionId}`);
  });

  const firstDispatch = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Inspect the repo first.',
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    runtimeClient,
    now,
  );
  await routeChannelMessage(
    firstDispatch.state,
    channelId,
    {
      body: 'Now switch providers and continue.',
      pendingProvider: 'gemini',
      pendingModel: 'gemini-default',
    },
    runtimeClient,
    new Date('2026-03-23T00:01:00.000Z'),
  );

  assert.match(
    runtimeClient.sentMessages[1]?.input?.instructions ?? '',
    /\[agent:Orchestrator\] \[tools: search_repo\] I found the relevant files\./u,
  );
});

test('default-chat replacement-session transplants fold segmented assistant turns into one continuity line', async () => {
  let state = await new MemoryChatStore().read();
  const now = new Date('2026-03-23T00:00:00.000Z');

  state = createChannel(
    state,
    {
      title: 'Default Thread',
      topic: 'Carry segmented assistant turns cleanly across a retarget.',
      skipBossCatGreeting: true,
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ sessionId }) => {
    if (sessionId === 'session-1') {
      return {
        segments: [
          {
            kind: 'text',
            text: 'First segment. ',
            toolName: null,
            toolId: null,
          },
          {
            kind: 'tool_use',
            text: '',
            toolName: 'search_repo',
            toolId: 'tool-search',
          },
          {
            kind: 'text',
            text: 'Second segment.',
            toolName: null,
            toolId: null,
          },
        ],
        inputTokens: 10,
        outputTokens: 8,
        tokensUsed: 18,
      };
    }

    return usage(`response from ${sessionId}`);
  });

  const firstDispatch = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Inspect first, then continue.',
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    runtimeClient,
    now,
  );
  await routeChannelMessage(
    firstDispatch.state,
    channelId,
    {
      body: 'Switch providers and continue.',
      pendingProvider: 'gemini',
      pendingModel: 'gemini-default',
    },
    runtimeClient,
    new Date('2026-03-23T00:01:00.000Z'),
  );

  const instructions = runtimeClient.sentMessages[1]?.input?.instructions ?? '';
  assert.match(
    instructions,
    /\[agent:Orchestrator\] \[tools: search_repo\] First segment\. Second segment\./u,
  );
  assert.equal(instructions.match(/\[agent:Orchestrator\]/gu)?.length ?? 0, 1);
});

test('explicit default-chat start-fresh resets continuity before the next replacement session', async () => {
  let state = await new MemoryChatStore().read();
  const now = new Date('2026-03-23T00:00:00.000Z');

  state = createChannel(
    state,
    {
      title: 'Default Thread',
      topic: 'Explicit start-fresh must cut continuity instead of silently retransplanting.',
      skipBossCatGreeting: true,
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ sessionId }) =>
    usage(`response from ${sessionId}`));

  const firstDispatch = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'First turn',
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    runtimeClient,
    now,
  );
  const resetState = resetDefaultChatContinuity(
    firstDispatch.state,
    channelId,
    new Date('2026-03-23T00:00:30.000Z'),
  );
  const restartedDispatch = await routeChannelMessage(
    resetState,
    channelId,
    {
      body: 'Fresh branch turn',
      pendingProvider: 'gemini',
      pendingModel: 'gemini-default',
    },
    runtimeClient,
    new Date('2026-03-23T00:01:00.000Z'),
  );
  const channel = buildChannelView(restartedDispatch.state, channelId);
  const resetMessage = channel.messages.find((message) => message.metadata?.event === 'continuity_reset');

  assert.deepEqual(runtimeClient.closedSessions, []);
  assert.equal(runtimeClient.createdSessions.length, 2);
  assert.equal(
    runtimeClient.createdSessions[1]?.context?.metadata?.continuityMode,
    'fresh_start',
  );
  assert.equal(
    runtimeClient.createdSessions[1]?.context?.metadata?.continuityDeliveryMode,
    'none',
  );
  assert.equal(runtimeClient.sentMessages[1]?.input?.context?.metadata?.continuityMode, 'fresh_start');
  assert.equal(runtimeClient.sentMessages[1]?.input?.context?.metadata?.continuityDeliveryMode, 'none');
  assert.equal(
    runtimeClient.sentMessages[1]?.input?.context?.metadata?.continuityResetAt,
    '2026-03-23T00:00:30.000Z',
  );
  assert.equal(runtimeClient.sentMessages[1]?.input?.instructions, undefined);
  assert.doesNotMatch(runtimeClient.sentMessages[1]?.input?.instructions ?? '', /First turn/u);
  assert.ok(resetMessage);
  assert.equal(channel.continuityResetAt, '2026-03-23T00:00:30.000Z');
});

test('default-chat retarget after start-fresh only transplants the new continuity branch', async () => {
  let state = await new MemoryChatStore().read();
  const now = new Date('2026-03-23T00:00:00.000Z');

  state = createChannel(
    state,
    {
      title: 'Default Thread',
      topic: 'Retarget after a fresh start must ignore the older branch.',
      skipBossCatGreeting: true,
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ sessionId }) =>
    usage(`response from ${sessionId}`));

  const firstDispatch = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Old branch turn',
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    runtimeClient,
    now,
  );
  const resetState = resetDefaultChatContinuity(
    firstDispatch.state,
    channelId,
    new Date('2026-03-23T00:00:30.000Z'),
  );
  const freshBranchDispatch = await routeChannelMessage(
    resetState,
    channelId,
    {
      body: 'Fresh branch turn',
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    runtimeClient,
    new Date('2026-03-23T00:01:00.000Z'),
  );
  await routeChannelMessage(
    freshBranchDispatch.state,
    channelId,
    {
      body: 'Retarget after reset',
      pendingProvider: 'gemini',
      pendingModel: 'gemini-default',
    },
    runtimeClient,
    new Date('2026-03-23T00:02:00.000Z'),
  );

  const transplantInstructions = runtimeClient.sentMessages[2]?.input?.instructions ?? '';
  assert.match(transplantInstructions, /\[user:User\] Fresh branch turn/u);
  assert.match(transplantInstructions, /\[agent:Orchestrator\] response from session-2/u);
  assert.doesNotMatch(transplantInstructions, /\[user:User\] Old branch turn/u);
  assert.doesNotMatch(transplantInstructions, /\[agent:Orchestrator\] response from session-1/u);
});

test('provider default chat restarts orchestrator sessions when the pending instance changes', async () => {
  let state = await new MemoryChatStore().read();
  const now = new Date('2026-03-23T00:00:00.000Z');

  state = createChannel(
    state,
    {
      title: 'Default Thread',
      topic: 'Switch runtime instances per turn.',
      skipBossCatGreeting: true,
      pendingProvider: 'claude',
      pendingInstance: 'native',
      pendingModel: 'claude-default',
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ sessionId }) =>
    usage(`response from ${sessionId}`));

  const firstDispatch = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'First turn',
      pendingProvider: 'claude',
      pendingInstance: 'native',
      pendingModel: 'claude-default',
    },
    runtimeClient,
    now,
  );
  const secondDispatch = await routeChannelMessage(
    firstDispatch.state,
    channelId,
    {
      body: 'Second turn',
      pendingProvider: 'claude',
      pendingInstance: 'agent/bridge',
      pendingModel: 'claude-default',
    },
    runtimeClient,
    new Date('2026-03-23T00:01:00.000Z'),
  );
  const channel = buildChannelView(secondDispatch.state, channelId);

  assert.equal(runtimeClient.createdSessions.length, 2);
  assert.equal(runtimeClient.createdSessions[0]?.instance, 'native');
  assert.equal(runtimeClient.createdSessions[1]?.instance, 'agent/bridge');
  assert.equal(runtimeClient.createdSessions[1]?.instructions, undefined);
  assert.equal(
    runtimeClient.createdSessions[1]?.context?.metadata?.continuityMode,
    'full_transplant',
  );
  assert.equal(
    runtimeClient.createdSessions[1]?.context?.metadata?.continuityDeliveryMode,
    'turn_instructions',
  );
  assert.deepEqual(runtimeClient.closedSessions, ['session-1']);
  assert.equal(channel.pendingInstance, 'agent/bridge');
  assert.equal(channel.orchestratorLease.instance, 'agent/bridge');
  assert.match(
    runtimeClient.sentMessages[1]?.input?.instructions ?? '',
    /Same conversation continuity transcript:/u,
  );
  assert.match(
    runtimeClient.sentMessages[1]?.input?.instructions ?? '',
    /\[user:User\] First turn/u,
  );
  assert.match(
    runtimeClient.sentMessages[1]?.input?.instructions ?? '',
    /\[agent:Orchestrator\] response from session-1/u,
  );
});

test('provider default chat restarts orchestrator sessions when the pending model selection changes', async () => {
  let state = await new MemoryChatStore().read();
  const now = new Date('2026-03-23T00:00:00.000Z');

  state = createChannel(
    state,
    {
      title: 'Default Thread',
      topic: 'Switch reasoning effort without reusing the stale runtime session.',
      skipBossCatGreeting: true,
      pendingProvider: 'codex',
      pendingModel: 'gpt-5.4',
      pendingModelSelection: {
        entryId: 'gpt-5.4',
        entryMode: 'explicit',
        controls: {
          'codex.reasoning_effort': 'medium',
        },
      },
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ sessionId }) =>
    usage(`response from ${sessionId}`));

  const firstDispatch = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'First turn',
      pendingProvider: 'codex',
      pendingModel: 'gpt-5.4',
      pendingModelSelection: {
        entryId: 'gpt-5.4',
        entryMode: 'explicit',
        controls: {
          'codex.reasoning_effort': 'medium',
        },
      },
    },
    runtimeClient,
    now,
  );
  const secondDispatch = await routeChannelMessage(
    firstDispatch.state,
    channelId,
    {
      body: 'Second turn with deeper reasoning',
      pendingProvider: 'codex',
      pendingModel: 'gpt-5.4',
      pendingModelSelection: {
        entryId: 'gpt-5.4',
        entryMode: 'explicit',
        controls: {
          'codex.reasoning_effort': 'high',
        },
      },
    },
    runtimeClient,
    new Date('2026-03-23T00:01:00.000Z'),
  );
  const channel = buildChannelView(secondDispatch.state, channelId);

  assert.equal(runtimeClient.createdSessions.length, 2);
  assert.deepEqual(runtimeClient.closedSessions, ['session-1']);
  assert.deepEqual(runtimeClient.createdSessions[0]?.modelSelection, {
    entryId: 'gpt-5.4',
    entryMode: 'explicit',
    controls: {
      'codex.reasoning_effort': 'medium',
    },
  });
  assert.deepEqual(runtimeClient.createdSessions[1]?.modelSelection, {
    entryId: 'gpt-5.4',
    entryMode: 'explicit',
    controls: {
      'codex.reasoning_effort': 'high',
    },
  });
  assert.equal(
    runtimeClient.createdSessions[1]?.context?.metadata?.continuityMode,
    'full_transplant',
  );
  assert.equal(channel.pendingProvider, 'codex');
  assert.equal(channel.pendingModel, 'gpt-5.4');
  assert.deepEqual(channel.pendingModelSelection, {
    entryId: 'gpt-5.4',
    entryMode: 'explicit',
    controls: {
      'codex.reasoning_effort': 'high',
    },
  });
  assert.match(
    runtimeClient.sentMessages[1]?.input?.instructions ?? '',
    /Same conversation continuity transcript:/u,
  );
  assert.match(
    runtimeClient.sentMessages[1]?.input?.instructions ?? '',
    /\[user:User\] First turn/u,
  );
});

test('participant sessions restart when a participant model selection changes', async () => {
  let state = await new MemoryChatStore().read();
  const now = new Date('2026-03-23T00:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Reviewer',
      provider: 'codex',
      model: 'gpt-5.4',
      modelSelection: {
        entryId: 'gpt-5.4',
        entryMode: 'explicit',
        controls: {
          'codex.reasoning_effort': 'medium',
        },
      },
    },
    now,
  );
  const catId = state.cats[0].id;
  state = createChannel(
    state,
    {
      title: 'Participant Room',
      topic: 'Cat session should restart when its model selection changes.',
      participantCatIds: [catId],
      defaultRecipientId: catId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ sessionId }) =>
    usage(`response from ${sessionId}`));

  const firstDispatch = await routeChannelMessage(
    state,
    channelId,
    {
      body: '@Reviewer First turn',
    },
    runtimeClient,
    now,
  );
  const retargetedState = setChannelCatExecutionTarget(
    firstDispatch.state,
    channelId,
    catId,
    {
      modelSelection: {
        entryId: 'gpt-5.4',
        entryMode: 'explicit',
        controls: {
          'codex.reasoning_effort': 'high',
        },
      },
    },
    new Date('2026-03-23T00:00:45.000Z'),
  );
  const secondDispatch = await routeChannelMessage(
    retargetedState,
    channelId,
    {
      body: '@Reviewer Second turn',
    },
    runtimeClient,
    new Date('2026-03-23T00:01:00.000Z'),
  );
  const channel = buildChannelView(secondDispatch.state, channelId);

  assert.equal(runtimeClient.createdSessions.length, 2);
  assert.deepEqual(runtimeClient.closedSessions, ['session-1']);
  assert.deepEqual(runtimeClient.createdSessions[0]?.modelSelection, {
    entryId: 'gpt-5.4',
    entryMode: 'explicit',
    controls: {
      'codex.reasoning_effort': 'medium',
    },
  });
  assert.deepEqual(runtimeClient.createdSessions[1]?.modelSelection, {
    entryId: 'gpt-5.4',
    entryMode: 'explicit',
    controls: {
      'codex.reasoning_effort': 'high',
    },
  });
  assert.equal(
    runtimeClient.createdSessions[1]?.context?.metadata?.continuityMode,
    'full_transplant',
  );
  assert.equal(
    runtimeClient.sentMessages[1]?.input?.context?.metadata?.continuityMode,
    'full_transplant',
  );
  assert.match(
    runtimeClient.sentMessages[1]?.input?.instructions ?? '',
    /Same conversation continuity transcript:/u,
  );
  assert.match(
    runtimeClient.sentMessages[1]?.input?.instructions ?? '',
    /\[user:User\] @Reviewer First turn/u,
  );
  assert.match(
    runtimeClient.sentMessages[1]?.input?.instructions ?? '',
    /\[agent:Reviewer\] response from session-1/u,
  );
  assert.equal(channel.assignedParticipants?.[0]?.execution.target.provider, 'codex');
  assert.deepEqual(channel.assignedParticipants?.[0]?.execution.modelSelection, {
    entryId: 'gpt-5.4',
    entryMode: 'explicit',
    controls: {
      'codex.reasoning_effort': 'high',
    },
  });
});

test('participant chat rooms full-transplant continuity when an existing participant restarts on model selection drift', async () => {
  let state = await new MemoryChatStore().read();
  const now = new Date('2026-03-23T00:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Reviewer',
      provider: 'codex',
      model: 'gpt-5.4',
      modelSelection: {
        entryId: 'gpt-5.4',
        entryMode: 'explicit',
        controls: {
          'codex.reasoning_effort': 'medium',
        },
      },
    },
    now,
  );
  const reviewerId = state.cats[0].id;
  state = createCat(
    state,
    {
      name: 'Observer',
      provider: 'claude',
      model: 'claude-sonnet',
    },
    now,
  );
  const observerId = state.cats[0].id;
  state = createChannel(
    state,
    {
      title: 'Review room',
      topic: 'Existing participant-chat members should keep continuity when their session restarts.',
      participantCatIds: [reviewerId, observerId],
      defaultRecipientId: reviewerId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ sessionId, content }) => {
    if (!content.includes('You are Reviewer')) {
      throw new Error(`Unexpected prompt:\n${content}`);
    }
    return usage(`response from ${sessionId}`);
  });

  const firstDispatch = await routeChannelMessage(
    state,
    channelId,
    {
      body: '@Reviewer First review turn',
    },
    runtimeClient,
    now,
  );
  const retargetedState = setChannelCatExecutionTarget(
    firstDispatch.state,
    channelId,
    reviewerId,
    {
      modelSelection: {
        entryId: 'gpt-5.4',
        entryMode: 'explicit',
        controls: {
          'codex.reasoning_effort': 'high',
        },
      },
    },
    new Date('2026-03-23T00:00:45.000Z'),
  );
  await routeChannelMessage(
    retargetedState,
    channelId,
    {
      body: '@Reviewer Second review turn',
    },
    runtimeClient,
    new Date('2026-03-23T00:01:00.000Z'),
  );

  assert.equal(runtimeClient.createdSessions.length, 2);
  assert.deepEqual(runtimeClient.closedSessions, ['session-1']);
  assert.equal(
    runtimeClient.createdSessions[1]?.context?.metadata?.continuityMode,
    'full_transplant',
  );
  assert.equal(
    runtimeClient.sentMessages[1]?.input?.context?.metadata?.continuityMode,
    'full_transplant',
  );
  assert.match(
    runtimeClient.sentMessages[1]?.input?.instructions ?? '',
    /\[user:User\] @Reviewer First review turn/u,
  );
  assert.match(
    runtimeClient.sentMessages[1]?.input?.instructions ?? '',
    /\[agent:Reviewer\] response from session-1/u,
  );
});

test('participant chat rooms full-transplant continuity after stale-session recovery recreates an existing participant session', async () => {
  let state = await new MemoryChatStore().read();
  const now = new Date('2026-03-23T00:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Reviewer',
      provider: 'codex',
      model: 'gpt-5.4',
    },
    now,
  );
  const reviewerId = state.cats[0].id;
  state = createCat(
    state,
    {
      name: 'Observer',
      provider: 'claude',
      model: 'claude-sonnet',
    },
    now,
  );
  const observerId = state.cats[0].id;
  state = createChannel(
    state,
    {
      title: 'Review room',
      topic: 'Stale participant sessions should recover without losing continuity.',
      participantCatIds: [reviewerId, observerId],
      defaultRecipientId: reviewerId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ sessionId, content, sentMessages }) => {
    if (!content.includes('You are Reviewer')) {
      throw new Error(`Unexpected prompt:\n${content}`);
    }
    if (sessionId === 'session-1' && sentMessages.length > 1) {
      throw new Error('Session not found');
    }
    return usage(`response from ${sessionId}`);
  });

  const firstDispatch = await routeChannelMessage(
    state,
    channelId,
    {
      body: '@Reviewer First review turn',
    },
    runtimeClient,
    now,
  );
  const recoveredDispatch = await routeChannelMessage(
    firstDispatch.state,
    channelId,
    {
      body: '@Reviewer Recover the same participant context',
    },
    runtimeClient,
    new Date('2026-03-23T00:01:00.000Z'),
    {
      runtimeRecovery: {
        staleSessionRetryLimit: 1,
      },
    },
  );

  assert.equal(runtimeClient.createdSessions.length, 2);
  assert.deepEqual(runtimeClient.closedSessions, ['session-1']);
  assert.equal(
    runtimeClient.createdSessions[1]?.context?.metadata?.continuityMode,
    'full_transplant',
  );
  assert.equal(
    runtimeClient.sentMessages.at(-1)?.input?.context?.metadata?.continuityMode,
    'full_transplant',
  );
  assert.match(
    runtimeClient.sentMessages.at(-1)?.input?.instructions ?? '',
    /\[user:User\] @Reviewer First review turn/u,
  );
  assert.match(
    runtimeClient.sentMessages.at(-1)?.input?.instructions ?? '',
    /\[agent:Reviewer\] response from session-1/u,
  );
  assert.equal(
    buildChannelView(recoveredDispatch.state, channelId).assignedParticipants?.[0]?.execution.lease.sessionId,
    'session-2',
  );
});

test('direct message full-transplants continuity when a restarted direct-recipient session changes model selection', async () => {
  let state = await new MemoryChatStore().read();
  const now = new Date('2026-03-23T00:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Companion',
      provider: 'codex',
      model: 'gpt-5.4',
      modelSelection: {
        entryId: 'gpt-5.4',
        entryMode: 'explicit',
        controls: {
          'codex.reasoning_effort': 'medium',
        },
      },
    },
    now,
  );
  const companionId = state.cats[0].id;
  state = createChannel(
    state,
    {
      title: 'Companion lane',
      topic: 'Direct-lane restarts should preserve full continuity.',
      roomMode: 'direct_message',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ sessionId }) =>
    usage(`response from ${sessionId}`));

  const firstDispatch = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'First direct turn',
    },
    runtimeClient,
    now,
  );
  const retargetedState = setChannelCatExecutionTarget(
    firstDispatch.state,
    channelId,
    companionId,
    {
      modelSelection: {
        entryId: 'gpt-5.4',
        entryMode: 'explicit',
        controls: {
          'codex.reasoning_effort': 'high',
        },
      },
    },
    new Date('2026-03-23T00:00:45.000Z'),
  );
  await routeChannelMessage(
    retargetedState,
    channelId,
    {
      body: 'Second direct turn',
    },
    runtimeClient,
    new Date('2026-03-23T00:01:00.000Z'),
  );

  assert.equal(runtimeClient.createdSessions.length, 2);
  assert.deepEqual(runtimeClient.closedSessions, ['session-1']);
  assert.equal(
    runtimeClient.createdSessions[0]?.context?.metadata?.continuityMode,
    'fresh_start',
  );
  assert.equal(
    runtimeClient.createdSessions[1]?.context?.metadata?.continuityMode,
    'full_transplant',
  );
  assert.equal(
    runtimeClient.createdSessions[1]?.context?.metadata?.continuityDeliveryMode,
    'turn_instructions',
  );
  assert.equal(
    runtimeClient.sentMessages[1]?.input?.context?.metadata?.continuityMode,
    'full_transplant',
  );
  assert.equal(
    runtimeClient.sentMessages[1]?.input?.context?.metadata?.continuityDeliveryMode,
    'turn_instructions',
  );
  assert.match(
    runtimeClient.sentMessages[1]?.input?.instructions ?? '',
    /Same conversation continuity transcript:/u,
  );
  assert.match(
    runtimeClient.sentMessages[1]?.input?.instructions ?? '',
    /\[user:User\] First direct turn/u,
  );
  assert.match(
    runtimeClient.sentMessages[1]?.input?.instructions ?? '',
    /\[agent:Companion\] response from session-1/u,
  );
});

test('direct message restarts the direct-recipient session when the provider target changes explicitly', async () => {
  let state = await new MemoryChatStore().read();
  const now = new Date('2026-03-23T00:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Companion',
      provider: 'claude',
      model: null,
      roles: ['companion'],
    },
    now,
  );
  const companionId = state.cats[0].id;
  state = createChannel(
    state,
    {
      title: 'Companion lane',
      topic: 'Explicit provider retargets should restart the direct-recipient session.',
      roomMode: 'direct_message',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ sessionId }) =>
    usage(`response from ${sessionId}`));

  const firstDispatch = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'First direct turn',
    },
    runtimeClient,
    now,
  );
  const retargetedState = setChannelCatExecutionTarget(
    firstDispatch.state,
    channelId,
    companionId,
    {
      provider: 'codex',
      model: 'gpt-5.4',
      modelSelection: {
        entryId: 'gpt-5.4',
        entryMode: 'explicit',
        controls: {
          'codex.reasoning_effort': 'high',
        },
      },
    },
    new Date('2026-03-23T00:00:45.000Z'),
  );
  await routeChannelMessage(
    retargetedState,
    channelId,
    {
      body: 'Second direct turn',
    },
    runtimeClient,
    new Date('2026-03-23T00:01:00.000Z'),
  );

  assert.equal(runtimeClient.createdSessions.length, 2);
  assert.deepEqual(runtimeClient.closedSessions, ['session-1']);
  assert.equal(runtimeClient.createdSessions[0]?.provider, 'claude');
  assert.equal(runtimeClient.createdSessions[1]?.provider, 'codex');
  assert.equal(runtimeClient.createdSessions[1]?.model, 'gpt-5.4');
  assert.equal(
    runtimeClient.sentMessages[1]?.input?.context?.metadata?.continuityMode,
    'full_transplant',
  );
  assert.match(
    runtimeClient.sentMessages[1]?.input?.instructions ?? '',
    /\[user:User\] First direct turn/u,
  );
});

test('direct message restarts the direct-recipient session when the instance target changes explicitly', async () => {
  let state = await new MemoryChatStore().read();
  const now = new Date('2026-03-23T00:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Companion',
      provider: 'codex',
      model: 'gpt-5.4',
      roles: ['companion'],
    },
    now,
  );
  const companionId = state.cats[0].id;
  state = createChannel(
    state,
    {
      title: 'Companion lane',
      topic: 'Explicit instance retargets should restart the direct-recipient session.',
      roomMode: 'direct_message',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ sessionId }) =>
    usage(`response from ${sessionId}`));

  const firstDispatch = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'First direct turn',
    },
    runtimeClient,
    now,
  );
  const retargetedState = setChannelCatExecutionTarget(
    firstDispatch.state,
    channelId,
    companionId,
    {
      instance: 'team-a',
    },
    new Date('2026-03-23T00:00:45.000Z'),
  );
  await routeChannelMessage(
    retargetedState,
    channelId,
    {
      body: 'Second direct turn',
    },
    runtimeClient,
    new Date('2026-03-23T00:01:00.000Z'),
  );

  assert.equal(runtimeClient.createdSessions.length, 2);
  assert.deepEqual(runtimeClient.closedSessions, ['session-1']);
  assert.equal(runtimeClient.createdSessions[0]?.instance ?? null, null);
  assert.equal(runtimeClient.createdSessions[1]?.instance, 'team-a');
  assert.equal(
    runtimeClient.sentMessages[1]?.input?.context?.metadata?.continuityMode,
    'full_transplant',
  );
  assert.match(
    runtimeClient.sentMessages[1]?.input?.instructions ?? '',
    /\[agent:Companion\] response from session-1/u,
  );
});

test('provider default chat sends raw user text without default instructions on a stable session', async () => {
  let state = await new MemoryChatStore().read();
  const now = new Date('2026-03-23T00:00:00.000Z');

  state = createChannel(
    state,
    {
      title: 'Default Thread',
      topic: 'Keep the runtime message raw.',
      skipBossCatGreeting: true,
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ sessionId }) =>
    usage(`response from ${sessionId}`));

  const firstDispatch = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Hi',
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    runtimeClient,
    now,
  );
  await routeChannelMessage(
    firstDispatch.state,
    channelId,
    {
      body: 'Follow-up',
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    runtimeClient,
    new Date('2026-03-23T00:01:00.000Z'),
  );

  assert.equal(runtimeClient.sentMessages.length, 2);
  assert.equal(runtimeClient.createdSessions.length, 1);
  assert.equal(runtimeClient.sentMessages[0]?.content, 'Hi');
  assert.equal(runtimeClient.sentMessages[0]?.input?.instructions, undefined);
  assert.equal(
    runtimeClient.createdSessions[0]?.context?.metadata?.continuityMode,
    'fresh_start',
  );
  assert.equal(
    runtimeClient.createdSessions[0]?.context?.metadata?.continuityDeliveryMode,
    'none',
  );
  assert.equal(
    runtimeClient.sentMessages[0]?.input?.context?.metadata?.continuityMode,
    'fresh_start',
  );
  assert.equal(
    runtimeClient.sentMessages[0]?.input?.context?.metadata?.continuityDeliveryMode,
    'none',
  );
  assert.equal(runtimeClient.sentMessages[1]?.content, 'Follow-up');
  assert.equal(runtimeClient.sentMessages[1]?.input?.instructions, undefined);
  assert.equal(
    runtimeClient.sentMessages[1]?.input?.context?.metadata?.continuityMode,
    'native_resume',
  );
  assert.equal(
    runtimeClient.sentMessages[1]?.input?.context?.metadata?.continuityDeliveryMode,
    'none',
  );
  const channel = buildChannelView(firstDispatch.state, channelId);
  assertProviderAgentDispatchMetadata(channel, 'Hi');
});

test('provider default chat honors pending runtime memory flush hooks before restarting the session', async () => {
  const store = new MemoryChatStore();
  let state = await store.read();
  const now = new Date('2026-03-23T00:00:00.000Z');

  state = createChannel(
    state,
    {
      title: 'Default thread',
      topic: 'Restart the default session after switching models.',
      skipBossCatGreeting: true,
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ sessionId }) => usage(`response from ${sessionId}`));
  runtimeClient.observeSession = async () => ({
    session: {
      context: {
        metadata: {
          channelId,
        },
      },
      inspection: {
        maintenance: {
          hooks: {
            preReset: {
              pending: [
                {
                  id: 'memory_flush',
                  status: 'pending',
                },
              ],
            },
            preCompaction: {
              pending: [],
            },
          },
        },
      },
    },
  });
  const flushedChannels = [];
  const memoryService = {
    async flushChannel(input) {
      flushedChannels.push({ ...input });
      return {
        scope: 'channel',
        subjectId: input.channelId,
        reason: input.reason ?? 'manual',
        generatedAt: (input.now ?? now).toISOString(),
        persistedCount: 1,
        persistedRecordIds: ['cats-memory-1'],
        removedRecordIds: [],
        payload: {
          version: 1,
          reason: input.reason ?? 'manual',
          generatedAt: (input.now ?? now).toISOString(),
          subject: {
            kind: 'channel',
            id: input.channelId,
          },
          replacementMode: 'subject_projection_replace',
          sourceScopeKeys: ['channel:working-memory'],
          persistedRecords: [
            {
              recordId: 'cats-memory-1',
              category: 'fact',
              originKind: 'channel_working_memory',
              promotionRule: 'channel_fact',
              visibility: 'channel_private',
              sourceRefs: [],
              sourceScopeKeys: ['channel:working-memory'],
              replacementGroup: `channel:${input.channelId}:fact:0`,
            },
          ],
          removedRecordIds: [],
        },
      };
    },
  };
  await store.write(state);

  const firstDispatch = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'First turn',
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    runtimeClient,
    now,
    { memoryService, chatStore: store },
  );
  await store.write(firstDispatch.state);
  await routeChannelMessage(
    firstDispatch.state,
    channelId,
    {
      body: 'Second turn',
      pendingProvider: 'gemini',
      pendingModel: 'gemini-default',
    },
    runtimeClient,
    new Date('2026-03-23T00:01:00.000Z'),
    { memoryService, chatStore: store },
  );

  assert.deepEqual(flushedChannels, [
    {
      channelId,
      reason: 'pre_reset',
      now: new Date('2026-03-23T00:01:00.000Z'),
    },
  ]);
  assert.deepEqual(runtimeClient.closedSessions, ['session-1']);
  const core = await store.readCore();
  assert.ok(
    core.activities.some((activity) =>
      activity.metadata?.category === 'memory_maintenance'
      && activity.metadata?.trigger === 'runtime_hook'
      && activity.metadata?.status === 'executed'
      && activity.metadata?.phase === 'pre_reset'
      && activity.metadata?.channelId === channelId),
  );
});

test('provider default chat retransplants continuity after stale-session recovery creates a new runtime session', async () => {
  let state = await new MemoryChatStore().read();
  const now = new Date('2026-03-23T00:00:00.000Z');

  state = createChannel(
    state,
    {
      title: 'Default Thread',
      topic: 'Recover stale sessions without losing continuity.',
      skipBossCatGreeting: true,
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ sessionId }) => {
    if (sessionId === 'session-stale') {
      throw new Error('Session not found: session-stale');
    }

    return usage(`response from ${sessionId}`);
  });

  const firstDispatch = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'First turn',
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    runtimeClient,
    now,
  );

  const staleState = setChannelOrchestratorLease(
    firstDispatch.state,
    channelId,
    {
      sessionId: 'session-stale',
      status: 'ready',
      lastError: null,
    },
    new Date('2026-03-23T00:00:30.000Z'),
  );

  const recoveredDispatch = await routeChannelMessage(
    staleState,
    channelId,
    {
      body: 'Recover the conversation',
      pendingProvider: 'claude',
      pendingModel: 'claude-default',
    },
    runtimeClient,
    new Date('2026-03-23T00:01:00.000Z'),
    {
      runtimeRecovery: {
        staleSessionRetryLimit: 1,
      },
    },
  );
  const channel = buildChannelView(recoveredDispatch.state, channelId);
  const defaultChatReplies = channel.messages.filter(
    (message) => message.metadata?.targetKind === 'orchestrator' && message.senderName === 'Orchestrator',
  );

  assert.deepEqual(
    runtimeClient.sentMessages.map((message) => message.sessionId),
    ['session-1', 'session-stale', 'session-2'],
  );
  assert.deepEqual(runtimeClient.closedSessions, ['session-stale']);
  assert.equal(runtimeClient.createdSessions.length, 2);
  assert.equal(runtimeClient.createdSessions[1]?.instructions, undefined);
  assert.equal(
    runtimeClient.createdSessions[1]?.context?.metadata?.continuityMode,
    'full_transplant',
  );
  assert.equal(
    runtimeClient.createdSessions[1]?.context?.metadata?.continuityDeliveryMode,
    'turn_instructions',
  );
  assert.equal(
    runtimeClient.sentMessages[2]?.input?.context?.metadata?.continuityMode,
    'full_transplant',
  );
  assert.equal(
    runtimeClient.sentMessages[2]?.input?.context?.metadata?.continuityDeliveryMode,
    'turn_instructions',
  );
  assert.match(
    runtimeClient.sentMessages[2]?.input?.instructions ?? '',
    /Same conversation continuity transcript:/u,
  );
  assert.match(
    runtimeClient.sentMessages[2]?.input?.instructions ?? '',
    /\[user:User\] First turn/u,
  );
  assert.match(
    runtimeClient.sentMessages[2]?.input?.instructions ?? '',
    /\[agent:Orchestrator\] response from session-1/u,
  );
  assert.equal(defaultChatReplies.at(-1)?.executionProvider, 'claude');
  assert.equal(defaultChatReplies.at(-1)?.executionModel, 'claude-default');
});

test('parallel member channels inherit default continuity transplant rules on retarget', async () => {
  let state = await new MemoryChatStore().read();
  const now = new Date('2026-03-23T00:00:00.000Z');

  state = createParallelChatGroup(
    state,
    {
      title: 'Peer Review',
      targets: [
        { provider: 'claude', instance: 'native', model: 'claude-default', modelSelection: null },
        { provider: 'codex', instance: 'native', model: 'gpt-5.4', modelSelection: null },
      ],
    },
    now,
  );

  const [activeChannelId, passiveChannelId] = state.parallelChatGroups[0]?.memberChannelIds ?? [];
  assert.ok(activeChannelId);
  assert.ok(passiveChannelId);

  const runtimeClient = createRuntimeStub(async ({ sessionId }) =>
    usage(`response from ${sessionId}`));

  const firstDispatch = await routeChannelMessage(
    state,
    activeChannelId,
    {
      body: 'First turn',
      pendingProvider: 'claude',
      pendingInstance: 'native',
      pendingModel: 'claude-default',
    },
    runtimeClient,
    now,
  );
  const secondDispatch = await routeChannelMessage(
    firstDispatch.state,
    activeChannelId,
    {
      body: 'Switch turn',
      pendingProvider: 'gemini',
      pendingInstance: 'native',
      pendingModel: 'gemini-default',
    },
    runtimeClient,
    new Date('2026-03-23T00:01:00.000Z'),
  );
  const activeChannel = buildChannelView(secondDispatch.state, activeChannelId);
  const passiveChannel = buildChannelView(secondDispatch.state, passiveChannelId);

  assert.equal(runtimeClient.createdSessions.length, 2);
  assert.equal(runtimeClient.createdSessions[0]?.provider, 'claude');
  assert.equal(runtimeClient.createdSessions[1]?.provider, 'gemini');
  assert.deepEqual(runtimeClient.closedSessions, ['session-1']);
  assert.match(
    runtimeClient.sentMessages[1]?.input?.instructions ?? '',
    /Same conversation continuity transcript:/u,
  );
  assert.match(
    runtimeClient.sentMessages[1]?.input?.instructions ?? '',
    /\[user:User\] First turn/u,
  );
  assert.equal(activeChannel.pendingProvider, 'gemini');
  assert.equal(passiveChannel.pendingProvider, 'codex');
  assert.equal(passiveChannel.orchestratorLease.sessionId, null);
  assertProviderAgentDispatchMetadata(activeChannel, 'Switch turn');
});

test(
  'participant chat no-mention turns route to orchestrator despite default recipient',
  async () => {
    const { state, channelId, agent1Id } = await createChannelState();
    const runtimeClient = createRuntimeStub(async () =>
      usage('Boss handled the default room turn.'),
    );

    const dispatched = await routeChannelMessage(
      state,
      channelId,
      { body: 'Decide who should take this.' },
      runtimeClient,
      new Date('2026-03-21T00:00:00.000Z'),
    );
    const channel = buildChannelView(dispatched.state, channelId);
    const routedReply = channel.messages.find(
      (message) => message.metadata?.targetKind === 'orchestrator',
    );

    assert.equal(channel.roomRouting?.defaultRecipientId, agent1Id);
    assert.equal(
      channel.roomRouting?.lastOutcome?.resolution.defaultTargetReason,
      'chat_channel_default',
    );
    assert.equal(
      channel.roomRouting?.lastOutcome?.resolution.defaultTarget?.participantKind,
      'orchestrator',
    );
    assert.equal(channel.roomRouting?.lastOutcome?.dispatches.length, 1);
    assert.equal(runtimeClient.createdSessions.length, 1);
    assert.equal(
      runtimeClient.createdSessions[0]?.context?.metadata?.targetKind,
      'orchestrator',
    );
    assert.equal(
      runtimeClient.createdSessions[0]?.context?.metadata?.targetId,
      'orchestrator',
    );
    assert.equal(runtimeClient.sentMessages.length, 1);
    assert.equal(
      runtimeClient.sentMessages[0]?.input?.context?.metadata?.targetKind,
      'orchestrator',
    );
    assert.equal(
      runtimeClient.sentMessages[0]?.input?.context?.metadata?.targetId,
      'orchestrator',
    );
    assert.equal(
      runtimeClient.sentMessages.some(
        (message) => message.input?.context?.metadata?.targetId === agent1Id,
      ),
      false,
    );
    assert.ok(routedReply);
  },
);

test(
  'direct message no-mention turns route to default recipient instead of orchestrator',
  async () => {
    let state = await new MemoryChatStore().read();
    const now = new Date('2026-03-21T00:00:00.000Z');

    state = createCat(
      state,
      {
        name: 'Smelly',
        provider: 'claude',
        roles: ['boss'],
      },
      now,
    );
    state.bossCatId = state.cats[0].id;

    state = createCat(
      state,
      {
        name: 'Companion',
        provider: 'claude',
        roles: ['companion'],
      },
      now,
    );
    const companionId = state.cats[0].id;

    state = createChannel(
      state,
      {
        title: 'Companion lane',
        topic: 'No-mention turns should stay on the direct lane.',
        roomMode: 'direct_message',
        participantCatIds: [companionId],
        defaultRecipientId: companionId,
        skipBossCatGreeting: true,
      },
      now,
    );

    const channelId = state.selectedChannelId;
    const runtimeClient = createRuntimeStub(async ({ content }) => {
      if (content.includes('You are Companion')) {
        return usage('Companion handled the direct turn.');
      }
      throw new Error(`Unexpected prompt:\n${content}`);
    });

    const dispatched = await routeChannelMessage(
      state,
      channelId,
      { body: 'Handle this directly.' },
      runtimeClient,
      now,
    );
    const channel = buildChannelView(dispatched.state, channelId);

    assert.equal(channel.roomRouting?.defaultRecipientId, companionId);
    assert.equal(
      channel.roomRouting?.lastOutcome?.resolution.defaultTargetReason,
      'direct_message_recipient',
    );
    assert.equal(
      channel.roomRouting?.lastOutcome?.resolution.defaultTarget?.participantKind,
      'cat',
    );
    assert.equal(
      channel.roomRouting?.lastOutcome?.resolution.defaultTarget?.participantId,
      companionId,
    );
    assert.equal(runtimeClient.createdSessions.length, 1);
    assert.equal(runtimeClient.createdSessions[0]?.context?.metadata?.targetKind, 'cat');
    assert.equal(runtimeClient.createdSessions[0]?.context?.metadata?.targetId, companionId);
    assert.equal(runtimeClient.sentMessages.length, 1);
    assert.equal(runtimeClient.sentMessages[0]?.input?.context?.metadata?.targetKind, 'cat');
    assert.equal(runtimeClient.sentMessages[0]?.input?.context?.metadata?.targetId, companionId);
    assert.equal(
      runtimeClient.sentMessages.some(
        (message) => message.input?.context?.metadata?.targetId === 'orchestrator',
      ),
      false,
    );
    assert.equal(channel.orchestratorLease.sessionId, null);
    assert.equal(channel.messages.at(-1)?.senderName, 'Companion');
  },
);

test('participant chat routing continues across agent mentions and auto-wakes targeted participants', async () => {
  const { state, channelId } = await createChannelState();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return usage('I need @Agent-2 to implement the change.');
    }
    if (content.includes('You are Agent-2')) {
      return usage('I implemented the change.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: '@Agent-1 Kick off the work.' },
    runtimeClient,
    new Date('2026-03-21T00:00:00.000Z'),
  );
  const channel = buildChannelView(dispatched.state, channelId);
  const replies = channel.messages.filter(
    (message) => message.senderKind === 'orchestrator' || message.senderKind === 'agent',
  );

  assert.deepEqual(
    replies.map((message) => message.senderName),
    ['Agent-1', 'Agent-2'],
  );
  assert.equal(runtimeClient.createdSessions.length, 2);
  assert.equal(channel.roomRouting?.lastOutcome?.dispatches.length, 2);
  assert.equal(channel.roomRouting?.lastOutcome?.continuationCount, 1);
  assert.equal(channel.roomRouting?.lastOutcome?.guard, null);
  assert.deepEqual(
    channel.roomRouting?.wakeHistory.map((wake) => wake.reason),
    ['workflow_continuation', 'explicit_mention'],
  );
  assert.deepEqual(
    channel.roomRouting?.wakeHistory.map((wake) => wake.status),
    ['completed', 'completed'],
  );
  assert.equal(
    channel.roomRouting?.lastOutcome?.resolution.defaultTargetReason,
    'chat_channel_default',
  );
  assert.ok(
    channel.roomRouting?.lastOutcome?.checkpoints.some(
      (checkpoint) => checkpoint.kind === 'continuation',
    ),
  );
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.dispatchCount, 2);
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.continuationCount, 1);
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.workflowShape, 'sequential');
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.stageId, 'turn_completed');
  assertProviderAgentDispatchMetadata(channel, '@Agent-1 Kick off the work.');
  assert.ok(
    channel.roomRouting?.workflow.turnHistory[0]?.events.some(
      (event) => event.kind === 'target_running',
    ),
  );
  assert.ok(
    channel.roomRouting?.workflow.turnHistory[0]?.events.some(
      (event) => event.kind === 'checkpoint'
        && event.metadata.checkpointKind === 'continuation',
    ),
  );
  assert.ok(
    channel.roomRouting?.workflow.turnHistory[0]?.targetStatuses.some(
      (target) =>
        target.handoffReason === 'workflow_continuation'
        && target.branchStrategy === 'transplant_context',
    ),
  );
  assert.equal(
    channel.roomRouting?.workflow.turnHistory[0]?.targetStatuses.find(
      (target) => target.participant.participantName === 'Agent-2',
    )?.sourceMessageId,
    replies[0]?.id,
  );
});

test('structured workflow recommendations drive continuation from an explicit participant turn', async () => {
  const { state, channelId } = await createChannelState();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return usage([
        'Passing implementation to the next specialist.',
        '```json',
        JSON.stringify({
          workflowRecommendation: {
            workflowShape: 'sequential',
            candidateTargetNames: ['Agent-2'],
            branchStrategy: 'transplant_context',
            rationale: 'Agent-2 should implement the change.',
          },
        }),
        '```',
      ].join('\n'));
    }
    if (content.includes('You are Agent-2')) {
      return usage('I implemented the change.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: '@Agent-1 Kick off the work.' },
    runtimeClient,
    new Date('2026-03-21T00:00:00.000Z'),
  );
  const channel = buildChannelView(dispatched.state, channelId);
  const replies = channel.messages.filter(
    (message) => message.senderKind === 'orchestrator' || message.senderKind === 'agent',
  );
  const continuationEvent = channel.roomRouting?.workflow.turnHistory[0]?.events.find(
    (event) => event.kind === 'checkpoint' && event.metadata.checkpointKind === 'continuation',
  );

  assert.deepEqual(
    replies.map((message) => message.senderName),
    ['Agent-1', 'Agent-2'],
  );
  assert.equal(replies[0]?.body, 'Passing implementation to the next specialist.');
  assert.equal(
    replies[0]?.metadata.workflowRecommendation?.workflowShape,
    'sequential',
  );
  assert.equal(channel.roomRouting?.lastOutcome?.continuationCount, 1);
  assert.equal(continuationEvent?.metadata.continuationSource, 'workflow_recommendation');
  assert.equal(
    continuationEvent?.metadata.workflowRecommendation?.candidateTargets?.[0]?.participantName,
    'Agent-2',
  );
  assert.ok(
    channel.roomRouting?.workflow.turnHistory[0]?.targetStatuses.some(
      (target) =>
        target.participant.participantName === 'Agent-2'
        && target.branchStrategy === 'transplant_context',
    ),
  );
});

test('segmented replies keep final-only completion semantics while workflow recommendations use the full turn', async () => {
  const { state, channelId } = await createChannelState();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return {
        segments: [
          {
            kind: 'text',
            text: [
              'Passing implementation to the next specialist.',
              '```json',
              JSON.stringify({
                workflowRecommendation: {
                  workflowShape: 'sequential',
                  candidateTargetNames: ['Agent-2'],
                  branchStrategy: 'transplant_context',
                  rationale: 'Agent-2 should implement the change.',
                },
              }),
              '```',
            ].join('\n'),
            toolName: null,
            toolId: null,
          },
          {
            kind: 'tool_use',
            text: '',
            toolName: 'search',
            toolId: 'tool-search',
          },
          {
            kind: 'text',
            text: 'I already gathered notes for Agent-2.',
            toolName: null,
            toolId: null,
          },
        ],
        inputTokens: 11,
        outputTokens: 7,
        tokensUsed: 18,
      };
    }
    if (content.includes('You are Agent-2')) {
      return usage('I implemented the change.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: '@Agent-1 Kick off the work.' },
    runtimeClient,
    new Date('2026-03-21T00:00:00.000Z'),
  );
  const channel = buildChannelView(dispatched.state, channelId);
  const agentOneReplies = channel.messages.filter((message) => message.senderName === 'Agent-1');

  assert.deepEqual(
    agentOneReplies.map((message) => message.body),
    [
      'Passing implementation to the next specialist.',
      'I already gathered notes for Agent-2.',
    ],
  );
  assert.equal(agentOneReplies[0]?.metadata.event, 'assistant_turn_segment');
  assert.equal(agentOneReplies[0]?.metadata.terminal, false);
  assert.equal(agentOneReplies[1]?.metadata.event, 'assistant_turn_segment');
  assert.equal(agentOneReplies[1]?.metadata.terminal, true);
  assert.equal(
    agentOneReplies[1]?.metadata.workflowRecommendation?.workflowShape,
    'sequential',
  );
  assert.match(
    runtimeClient.sentMessages[1]?.content ?? '',
    /Latest routed handoff:\nPassing implementation to the next specialist\.I already gathered notes for Agent-2\./u,
  );
  assert.match(
    runtimeClient.sentMessages[1]?.content ?? '',
    /\[agent:Agent-1\] Passing implementation to the next specialist\./u,
  );
  assert.match(
    runtimeClient.sentMessages[1]?.content ?? '',
    /\[agent:Agent-1\] I already gathered notes for Agent-2\./u,
  );
  assert.ok(
    channel.roomRouting?.workflow.turnHistory[0]?.targetStatuses.some(
      (target) =>
        target.participant.participantName === 'Agent-2'
        && target.branchStrategy === 'transplant_context',
    ),
  );
});

test('explicit @mentions stay authoritative over structured workflow recommendations', async () => {
  const { state, channelId } = await createChannelState();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return usage([
        '@Agent-2 take this next.',
        '```json',
        JSON.stringify({
          workflowRecommendation: {
            workflowShape: 'sequential',
            candidateTargetNames: ['Agent-1'],
            branchStrategy: 'fork_if_possible',
            rationale: 'Conflicting recommendation should not override the explicit handoff.',
          },
        }),
        '```',
      ].join('\n'));
    }
    if (content.includes('You are Agent-2')) {
      return usage('Handled after the explicit handoff.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: '@Agent-1 Kick off the work.' },
    runtimeClient,
    new Date('2026-03-21T00:00:00.000Z'),
  );
  const channel = buildChannelView(dispatched.state, channelId);
  const replies = channel.messages.filter(
    (message) => message.senderKind === 'orchestrator' || message.senderKind === 'agent',
  );
  const continuationEvent = channel.roomRouting?.workflow.turnHistory[0]?.events.find(
    (event) => event.kind === 'checkpoint' && event.metadata.checkpointKind === 'continuation',
  );
  const agent2Target = channel.roomRouting?.workflow.turnHistory[0]?.targetStatuses.find(
    (target) => target.participant.participantName === 'Agent-2',
  );

  assert.deepEqual(
    replies.map((message) => message.senderName),
    ['Agent-1', 'Agent-2'],
  );
  assert.equal(replies[0]?.body, '@Agent-2 take this next.');
  assert.equal(continuationEvent?.metadata.continuationSource, 'explicit_mentions');
  assert.equal(
    continuationEvent?.targets[0]?.participantName,
    'Agent-2',
  );
  assert.equal(agent2Target?.branchStrategy, 'transplant_context');
});

test('direct message routes unmentioned turns to the direct recipient without waking Boss Cat first', async () => {
  const store = new MemoryChatStore();
  let state = await store.read();
  const now = new Date('2026-03-21T00:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Smelly',
      provider: 'claude',
      roles: ['boss'],
    },
    now,
  );
  state.bossCatId = state.cats[0].id;

  state = createCat(
    state,
    {
      name: 'Companion',
      provider: 'claude',
      roles: ['companion'],
    },
    now,
  );
  const companionId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Companion lane',
      topic: 'Talk directly to Companion.',
      roomMode: 'direct_message',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Companion')) {
      return usage('Companion is already on it.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: 'Handle this directly.' },
    runtimeClient,
    now,
  );
  const channel = buildChannelView(dispatched.state, channelId);

  assert.equal(runtimeClient.createdSessions.length, 1);
  assert.equal(
    runtimeClient.createdSessions[0]?.context?.metadata?.conversationId,
    buildChatConversationId(channelId),
  );
  assert.equal(
    runtimeClient.createdSessions[0]?.context?.metadata?.containerId,
    CHAT_ROOT_CONTAINER_ID,
  );
  assert.equal(
    runtimeClient.createdSessions[0]?.context?.metadata?.transportBindingId,
    buildDirectLaneTransportBindingId(channelId),
  );
  assert.equal(
    runtimeClient.sentMessages[0]?.input?.context?.metadata?.conversationId,
    buildChatConversationId(channelId),
  );
  assert.equal(
    runtimeClient.sentMessages[0]?.input?.context?.metadata?.containerId,
    CHAT_ROOT_CONTAINER_ID,
  );
  assert.equal(
    runtimeClient.sentMessages[0]?.input?.context?.metadata?.transportBindingId,
    buildDirectLaneTransportBindingId(channelId),
  );
  const sessionStarted = channel.messages.find((message) =>
    message.metadata?.event === 'session_started'
    && message.metadata?.sessionId === 'session-1');
  assert.ok(sessionStarted);
  assert.equal(
    sessionStarted.metadata?.conversationId,
    buildChatConversationId(channelId),
  );
  assert.equal(
    sessionStarted.metadata?.containerId,
    CHAT_ROOT_CONTAINER_ID,
  );
  assert.equal(
    sessionStarted.metadata?.transportBindingId,
    buildDirectLaneTransportBindingId(channelId),
  );
  const assistantReply = channel.messages.find((message) =>
    message.senderKind === 'agent'
    && message.metadata?.event === 'assistant_turn_segment');
  assert.equal(
    assistantReply?.metadata?.conversationId,
    buildChatConversationId(channelId),
  );
  assert.equal(
    assistantReply?.metadata?.containerId,
    CHAT_ROOT_CONTAINER_ID,
  );
  assert.equal(
    assistantReply?.metadata?.transportBindingId,
    buildDirectLaneTransportBindingId(channelId),
  );
  assert.equal(runtimeClient.sentMessages.some((message) => message.content.includes('You are Smelly')), false);
  assert.equal(channel.orchestratorLease.sessionId, null);
  assert.equal(channel.assignedCats[0]?.execution.lease.sessionId, 'session-1');
  assert.equal(channel.roomRouting?.lastOutcome?.resolution.selectionKind, 'default_target');
  assert.equal(channel.roomRouting?.lastOutcome?.resolution.defaultTargetReason, 'direct_message_recipient');
  assert.equal(channel.roomRouting?.wakeHistory[0]?.reason, 'room_default');
  assert.equal(channel.roomRouting?.wakeHistory[0]?.participant.participantId, companionId);
  assert.equal(channel.messages.at(-1)?.senderName, 'Companion');
  assert.equal(channel.status, 'active');
  assertProviderAgentDispatchMetadata(channel, 'Handle this directly.');
});

test('direct message records targetStateId on real session_started messages', async () => {
  const store = new MemoryChatStore();
  let state = await store.read();
  const now = new Date('2026-03-21T00:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Companion',
      provider: 'claude',
      roles: ['companion'],
    },
    now,
  );
  const companionId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Companion lane',
      topic: 'Track targetStateId on real session_started messages.',
      roomMode: 'direct_message',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async () => usage('Companion session started normally.'));

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: 'Start the lane and respond.' },
    runtimeClient,
    now,
  );
  const channel = requireChannel(dispatched.state, channelId);
  const completedTurn = channel.roomRouting.workflow.turnHistory[0];

  assert.ok(completedTurn);
  assert.equal(completedTurn?.targetStatuses.length, 1);
  const targetStateId = completedTurn?.targetStatuses[0]?.id;
  assert.equal(typeof targetStateId, 'string');
  const laneId = buildChatLaneId(completedTurn.id, targetStateId, companionId);

  const sessionStarted = channel.messages.find((message) =>
    message.metadata?.event === 'session_started'
    && message.metadata?.sessionId === 'session-1');
  const assistantReply = channel.messages.find((message) =>
    message.metadata?.event === 'assistant_turn_segment'
    && message.metadata?.sessionId === 'session-1');
  assert.ok(sessionStarted);
  assert.ok(assistantReply);
  assert.equal(sessionStarted?.metadata?.targetStateId, targetStateId);
  assert.equal(sessionStarted?.metadata?.laneId, laneId);
  assert.equal(assistantReply?.metadata?.laneId, laneId);
  assert.equal(dispatched.results[0]?.laneId, laneId);
});

test('direct message updates the reused lease laneId when the same runtime session serves a new turn', async () => {
  const store = new MemoryChatStore();
  let state = await store.read();
  const startedAt = new Date('2026-03-21T00:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Companion',
      provider: 'claude',
      roles: ['companion'],
    },
    startedAt,
  );
  const companionId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Companion lane',
      topic: 'Reuse the same runtime session across turns but keep the lease lane current.',
      roomMode: 'direct_message',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    startedAt,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ sessionId }) =>
    usage(`Companion answered on ${sessionId}.`));

  const firstDispatch = await routeChannelMessage(
    state,
    channelId,
    { body: 'Answer the first turn.' },
    runtimeClient,
    startedAt,
  );
  const firstChannel = requireChannel(firstDispatch.state, channelId);
  const firstUserMessage = [...firstChannel.messages].reverse().find((message) =>
    message.senderKind === 'user' && message.body === 'Answer the first turn.');
  const firstTurn = firstChannel.roomRouting.workflow.turnHistory.find((turn) =>
    turn.sourceMessageId === firstUserMessage?.id);
  assert.ok(firstTurn);
  const firstTargetStateId = firstTurn?.targetStatuses[0]?.id;
  assert.equal(typeof firstTargetStateId, 'string');
  const firstLaneId = buildChatLaneId(firstTurn.id, firstTargetStateId, companionId);
  assert.equal(firstChannel.catAssignments[0]?.execution.lease.laneId, firstLaneId);

  const secondDispatch = await routeChannelMessage(
    firstDispatch.state,
    channelId,
    { body: 'Answer the second turn on the same session.' },
    runtimeClient,
    new Date('2026-03-21T00:01:00.000Z'),
  );
  const secondChannel = requireChannel(secondDispatch.state, channelId);
  const secondUserMessage = [...secondChannel.messages].reverse().find((message) =>
    message.senderKind === 'user' && message.body === 'Answer the second turn on the same session.');
  const secondTurn = secondChannel.roomRouting.workflow.turnHistory.find((turn) =>
    turn.sourceMessageId === secondUserMessage?.id);
  assert.ok(secondTurn);
  const secondTargetStateId = secondTurn?.targetStatuses[0]?.id;
  assert.equal(typeof secondTargetStateId, 'string');
  const secondLaneId = buildChatLaneId(secondTurn.id, secondTargetStateId, companionId);

  assert.equal(runtimeClient.createdSessions.length, 1);
  assert.deepEqual(
    runtimeClient.sentMessages.map((message) => message.sessionId),
    ['session-1', 'session-1'],
  );
  assert.equal(secondChannel.catAssignments[0]?.execution.lease.sessionId, 'session-1');
  assert.equal(secondChannel.catAssignments[0]?.execution.lease.laneId, secondLaneId);
  assert.notEqual(secondLaneId, firstLaneId);
});

test('ensureTargetSession reuses a lane-attached lease even when the routing target lost its sessionId', async () => {
  const store = new MemoryChatStore();
  let state = await store.read();
  const now = new Date('2026-03-21T00:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Companion',
      provider: 'claude',
      roles: ['companion'],
    },
    now,
  );
  const companionId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Companion lane',
      topic: 'Reuse the lane attachment even if the routing target session id drifted out.',
      roomMode: 'direct_message',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const laneId = 'lane-turn-drifted-target-companion';
  state = setChannelCatLease(
    state,
    channelId,
    companionId,
    {
      sessionId: 'session-existing',
      status: 'ready',
      cwd: path.join(tmpdir(), '.cats', 'runtime', 'sessions', 'session-existing'),
      lastError: null,
      laneId,
      provider: 'claude',
      model: 'claude-sonnet',
      startedAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
    },
    now,
  );

  const runtimeClient = createRuntimeStub(async () => usage('This should not run.'));
  const ensured = await ensureTargetSession(
    state,
    channelId,
    {
      participantKind: 'cat',
      participantId: companionId,
      participantName: 'Companion',
      laneId,
      sessionId: null,
    },
    runtimeClient,
    now,
  );

  assert.equal(ensured.error, null);
  assert.equal(ensured.target.sessionId, 'session-existing');
  assert.equal(ensured.target.laneId, laneId);
  assert.equal(runtimeClient.createdSessions.length, 0);
  assert.equal(
    requireChannel(ensured.state, channelId).catAssignments[0]?.execution.lease.sessionId,
    'session-existing',
  );
});

test('ensureTargetSession only resolves channel task execution context once across a stale-session retry', async () => {
  const store = new MemoryChatStore();
  let state = await store.read();
  const now = new Date('2026-03-21T00:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Companion',
      provider: 'claude',
      roles: ['companion'],
    },
    now,
  );
  const companionId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Companion retry lane',
      topic: 'Retry stale sessions without rereading core task execution context.',
      roomMode: 'direct_message',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const laneId = 'lane-turn-retry-target-companion';
  state = setChannelCatLease(
    state,
    channelId,
    companionId,
    {
      sessionId: 'session-stale',
      status: 'error',
      cwd: path.join(tmpdir(), '.cats', 'runtime', 'sessions', 'session-stale'),
      lastError: 'Runtime session is closed.',
      laneId,
      provider: 'claude',
      model: 'claude-sonnet',
      startedAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
    },
    now,
  );

  let coreReadCount = 0;
  const taskExecutionStore = {
    async readCore() {
      coreReadCount += 1;
      return { tasks: [] };
    },
  };
  const runtimeClient = createRuntimeStub(async () => usage('unused'));

  const ensured = await ensureTargetSession(
    state,
    channelId,
    {
      participantKind: 'cat',
      participantId: companionId,
      participantName: 'Companion',
      laneId,
      sessionId: 'session-stale',
    },
    runtimeClient,
    now,
    {
      chatStore: taskExecutionStore,
      observeRuntimeForRevive: true,
    },
  );

  assert.equal(ensured.error, null);
  assert.equal(coreReadCount, 1);
  assert.equal(runtimeClient.createdSessions.length, 1);
  assert.notEqual(ensured.target.sessionId, 'session-stale');
});

test('direct message records targetStateId on session_start_failed messages', async () => {
  const store = new MemoryChatStore();
  let state = await store.read();
  const now = new Date('2026-03-21T00:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Companion',
      provider: 'claude',
      roles: ['companion'],
    },
    now,
  );
  const companionId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Companion lane',
      topic: 'Track targetStateId on session_start_failed messages.',
      roomMode: 'direct_message',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async () => usage('unused'));
  runtimeClient.createSession = async () => {
    throw new Error('Runtime session boot failed.');
  };

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: 'Try to start the lane.' },
    runtimeClient,
    now,
  );
  const channel = requireChannel(dispatched.state, channelId);
  const failedTurn = channel.roomRouting.workflow.turnHistory[0];

  assert.ok(failedTurn);
  assert.equal(failedTurn?.targetStatuses.length, 1);
  const targetStateId = failedTurn?.targetStatuses[0]?.id;
  assert.equal(typeof targetStateId, 'string');
  const laneId = buildChatLaneId(failedTurn.id, targetStateId, companionId);

  const sessionStartFailed = channel.messages.find((message) =>
    message.metadata?.event === 'session_start_failed');
  assert.ok(sessionStartFailed);
  assert.equal(sessionStartFailed?.metadata?.containerId, CHAT_ROOT_CONTAINER_ID);
  assert.equal(
    sessionStartFailed?.metadata?.conversationId,
    buildChatConversationId(channelId),
  );
  assert.equal(
    sessionStartFailed?.metadata?.transportBindingId,
    buildDirectLaneTransportBindingId(channelId),
  );
  assert.equal(sessionStartFailed?.metadata?.targetStateId, targetStateId);
  assert.equal(sessionStartFailed?.metadata?.laneId, laneId);
});

test('ensureTargetSession preserves sanitized participant execution targets when workspace sync fails', async () => {
  const store = new MemoryChatStore();
  let state = await store.read();
  const now = new Date('2026-03-21T00:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Companion',
      provider: 'claude',
      roles: ['companion'],
    },
    now,
  );
  const companionId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Companion lane',
      topic: 'Preserve sanitized execution targets when workspace sync fails.',
      roomMode: 'direct_message',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeDataDir = path.join(tmpdir(), `cats-runtime-data-${Date.now()}`);
  const attachmentSourcePath = path.join(runtimeDataDir, 'channels', channelId, '.cats-attachments');
  await mkdir(attachmentSourcePath, { recursive: true });
  await writeFile(path.join(attachmentSourcePath, 'note.txt'), 'attachment seed');

  const invalidWorkspacePath = path.join(tmpdir(), `cats-invalid-workspace-${Date.now()}.txt`);
  await writeFile(invalidWorkspacePath, 'not a directory');

  const runtimeClient = createRuntimeStub(async () => usage('unused'));
  runtimeClient.createSession = async (input) => {
    const sessionId = `session-${runtimeClient.createdSessions.length + 1}`;
    runtimeClient.createdSessions.push({ ...input, id: sessionId });
    return {
      id: sessionId,
      provider: input.provider,
      model: 'claude-runtime-sanitized',
      modelSelection: {
        entryMode: 'explicit',
        entryId: 'claude-runtime-sanitized',
      },
      status: 'ready',
      cwd: invalidWorkspacePath,
    };
  };

  const ensured = await ensureTargetSession(
    state,
    channelId,
    {
      participantKind: 'cat',
      participantId: companionId,
      participantName: 'Companion',
      laneId: 'lane-turn-sync-failure',
      sessionId: null,
    },
    runtimeClient,
    now,
    {
      runtimeDataDir,
    },
  );

  assert.ok(ensured.error);
  assert.equal(
    requireChannel(ensured.state, channelId).catAssignments[0]?.execution.target.model,
    'claude-runtime-sanitized',
  );
  assert.deepEqual(
    requireChannel(ensured.state, channelId).catAssignments[0]?.execution.modelSelection,
    {
      entryMode: 'explicit',
      entryId: 'claude-runtime-sanitized',
    },
  );
});

test('direct message treats direct-recipient mentions as plain text and stays on the lane', async () => {
  const store = new MemoryChatStore();
  let state = await store.read();
  const now = new Date('2026-03-21T00:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Smelly',
      provider: 'claude',
      roles: ['boss'],
    },
    now,
  );
  state.bossCatId = state.cats[0].id;

  state = createCat(
    state,
    {
      name: 'Companion',
      provider: 'claude',
      roles: ['companion'],
    },
    now,
  );
  const companionId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Companion lane',
      topic: 'Treat direct-recipient mentions as plain text inside the lane.',
      roomMode: 'direct_message',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Companion')) {
      return usage('Companion stayed on the direct lane.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: '@Companion 我想你' },
    runtimeClient,
    now,
  );
  const channel = buildChannelView(dispatched.state, channelId);

  assert.equal(runtimeClient.createdSessions.length, 1);
  assert.equal(runtimeClient.sentMessages.length, 1);
  assert.equal(channel.roomRouting?.lastOutcome?.resolution.selectionKind, 'default_target');
  assert.deepEqual(channel.roomRouting?.lastOutcome?.unresolvedMentions, []);
  assert.equal(
    channel.messages.some((message) => /Unresolved mentions:|No valid room targets matched/i.test(message.body)),
    false,
  );
  assert.equal(channel.messages.at(-1)?.senderName, 'Companion');
});

test('direct message blocks explicit Boss Cat mentions instead of routing out of lane', async () => {
  const store = new MemoryChatStore();
  let state = await store.read();
  const now = new Date('2026-03-21T00:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Smelly',
      provider: 'claude',
      roles: ['boss'],
    },
    now,
  );
  state.bossCatId = state.cats[0].id;

  state = createCat(
    state,
    {
      name: 'Companion',
      provider: 'claude',
      roles: ['companion'],
    },
    now,
  );
  const companionId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Companion lane',
      topic: 'Stay on the direct lane even when Boss Cat is mentioned.',
      roomMode: 'direct_message',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: '@Smelly please take this over.' },
    runtimeClient,
    now,
  );
  const channel = buildChannelView(dispatched.state, channelId);

  assert.equal(runtimeClient.createdSessions.length, 0);
  assert.equal(runtimeClient.sentMessages.length, 0);
  assert.equal(channel.orchestratorLease.sessionId, null);
  assert.equal(channel.roomRouting?.lastOutcome?.resolution.selectionKind, 'blocked');
  assert.equal(channel.roomRouting?.lastOutcome?.resolution.blockedReason, 'no_valid_targets');
  assert.deepEqual(channel.roomRouting?.lastOutcome?.unresolvedMentions, ['Smelly']);
  assert.match(channel.messages.at(-2)?.body ?? '', /Unresolved mentions: @Smelly/u);
  assert.match(channel.messages.at(-1)?.body ?? '', /No valid room targets matched the explicit mentions/i);
});

test('direct message ignores workflow recommendations that target Boss Cat', async () => {
  const store = new MemoryChatStore();
  let state = await store.read();
  const now = new Date('2026-03-21T00:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Smelly',
      provider: 'claude',
      roles: ['boss'],
    },
    now,
  );
  state.bossCatId = state.cats[0].id;

  state = createCat(
    state,
    {
      name: 'Companion',
      provider: 'claude',
      roles: ['companion'],
    },
    now,
  );
  const companionId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Companion lane',
      topic: 'Structured handoffs must not escape the direct lane.',
      roomMode: 'direct_message',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Companion')) {
      return usage([
        'I think Boss Cat should take a look.',
        '```json',
        JSON.stringify({
          workflowRecommendation: {
            workflowShape: 'sequential',
            candidateTargetNames: ['Smelly'],
            branchStrategy: 'transplant_context',
            rationale: 'Escalate to Boss Cat.',
          },
        }),
        '```',
      ].join('\n'));
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: 'Handle this and keep the lane direct.' },
    runtimeClient,
    now,
  );
  const channel = buildChannelView(dispatched.state, channelId);
  const noTargetCheckpoint = channel.roomRouting?.workflow.turnHistory[0]?.events.find(
    (event) => event.kind === 'checkpoint' && event.metadata.checkpointKind === 'no_targets',
  );

  assert.equal(runtimeClient.createdSessions.length, 1);
  assert.equal(runtimeClient.sentMessages.length, 1);
  assert.equal(runtimeClient.sentMessages.some((message) => message.content.includes('You are Smelly')), false);
  assert.equal(channel.orchestratorLease.sessionId, null);
  assert.equal(channel.roomRouting?.lastOutcome?.continuationCount, 0);
  assert.equal(noTargetCheckpoint?.metadata.continuationSource, 'workflow_recommendation');
  assert.deepEqual(noTargetCheckpoint?.metadata.unresolvedTargets, ['Smelly']);
  assert.match(channel.messages.at(-1)?.body ?? '', /I think Boss Cat should take a look\./u);
});

test('direct message does not replace a stale direct-recipient session when runtime reports session not found', async () => {
  const store = new MemoryChatStore();
  let state = await store.read();
  const now = new Date('2026-03-24T00:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Companion',
      provider: 'claude',
      roles: ['companion'],
    },
    now,
  );
  const companionId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Companion lane',
      topic: 'Recover stale direct session leases.',
      roomMode: 'direct_message',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  state = setChannelCatLease(
    state,
    channelId,
    companionId,
    {
      sessionId: 'session-stale',
      status: 'ready',
      lastError: null,
      startedAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
    },
    now,
  );

  const runtimeClient = createRuntimeStub(async ({ sessionId, content }) => {
    if (!content.includes('You are Companion')) {
      throw new Error(`Unexpected prompt:\n${content}`);
    }
    if (sessionId === 'session-stale') {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (sessionId === 'session-1') {
      return usage('Companion recovered the direct lane.');
    }
    throw new Error(`Unexpected session: ${sessionId}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: 'Recover the lane and answer.' },
    runtimeClient,
    now,
    {
      runtimeRecovery: {
        staleSessionRetryLimit: 1,
      },
    },
  );
  const channel = buildChannelView(dispatched.state, channelId);

  assert.equal(runtimeClient.sentMessages.length, 1);
  assert.deepEqual(
    runtimeClient.sentMessages.map((message) => message.sessionId),
    ['session-stale'],
  );
  assert.equal(runtimeClient.createdSessions.length, 0);
  assert.deepEqual(runtimeClient.closedSessions, []);
  assert.equal(channel.assignedCats[0]?.execution.lease.sessionId, 'session-stale');
  assert.equal(channel.assignedCats[0]?.execution.lease.status, 'error');
  assert.match(
    channel.assignedCats[0]?.execution.lease.lastError ?? '',
    /lane is paused until you reset or retarget/i,
  );
  assert.equal(dispatched.results[0]?.status, 'error');
  assert.match(dispatched.results[0]?.error ?? '', /lane is paused until you reset or retarget/i);
});

test('direct message does not replace a closed direct-recipient session when runtime demands resume first', async () => {
  const store = new MemoryChatStore();
  let state = await store.read();
  const now = new Date('2026-03-24T00:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Companion',
      provider: 'claude',
      roles: ['companion'],
    },
    now,
  );
  const companionId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Companion lane',
      topic: 'Recover closed direct session leases.',
      roomMode: 'direct_message',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  state = setChannelCatLease(
    state,
    channelId,
    companionId,
    {
      sessionId: 'session-closed',
      status: 'error',
      lastError: 'Session is closed. Resume it first.',
      startedAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
    },
    now,
  );

  const runtimeClient = createRuntimeStub(async ({ sessionId, content }) => {
    if (!content.includes('You are Companion')) {
      throw new Error(`Unexpected prompt:\n${content}`);
    }
    if (sessionId === 'session-closed') {
      throw new Error('Session is closed. Resume it first.');
    }
    if (sessionId === 'session-1') {
      return usage('Companion reopened the direct lane.');
    }
    throw new Error(`Unexpected session: ${sessionId}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: 'Resume the lane and answer.' },
    runtimeClient,
    now,
    {
      runtimeRecovery: {
        staleSessionRetryLimit: 1,
      },
    },
  );
  const channel = buildChannelView(dispatched.state, channelId);

  assert.equal(runtimeClient.sentMessages.length, 1);
  assert.deepEqual(
    runtimeClient.sentMessages.map((message) => message.sessionId),
    ['session-closed'],
  );
  assert.equal(runtimeClient.createdSessions.length, 0);
  assert.deepEqual(runtimeClient.closedSessions, []);
  assert.equal(channel.assignedCats[0]?.execution.lease.sessionId, 'session-closed');
  assert.equal(channel.assignedCats[0]?.execution.lease.status, 'error');
  assert.match(
    channel.assignedCats[0]?.execution.lease.lastError ?? '',
    /lane is paused until you reset or retarget/i,
  );
  assert.equal(dispatched.results[0]?.status, 'error');
  assert.match(dispatched.results[0]?.error ?? '', /lane is paused until you reset or retarget/i);
});

test('session-full errors stop immediately and clear the direct lane lease instead of retrying', async () => {
  const store = new MemoryChatStore();
  let state = await store.read();
  const now = new Date('2026-03-24T00:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Companion',
      provider: 'claude',
      roles: ['companion'],
    },
    now,
  );
  const companionId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Companion lane',
      topic: 'Stop when the runtime session is full.',
      roomMode: 'direct_message',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  state = setChannelCatLease(
    state,
    channelId,
    companionId,
    {
      sessionId: 'session-full',
      status: 'ready',
      lastError: null,
      startedAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
    },
    now,
  );

  const runtimeClient = createRuntimeStub(async ({ sessionId, content }) => {
    if (!content.includes('You are Companion')) {
      throw new Error(`Unexpected prompt:\n${content}`);
    }
    if (sessionId === 'session-full') {
      throw new Error('Session full: hard limit reached for this conversation.');
    }
    throw new Error(`Unexpected session: ${sessionId}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: 'Do not retry this forever.' },
    runtimeClient,
    now,
    {
      runtimeRecovery: {
        staleSessionRetryLimit: 5,
      },
    },
  );
  const channel = buildChannelView(dispatched.state, channelId);

  assert.equal(runtimeClient.sentMessages.length, 1);
  assert.equal(runtimeClient.createdSessions.length, 0);
  assert.equal(channel.assignedCats[0]?.execution.lease.sessionId, null);
  assert.equal(channel.assignedCats[0]?.execution.lease.status, 'error');
  assert.match(channel.assignedCats[0]?.execution.lease.lastError ?? '', /session full|hard limit/i);
  const runtimeError = channel.messages.at(-1);
  assert.match(runtimeError?.body ?? '', /Failed to route the message to Companion/i);
  assert.equal(runtimeError?.metadata?.event, 'runtime_error');
  assert.equal(runtimeError?.metadata?.conversationId, buildChatConversationId(channelId));
  assert.equal(runtimeError?.metadata?.containerId, CHAT_ROOT_CONTAINER_ID);
  assert.equal(
    runtimeError?.metadata?.transportBindingId,
    buildDirectLaneTransportBindingId(channelId),
  );
});

test('direct message blocks unmentioned turns when the direct recipient is no longer assigned instead of falling back to Boss Cat', async () => {
  const store = new MemoryChatStore();
  let state = await store.read();
  const now = new Date('2026-03-21T00:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Smelly',
      provider: 'claude',
      roles: ['boss'],
    },
    now,
  );
  state.bossCatId = state.cats[0].id;

  state = createCat(
    state,
    {
      name: 'Companion',
      provider: 'claude',
      roles: ['companion'],
    },
    now,
  );
  const companionId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Companion lane',
      topic: 'Talk directly to Companion.',
      roomMode: 'direct_message',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  state = removeCatFromChannel(state, channelId, companionId, now);

  const runtimeClient = createRuntimeStub(async ({ content }) => {
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: 'Handle this directly.' },
    runtimeClient,
    now,
  );
  const channel = buildChannelView(dispatched.state, channelId);

  assert.equal(runtimeClient.createdSessions.length, 0);
  assert.equal(runtimeClient.sentMessages.length, 0);
  assert.equal(channel.orchestratorLease.sessionId, null);
  assert.equal(channel.roomRouting?.lastOutcome?.resolution.selectionKind, 'blocked');
  assert.equal(channel.roomRouting?.lastOutcome?.resolution.blockedReason, 'missing_direct_message_recipient');
  assert.equal(channel.roomRouting?.lastOutcome?.resolution.defaultTarget?.participantId, companionId);
  assert.equal(channel.roomRouting?.wakeHistory.length, 0);
  assert.match(channel.messages.at(-1)?.body ?? '', /no longer has an active recipient Cat/i);
});

test('already-awake route targets record skipped wake requests without a completion timestamp', async () => {
  const store = new MemoryChatStore();
  let state = await store.read();
  const now = new Date('2026-03-23T00:00:00.000Z');

  state = createCat(
    state,
    {
      name: 'Companion',
      provider: 'claude',
      roles: ['companion'],
    },
    now,
  );
  const companionId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Companion lane',
      topic: 'Keep skipped wake requests machine-readable.',
      roomMode: 'direct_message',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    now,
  );

  const channelId = state.selectedChannelId;
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Companion')) {
      return usage('Companion stayed on the direct lane.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const firstTurn = await routeChannelMessage(
    state,
    channelId,
    { body: 'Handle this directly.' },
    runtimeClient,
    now,
  );
  const secondTurn = await routeChannelMessage(
    firstTurn.state,
    channelId,
    { body: 'Handle the follow-up directly too.' },
    runtimeClient,
    now,
  );
  const channel = buildChannelView(secondTurn.state, channelId);

  assert.equal(runtimeClient.createdSessions.length, 1);
  assert.deepEqual(
    channel.roomRouting?.wakeHistory.map((wake) => wake.status),
    ['skipped', 'completed'],
  );
  assert.equal(channel.roomRouting?.lastWakeRequest?.status, 'skipped');
  assert.equal(channel.roomRouting?.lastWakeRequest?.completedAt, null);
});

test('anti-ping-pong blocks repeated back-and-forth and prompts only include per-target recent context', async () => {
  const { state, channelId } = await createChannelState();
  const promptsByTarget = {
    Smelly: [],
    'Agent-1': [],
  };
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Smelly')) {
      promptsByTarget.Smelly.push(content);
      if (promptsByTarget.Smelly.length === 1) {
        return usage('@Agent-1 take first pass.');
      }
      return usage('@Agent-1 one more tweak.');
    }
    if (content.includes('You are Agent-1')) {
      promptsByTarget['Agent-1'].push(content);
      return usage('@Smelly please review.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: '@Agent-1 Start the routing loop.' },
    runtimeClient,
    new Date('2026-03-21T00:00:00.000Z'),
  );
  const channel = buildChannelView(dispatched.state, channelId);

  assert.equal(promptsByTarget.Smelly.length, 1);
  assert.equal(promptsByTarget['Agent-1'].length, 2);
  assert.ok(promptsByTarget['Agent-1'][1].includes('@Smelly please review.'));
  assert.ok(promptsByTarget['Agent-1'][1].includes('@Agent-1 take first pass.'));
  assert.equal(promptsByTarget['Agent-1'][1].includes('[user:User] @Agent-1 Start the routing loop.'), false);
  assert.equal(channel.roomRouting?.lastOutcome?.guard, 'anti_ping_pong');
  assert.ok(
    channel.roomRouting?.lastOutcome?.checkpoints.some(
      (checkpoint) => checkpoint.kind === 'anti_ping_pong',
    ),
  );
  assert.equal(
    channel.roomRouting?.lastOutcome?.dispatches.filter(
      (dispatch) => dispatch.target.participantName === 'Agent-1',
    ).length,
    2,
  );
  assert.equal(channel.roomRouting?.workflow.turnHistory[0]?.guard, 'anti_ping_pong');
  assert.ok(
    channel.roomRouting?.workflow.eventHistory.some(
      (event) => event.kind === 'guard_blocked',
    ),
  );
});
