import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  appendMessage,
  assignCatToChannel,
  createCat,
  createChannel,
  requireChannel,
} from '../build/server/products/chat/state/model/index.js';
import {
  beginChannelMessageDispatch,
  routeChannelMessage,
} from '../build/server/products/chat/state/runtimeActions.js';
import {
  repairOrphanedCompletedDispatchTurn,
} from '../build/server/products/chat/state/runtime-dispatch/repair.js';
import {
  resumeWorkflowContinuationReplay,
} from '../build/server/products/chat/state/runtime-dispatch/replay.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import {
  buildWorkflowContinuationReplayRequest,
} from '../build/server/platform/orchestration/workflowContinuationReplay.js';
import {
  buildChatAssignedParticipantId,
  buildChatConversationId,
} from '../build/server/shared/chatCoreIds.js';

function createDeferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function usage(content) {
  return {
    segments: [{ kind: 'text', text: content, toolName: null, toolId: null }],
    inputTokens: 11,
    outputTokens: 7,
    tokensUsed: 18,
  };
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

function createNoopRuntimeClient() {
  return {
    async closeSession() {},
  };
}

async function createGroupChannelState() {
  let state = await new MemoryChatStore().read();
  const now = new Date('2026-04-15T00:00:00.000Z');

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
      title: 'Core write adapter',
      topic: 'Exercise canonical turn and lane writes.',
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

function readLatestConversationTurn(core, conversationId) {
  return core.turns
    .filter((turn) => turn.conversationId === conversationId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .at(-1) ?? null;
}

function readOrderedTurnLanes(core, turnId) {
  return core.lanes
    .filter((lane) => lane.turnId === turnId)
    .sort((left, right) => left.orderIndex - right.orderIndex);
}

function readTurnSegments(core, turnId) {
  return core.segments
    .filter((segment) => segment.turnId === turnId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

test('routeChannelMessage persists in-flight canonical turns, lanes, and sessions through chatStore writes', async () => {
  const { state, channelId, agent1Id, agent2Id } = await createGroupChannelState();
  const store = new MemoryChatStore(state);
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
    new Date('2026-04-15T00:00:00.000Z'),
    { chatStore: store },
  );

  await bothRequested.promise;

  const core = await store.readCore();
  const conversationId = buildChatConversationId(channelId);
  const activeTurn = core.turns.find((turn) =>
    turn.conversationId === conversationId && turn.status === 'active');
  assert.ok(activeTurn);

  const lanes = readOrderedTurnLanes(core, activeTurn.id);
  assert.deepEqual(
    lanes.map((lane) => lane.participantId),
    [
      buildChatAssignedParticipantId(channelId, agent1Id),
      buildChatAssignedParticipantId(channelId, agent2Id),
    ],
  );
  assert.equal(core.sessions.filter((session) => session.turnId === activeTurn.id).length, 2);
  assert.equal(readTurnSegments(core, activeTurn.id).length, 0);
  assert.ok(
    lanes.every((lane) =>
      lane.status === 'pending' || lane.status === 'running' || lane.status === 'connecting'),
  );

  agent2Reply.resolve(usage('Agent-2 finished the concurrent review.'));
  await Promise.resolve();
  agent1Reply.resolve(usage('Agent-1 finished the concurrent review.'));
  await dispatchedPromise;
});

test('chatStore.write projects sequential audience order into canonical lane order', async () => {
  const { state, channelId, agent1Id, agent2Id } = await createGroupChannelState();
  const store = new MemoryChatStore();
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

  const dispatchedPromise = routeChannelMessage(
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
    new Date('2026-04-15T00:05:00.000Z'),
  );

  await Promise.resolve();
  assert.equal(secondHasStarted, false);
  firstReply.resolve(usage('Agent-2 handled the first sequential step.'));
  await secondRequested.promise;
  const dispatched = await dispatchedPromise;

  await store.write(dispatched.state);
  const core = await store.readCore();
  const conversationId = buildChatConversationId(channelId);
  const turn = readLatestConversationTurn(core, conversationId);
  assert.ok(turn);
  assert.equal(turn.metadata.workflowShape, 'sequential');
  assert.equal(turn.metadata.sourceMessageBody, 'Handle this in audience order.');

  const lanes = readOrderedTurnLanes(core, turn.id);
  assert.deepEqual(
    lanes.map((lane) => lane.participantId),
    [
      buildChatAssignedParticipantId(channelId, agent2Id),
      buildChatAssignedParticipantId(channelId, agent1Id),
    ],
  );
  assert.deepEqual(lanes.map((lane) => lane.status), ['completed', 'completed']);
  assert.equal(readTurnSegments(core, turn.id).length, 2);
});

test('chatStore.write keeps concurrent lane order stable even when replies finish out of order', async () => {
  const { state, channelId, agent1Id, agent2Id } = await createGroupChannelState();
  const store = new MemoryChatStore();
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
      body: 'Handle this in parallel.',
      messageMetadata: {
        recipientParticipantIds: [agent1Id, agent2Id],
        workflowShape: 'concurrent',
      },
    },
    runtimeClient,
    new Date('2026-04-15T00:10:00.000Z'),
  );

  await bothRequested.promise;
  agent2Reply.resolve(usage('Agent-2 finished first.'));
  await Promise.resolve();
  agent1Reply.resolve(usage('Agent-1 finished second.'));
  const dispatched = await dispatchedPromise;

  await store.write(dispatched.state);
  const core = await store.readCore();
  const conversationId = buildChatConversationId(channelId);
  const turn = readLatestConversationTurn(core, conversationId);
  assert.ok(turn);
  assert.equal(turn.metadata.workflowShape, 'concurrent');

  const lanes = readOrderedTurnLanes(core, turn.id);
  assert.deepEqual(
    lanes.map((lane) => lane.participantId),
    [
      buildChatAssignedParticipantId(channelId, agent1Id),
      buildChatAssignedParticipantId(channelId, agent2Id),
    ],
  );
  const segments = readTurnSegments(core, turn.id);
  assert.equal(segments.length, 2);
  const contentByLaneId = new Map(
    segments.map((segment) => [segment.laneId, segment.content]),
  );
  assert.equal(contentByLaneId.get(lanes[0]?.id), 'Agent-1 finished second.');
  assert.equal(contentByLaneId.get(lanes[1]?.id), 'Agent-2 finished first.');
});

test('resumeWorkflowContinuationReplay persists canonical interaction records for the resumed lane', async () => {
  let { state, channelId, agent1Id, agent2Id } = await createGroupChannelState();
  const channel = requireChannel(state, channelId);
  channel.catAssignments[0].execution.lease.sessionId = 'session-agent-1';
  channel.catAssignments[1].execution.lease.sessionId = 'session-agent-2';
  channel.catAssignments[0].execution.lease.status = 'ready';
  channel.catAssignments[1].execution.lease.status = 'ready';

  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'user',
      senderName: 'Owner',
      body: 'Please continue with the implementation review.',
    },
    new Date('2026-04-15T00:15:00.000Z'),
  ).state;
  const sourceMessageId = requireChannel(state, channelId).messages.at(-1)?.id;
  assert.ok(sourceMessageId);

  const store = new MemoryChatStore();
  await store.write(state);

  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-2')) {
      return usage('Agent-2 resumed the continuation replay.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const result = await resumeWorkflowContinuationReplay({
    request: buildWorkflowContinuationReplayRequest({
      channelId,
      checkpointId: 'checkpoint-replay-1',
      sourceMessageId,
      sourceParticipant: {
        participantKind: 'cat',
        participantId: agent1Id,
        participantName: 'Agent-1',
      },
      targets: [
        {
          participantKind: 'cat',
          participantId: agent2Id,
          participantName: 'Agent-2',
        },
      ],
      branchStrategy: 'transplant_context',
      workflowStageId: 'continuation_handoff',
      workflowShape: 'sequential',
      recordedAt: '2026-04-15T00:15:30.000Z',
    }),
    chatStore: store,
    runtimeClient,
    now: new Date('2026-04-15T00:16:00.000Z'),
  });

  assert.equal(result.status, 'dispatched');
  const core = await store.readCore();
  const conversationId = buildChatConversationId(channelId);
  const turn = readLatestConversationTurn(core, conversationId);
  assert.ok(turn);
  const lanes = readOrderedTurnLanes(core, turn.id);
  assert.equal(lanes.length, 1);
  assert.equal(
    lanes[0]?.participantId,
    buildChatAssignedParticipantId(channelId, agent2Id),
  );
  const segments = readTurnSegments(core, turn.id);
  assert.equal(segments.length, 1);
  assert.equal(segments[0]?.content, 'Agent-2 resumed the continuation replay.');
  assert.equal(
    core.sessions.find((session) => session.turnId === turn.id)?.id,
    'session-agent-2',
  );
});

test('resumeWorkflowContinuationReplay can rebuild a missing routed handoff source from canonical segments', async () => {
  const { state, channelId, agent1Id, agent2Id } = await createGroupChannelState();
  const store = new MemoryChatStore();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return usage('Agent-1 completed the first step.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: '@Agent-1 take the first pass.' },
    runtimeClient,
    new Date('2026-04-15T00:18:00.000Z'),
    { chatStore: store },
  );
  await store.write(dispatched.state);

  const sourceMessage = requireChannel(dispatched.state, channelId).messages.find((message) =>
    message.senderName === 'Agent-1'
    && message.metadata?.event === 'assistant_turn_segment');
  assert.ok(sourceMessage);

  const brokenState = structuredClone(dispatched.state);
  const brokenChannel = requireChannel(brokenState, channelId);
  brokenChannel.messages = brokenChannel.messages.filter((message) => message.id !== sourceMessage.id);
  const canonicalCore = await store.readCore();
  let replayState = structuredClone(brokenState);
  let replayCore = structuredClone(canonicalCore);

  const replayStore = {
    async read() {
      return structuredClone(replayState);
    },
    async write(nextState) {
      replayState = structuredClone(nextState);
      return structuredClone(replayState);
    },
    async readCore() {
      return structuredClone(replayCore);
    },
    async writeCore(nextCore) {
      replayCore = structuredClone(nextCore);
      return structuredClone(replayCore);
    },
  };

  const replayRuntimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-2')) {
      assert.match(content, /Latest routed handoff:\nAgent-1 completed the first step\./u);
      return usage('Agent-2 resumed from the canonical handoff.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const result = await resumeWorkflowContinuationReplay({
    request: buildWorkflowContinuationReplayRequest({
      channelId,
      checkpointId: 'checkpoint-replay-canonical-segment',
      sourceMessageId: sourceMessage.id,
      sourceParticipant: {
        participantKind: 'cat',
        participantId: agent1Id,
        participantName: 'Agent-1',
      },
      targets: [
        {
          participantKind: 'cat',
          participantId: agent2Id,
          participantName: 'Agent-2',
        },
      ],
      branchStrategy: 'transplant_context',
      workflowStageId: 'continuation_handoff',
      workflowShape: 'sequential',
      recordedAt: '2026-04-15T00:18:30.000Z',
    }),
    chatStore: replayStore,
    runtimeClient: replayRuntimeClient,
    now: new Date('2026-04-15T00:19:00.000Z'),
  });

  assert.equal(result.status, 'dispatched');
  assert.ok(
    requireChannel(replayState, channelId).messages.some((message) =>
      message.body === 'Agent-2 resumed from the canonical handoff.'),
  );
});

test('repairOrphanedCompletedDispatchTurn syncs repaired turns back into canonical interaction records', async () => {
  const runtimeClient = createNoopRuntimeClient();
  const seededAt = new Date('2026-04-15T00:20:00.000Z');
  const responseAt = new Date('2026-04-15T00:20:06.000Z');
  const store = new MemoryChatStore();
  let state = await store.read();
  state = createChannel(
    state,
    {
      title: 'Repair canonical interaction',
      topic: 'Persist repaired dispatch turns into the canonical core records.',
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelId = state.selectedChannelId;
  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    { body: 'Please recover this completed reply' },
    runtimeClient,
    seededAt,
  );
  const activeTurnId = requireChannel(begun.state, channelId).roomRouting.workflow.activeTurn?.id;
  assert.ok(activeTurnId);
  const repliedState = appendMessage(
    begun.state,
    channelId,
    {
      senderKind: 'orchestrator',
      senderName: 'Chat',
      body: 'Recovered response body',
    },
    responseAt,
    {
      metadata: {
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-recovered',
        targetStateId: 'target-orchestrator-recovered',
        terminal: true,
        turnId: activeTurnId,
        targetKind: 'orchestrator',
        targetId: 'orchestrator',
        sessionId: 'session-recovered',
        routingTrigger: 'room_default',
        dispatchDepth: 0,
      },
    },
  ).state;
  const corruptedState = structuredClone(repliedState);
  const corruptedChannel = requireChannel(corruptedState, channelId);
  const interruptedTurn = structuredClone(corruptedChannel.roomRouting.workflow.activeTurn);
  assert.ok(interruptedTurn);
  interruptedTurn.status = 'blocked';
  interruptedTurn.stageId = 'startup_recovery';
  interruptedTurn.completedAt = responseAt.toISOString();
  interruptedTurn.updatedAt = responseAt.toISOString();
  interruptedTurn.targetStatuses = [];
  interruptedTurn.events = interruptedTurn.events.filter((event) =>
    event.kind === 'turn_started' || event.kind === 'checkpoint');
  interruptedTurn.events.push(
    {
      id: 'guard-blocked',
      turnId: interruptedTurn.id,
      kind: 'guard_blocked',
      status: 'blocked',
      message: 'Recovered an interrupted room workflow after restart.',
      actor: null,
      sourceMessageId: null,
      targets: [],
      dispatchId: null,
      checkpointId: 'loop-guard',
      outcomeId: null,
      createdAt: responseAt.toISOString(),
      metadata: {
        recoverySource: 'server_restart',
      },
    },
    {
      id: 'outcome-blocked',
      turnId: interruptedTurn.id,
      kind: 'outcome',
      status: 'blocked',
      message: 'Room workflow moved to blocked recovery after startup interrupted the active turn.',
      actor: null,
      sourceMessageId: interruptedTurn.sourceMessageId,
      targets: [],
      dispatchId: null,
      checkpointId: null,
      outcomeId: null,
      createdAt: responseAt.toISOString(),
      metadata: {
        recoverySource: 'server_restart',
      },
    },
  );
  corruptedChannel.roomRouting.workflow.activeTurn = null;
  corruptedChannel.roomRouting.workflow.turnHistory.unshift(interruptedTurn);
  corruptedChannel.roomRouting.lastCheckpoint = {
    id: 'loop-guard',
    kind: 'loop_guard',
    message: 'Recovered an interrupted room workflow after restart.',
    actor: null,
    sourceMessageId: null,
    targets: [],
    createdAt: responseAt.toISOString(),
  };
  corruptedChannel.roomRouting.lastOutcome = {
    turnId: interruptedTurn.id,
    mode: corruptedChannel.roomRouting.mode,
    sourceMessageId: interruptedTurn.sourceMessageId,
    sourceSenderKind: interruptedTurn.sourceSenderKind,
    sourceSenderName: interruptedTurn.sourceSenderName,
    status: 'blocked',
    resolution: {
      routingMode: 'room_default',
      selectionKind: 'default_target',
      defaultTarget: {
        participantKind: 'orchestrator',
        participantId: 'orchestrator',
        participantName: 'Chat',
      },
      defaultTargetReason: 'boss_chat_default',
      fallbackTarget: null,
      blockedReason: null,
      note: null,
    },
    resolvedTargets: [
      {
        participantKind: 'orchestrator',
        participantId: 'orchestrator',
        participantName: 'Chat',
      },
    ],
    unresolvedMentions: [],
    dispatches: [],
    checkpoints: [],
    continuationCount: 0,
    totalDispatchCount: 0,
    guard: null,
    startedAt: seededAt.toISOString(),
    completedAt: responseAt.toISOString(),
  };

  const repaired = repairOrphanedCompletedDispatchTurn(
    corruptedState,
    channelId,
    new Date('2026-04-15T00:21:00.000Z'),
  );

  assert.equal(repaired.repaired, true);
  await store.write(repaired.state);
  const core = await store.readCore();
  const conversationId = buildChatConversationId(channelId);
  const turn = readLatestConversationTurn(core, conversationId);
  assert.ok(turn);
  assert.equal(turn.status, 'completed');
  const lanes = readOrderedTurnLanes(core, turn.id);
  assert.equal(lanes.length, 1);
  assert.equal(lanes[0]?.status, 'completed');
  const segments = readTurnSegments(core, turn.id);
  assert.equal(segments.length, 1);
  assert.equal(segments[0]?.content, 'Recovered response body');
  assert.equal(
    core.sessions.find((session) => session.turnId === turn.id)?.id,
    'session-recovered',
  );
});
