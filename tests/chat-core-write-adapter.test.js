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
  continueBegunChannelMessageDispatch,
  beginChannelMessageRetryDispatch,
  routeChannelMessage,
} from '../build/server/products/chat/state/runtimeActions.js';
import {
  repairOrphanedCompletedDispatchTurn,
} from '../build/server/products/chat/state/runtime-dispatch/repair.js';
import {
  applyChannelReadRepairs,
} from '../build/server/products/chat/api/channelRepair.js';
import {
  resumeWorkflowContinuationReplay,
} from '../build/server/products/chat/state/runtime-dispatch/replay.js';
import {
  buildCanonicalChatMessage,
} from '../build/server/products/chat/state/chatCoreInterop.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import {
  buildWorkflowContinuationReplayRequest,
  readWorkflowContinuationReplay,
} from '../build/server/platform/orchestration/workflowContinuationReplay.js';
import {
  buildChatAssignedParticipantId,
  buildChatConversationId,
  buildChatLaneId,
  buildChatTaskId,
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

test('chatStore.write ignores stale session_started messages when preseeded lanes have not woken yet', async () => {
  let { state, channelId, agent1Id } = await createGroupChannelState();
  const staleTurnId = 'turn-stale-session';
  const staleTargetStateId = 'target-stale-session';
  const staleSessionId = 'session-stale';
  const seededAt = new Date('2026-04-15T00:05:30.000Z');
  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'system',
      senderName: 'Runtime',
      body: 'Agent-1 started a prior runtime session.',
    },
    new Date('2026-04-15T00:05:00.000Z'),
    {
      metadata: {
        event: 'session_started',
        conversationId: buildChatConversationId(channelId),
        targetKind: 'cat',
        targetId: agent1Id,
        targetStateId: staleTargetStateId,
        laneId: buildChatLaneId(staleTurnId, staleTargetStateId, agent1Id),
        sessionId: staleSessionId,
        verbosity: 'verbose',
      },
      incrementUnread: false,
    },
  ).state;

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: 'Pick this up next.',
      messageMetadata: {
        recipientParticipantIds: [agent1Id],
        workflowShape: 'sequential',
      },
    },
    createNoopRuntimeClient(),
    seededAt,
  );

  const activeTurn = requireChannel(begun.state, channelId).roomRouting.workflow.activeTurn;
  assert.ok(activeTurn);
  const targetStateId = activeTurn.targetStatuses[0]?.id ?? null;
  assert.ok(targetStateId);

  const store = new MemoryChatStore();
  await store.write(begun.state);
  const core = await store.readCore();
  const conversationId = buildChatConversationId(channelId);
  const projectedTurn = core.turns.find((turn) =>
    turn.conversationId === conversationId && turn.status === 'active');
  assert.ok(projectedTurn);

  const lanes = readOrderedTurnLanes(core, projectedTurn.id);
  assert.equal(lanes.length, 1);
  assert.equal(lanes[0]?.id, buildChatLaneId(projectedTurn.id, targetStateId, agent1Id));
  assert.equal(core.sessions.filter((session) => session.turnId === projectedTurn.id).length, 0);
});

test('chatStore.write derives startup recovery replay for initial sequential queues from persisted handoff checkpoints', async () => {
  let { state, channelId, agent1Id, agent2Id } = await createGroupChannelState();
  const seededAt = new Date('2026-04-15T00:06:00.000Z');
  state = createCat(
    state,
    {
      name: 'Agent-3',
      provider: 'codex',
      roles: ['verifier'],
    },
    seededAt,
  );
  const agent3Id = state.cats[0].id;
  state = assignCatToChannel(
    state,
    channelId,
    {
      catId: agent3Id,
      provider: 'codex',
      roles: ['verifier'],
    },
    seededAt,
  );

  const liveStore = new MemoryChatStore(state);
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
    if (content.includes('You are Agent-3')) {
      return usage('Agent-3 closed the recovered room.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: 'Handle this in sequence.',
      messageMetadata: {
        recipientParticipantIds: [agent2Id, agent1Id, agent3Id],
        workflowShape: 'sequential',
      },
    },
    runtimeClient,
    seededAt,
    { chatStore: liveStore },
  );
  const dispatchPromise = continueBegunChannelMessageDispatch(
    begun,
    channelId,
    runtimeClient,
    seededAt,
    { chatStore: liveStore },
  );

  firstReply.resolve(usage('Agent-2 handled the first sequential step.'));
  await secondRequested.promise;
  const inFlightState = await liveStore.read();
  const inFlightChannel = requireChannel(inFlightState, channelId);
  const firstReplyMessage = inFlightChannel.messages.find((message) =>
    message.senderKind === 'agent' && message.senderName === 'Agent-2');
  assert.ok(firstReplyMessage);

  secondReply.resolve(usage('Agent-1 handled the second sequential step.'));
  await dispatchPromise;

  const interruptedState = structuredClone(inFlightState);
  const interruptedChannel = requireChannel(interruptedState, channelId);
  const interruptedTurn = structuredClone(interruptedChannel.roomRouting.workflow.activeTurn);
  assert.ok(interruptedTurn);
  const firstCompletedTarget = interruptedTurn.targetStatuses.find((target) =>
    target.participant.participantName === 'Agent-2');
  assert.ok(firstCompletedTarget);
  const continuationCheckpoint = [...interruptedTurn.events].reverse().find((event) =>
    event.kind === 'checkpoint'
    && event.metadata?.checkpointKind === 'continuation'
    && event.metadata?.continuationSourceMessageId === firstReplyMessage?.id);
  assert.ok(continuationCheckpoint);

  const recoveryAt = '2026-04-15T00:06:30.000Z';
  interruptedTurn.status = 'blocked';
  interruptedTurn.stageId = 'startup_recovery';
  interruptedTurn.completedAt = recoveryAt;
  interruptedTurn.updatedAt = recoveryAt;
  interruptedTurn.targetStatuses = [structuredClone(firstCompletedTarget)];
  interruptedTurn.events = [
    ...interruptedTurn.events.filter((event) => event.kind === 'turn_started'),
    structuredClone(continuationCheckpoint),
    {
      id: 'guard-blocked-initial-sequential-recovery',
      turnId: interruptedTurn.id,
      kind: 'guard_blocked',
      status: 'blocked',
      message: 'Recovered an interrupted room workflow after restart.',
      actor: null,
      sourceMessageId: null,
      targets: [
        {
          participantKind: 'cat',
          participantId: buildChatAssignedParticipantId(channelId, agent1Id),
          participantName: 'Agent-1',
        },
        {
          participantKind: 'cat',
          participantId: buildChatAssignedParticipantId(channelId, agent3Id),
          participantName: 'Agent-3',
        },
      ],
      dispatchId: null,
      checkpointId: 'loop-guard-initial-sequential-recovery',
      outcomeId: null,
      createdAt: recoveryAt,
      metadata: {
        checkpointKind: 'loop_guard',
        reason: 'startup_restart',
        recoveryPhase: 'startup_recovered',
        recoverySource: 'server_restart',
        interruptedError: 'Cats server restarted before room workflow cleanup completed.',
        interruptedTargetCount: 2,
        workflowStageIdBeforeRecovery: 'continuation_handoff',
        workflowStageId: 'continuation_handoff',
        workflowShape: 'sequential',
      },
    },
    {
      id: 'outcome-blocked-initial-sequential-recovery',
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
      createdAt: recoveryAt,
      metadata: {
        recoveryPhase: 'startup_recovered',
        recoverySource: 'server_restart',
        interruptedError: 'Cats server restarted before room workflow cleanup completed.',
        interruptedTargetCount: 2,
        workflowStageIdBeforeRecovery: 'continuation_handoff',
        workflowStageId: 'startup_recovery',
        workflowShape: 'sequential',
      },
    },
  ];
  interruptedChannel.roomRouting.workflow.activeTurn = null;
  interruptedChannel.roomRouting.workflow.turnHistory = [interruptedTurn];
  interruptedChannel.roomRouting.lastCheckpoint = {
    id: 'loop-guard-initial-sequential-recovery',
    kind: 'loop_guard',
    message: 'Recovered an interrupted room workflow after restart.',
    actor: null,
    sourceMessageId: null,
    targets: [
      {
        participantKind: 'cat',
        participantId: buildChatAssignedParticipantId(channelId, agent1Id),
        participantName: 'Agent-1',
      },
      {
        participantKind: 'cat',
        participantId: buildChatAssignedParticipantId(channelId, agent3Id),
        participantName: 'Agent-3',
      },
    ],
    createdAt: recoveryAt,
  };
  interruptedChannel.roomRouting.lastOutcome = {
    turnId: interruptedTurn.id,
    mode: interruptedChannel.roomRouting.mode,
    sourceMessageId: interruptedTurn.sourceMessageId,
    sourceSenderKind: interruptedTurn.sourceSenderKind,
    sourceSenderName: interruptedTurn.sourceSenderName,
    status: 'blocked',
    resolution: {
      routingMode: 'explicit_multi',
      selectionKind: 'explicit_mentions',
      defaultTarget: null,
      defaultTargetReason: null,
      fallbackTarget: null,
      blockedReason: null,
      note: null,
    },
    resolvedTargets: [],
    unresolvedMentions: [],
    dispatches: [],
    checkpoints: [],
    continuationCount: 1,
    totalDispatchCount: 1,
    guard: 'loop_guard',
    startedAt: interruptedTurn.startedAt,
    completedAt: recoveryAt,
  };

  const recoveryStore = new MemoryChatStore(interruptedState);
  const recoveryCore = await recoveryStore.readCore();
  const projectedTask = recoveryCore.tasks.find((task) => task.id === buildChatTaskId(channelId));
  assert.ok(projectedTask);
  const replay = readWorkflowContinuationReplay(projectedTask.metadata, {
    includeInProgress: true,
  });

  assert.ok(replay);
  assert.equal(replay?.sourceParticipant?.participantName, 'Agent-2');
  assert.equal(replay?.sourceMessageId, firstReplyMessage?.id);
  assert.deepEqual(
    replay?.targets.map((target) => target.participantName),
    ['Agent-1', 'Agent-3'],
  );
  assert.equal(replay?.workflowStageId, 'continuation_handoff');
  assert.equal(replay?.workflowShape, 'sequential');
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

test('resumeWorkflowContinuationReplay supports user-origin sequential replays without a source participant', async () => {
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
      body: 'Run this room in sequence from the user request.',
    },
    new Date('2026-04-15T00:16:30.000Z'),
  ).state;
  const sourceMessageId = requireChannel(state, channelId).messages.at(-1)?.id;
  assert.ok(sourceMessageId);

  const store = new MemoryChatStore();
  await store.write(state);

  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return usage('Agent-1 completed the first recovered step.');
    }
    if (content.includes('You are Agent-2')) {
      assert.match(
        content,
        /Latest routed handoff:\nAgent-1 completed the first recovered step\./u,
      );
      return usage('Agent-2 completed the second recovered step.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const result = await resumeWorkflowContinuationReplay({
    request: buildWorkflowContinuationReplayRequest({
      channelId,
      checkpointId: 'checkpoint-replay-user-origin-sequential',
      sourceMessageId,
      sourceParticipant: null,
      targets: [
        {
          participantKind: 'cat',
          participantId: agent1Id,
          participantName: 'Agent-1',
        },
        {
          participantKind: 'cat',
          participantId: agent2Id,
          participantName: 'Agent-2',
        },
      ],
      branchStrategy: null,
      workflowStageId: 'continuation_handoff',
      workflowShape: 'sequential',
      recordedAt: '2026-04-15T00:16:45.000Z',
    }),
    chatStore: store,
    runtimeClient,
    now: new Date('2026-04-15T00:17:00.000Z'),
  });

  assert.equal(result.status, 'dispatched');
  assert.deepEqual(
    runtimeClient.sentMessages.map((message) =>
      message.content.includes('You are Agent-1') ? 'Agent-1' : 'Agent-2'),
    ['Agent-1', 'Agent-2'],
  );

  const replayedState = await store.read();
  const replayedChannel = requireChannel(replayedState, channelId);
  const replies = replayedChannel.messages.filter((message) => message.senderKind === 'agent');
  assert.deepEqual(
    replies.map((message) => message.senderName),
    ['Agent-1', 'Agent-2'],
  );
  assert.equal(
    runtimeClient.sentMessages[1]?.input?.context?.metadata?.sourceMessageId,
    replies[0]?.id,
  );

  const core = await store.readCore();
  const conversationId = buildChatConversationId(channelId);
  const turn = readLatestConversationTurn(core, conversationId);
  assert.ok(turn);
  const lanes = readOrderedTurnLanes(core, turn.id);
  assert.equal(lanes.length, 2);
  assert.ok(lanes[0]?.sourceParticipantId == null);
  assert.equal(lanes[0]?.metadata.sourceMessageId, sourceMessageId);
  assert.equal(lanes[1]?.metadata.sourceMessageId, replies[0]?.id);
  assert.equal(lanes[1]?.metadata.branchStrategy, 'transplant_context');
});

test('resumeWorkflowContinuationReplay can rebuild a missing user continuation source from sourceTurnId', async () => {
  const { state, channelId, agent1Id, agent2Id } = await createGroupChannelState();
  const channel = requireChannel(state, channelId);
  channel.catAssignments[0].execution.lease.sessionId = 'session-agent-1';
  channel.catAssignments[0].execution.lease.status = 'ready';
  channel.catAssignments[1].execution.lease.sessionId = 'session-agent-2';
  channel.catAssignments[1].execution.lease.status = 'ready';

  const originalBody = '@Agent-1 capture this user turn so replay can reuse it.';
  const store = new MemoryChatStore();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return usage('Agent-1 captured the original user turn.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: originalBody },
    runtimeClient,
    new Date('2026-04-15T00:17:15.000Z'),
    { chatStore: store },
  );
  await store.write(dispatched.state);

  const sourceMessageId = requireChannel(dispatched.state, channelId).messages.find((message) =>
    message.senderKind === 'user' && message.body === originalBody)?.id;
  assert.ok(sourceMessageId);

  const canonicalCore = await store.readCore();
  const conversationId = buildChatConversationId(channelId);
  const sourceTurn = readLatestConversationTurn(canonicalCore, conversationId);
  assert.ok(sourceTurn);
  assert.equal(sourceTurn?.metadata.sourceMessageBody, originalBody);

  const driftedState = structuredClone(dispatched.state);
  const driftedChannel = requireChannel(driftedState, channelId);
  driftedChannel.messages = driftedChannel.messages.filter((message) => message.id !== sourceMessageId);
  let replayState = structuredClone(driftedState);
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
      assert.match(content, /@Agent-1 capture this user turn so replay can reuse it\./u);
      return usage('Agent-2 resumed from the canonical user source.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const replayResult = await resumeWorkflowContinuationReplay({
    request: buildWorkflowContinuationReplayRequest({
      channelId,
      checkpointId: 'checkpoint-replay-user-source-turn-id',
      sourceMessageId: 'missing-user-source-message',
      sourceTurnId: sourceTurn.id,
      sourceParticipant: null,
      targets: [
        {
          participantKind: 'cat',
          participantId: agent2Id,
          participantName: 'Agent-2',
        },
      ],
      branchStrategy: null,
      workflowStageId: 'continuation_handoff',
      workflowShape: 'sequential',
      recordedAt: '2026-04-15T00:17:30.000Z',
    }),
    chatStore: replayStore,
    runtimeClient: replayRuntimeClient,
    now: new Date('2026-04-15T00:18:00.000Z'),
  });

  assert.equal(replayResult.status, 'dispatched');
  assert.ok(
    requireChannel(await replayStore.read(), channelId).messages.some((message) =>
      message.body === 'Agent-2 resumed from the canonical user source.'),
  );
  const replayedCore = await replayStore.readCore();
  const replayTurn = readLatestConversationTurn(replayedCore, conversationId);
  assert.equal(replayTurn?.metadata.sourceMessageBody, originalBody);
});

test('resumeWorkflowContinuationReplay can rebuild a missing routed handoff source from the full canonical assistant turn', async () => {
  const { state, channelId, agent1Id, agent2Id } = await createGroupChannelState();
  const store = new MemoryChatStore();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return {
        segments: [
          {
            kind: 'text',
            text: 'Agent-1 completed the first step. ',
            toolName: null,
            toolId: null,
          },
          {
            kind: 'text',
            text: 'Implementation notes included.',
            toolName: null,
            toolId: null,
          },
        ],
        inputTokens: 11,
        outputTokens: 9,
        tokensUsed: 20,
      };
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

  const sourceMessage = requireChannel(dispatched.state, channelId).messages.filter((message) =>
    message.senderName === 'Agent-1'
    && message.metadata?.event === 'assistant_turn_segment').at(-1);
  assert.ok(sourceMessage);

  const brokenState = structuredClone(dispatched.state);
  const brokenChannel = requireChannel(brokenState, channelId);
  brokenChannel.messages = brokenChannel.messages.filter((message) => message.id !== sourceMessage.id);
  const withLaterMessage = appendMessage(
    brokenState,
    channelId,
    {
      senderKind: 'user',
      senderName: 'Owner',
      body: 'Ignore this later note.',
    },
    new Date('2026-04-15T00:18:45.000Z'),
  );
  const driftedState = withLaterMessage.state;
  const canonicalCore = await store.readCore();
  let replayState = structuredClone(driftedState);
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
      assert.match(
        content,
        /Recent messages:[\s\S]*\[user:User\] @Agent-1 take the first pass\./u,
      );
      assert.match(
        content,
        /Latest routed handoff:\nAgent-1 completed the first step\. ?Implementation notes included\./u,
      );
      assert.doesNotMatch(content, /Ignore this later note\./u);
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

test('resumeWorkflowContinuationReplay can rebuild a missing assistant continuation source from source identity metadata', async () => {
  const { state, channelId, agent1Id, agent2Id } = await createGroupChannelState();
  const store = new MemoryChatStore();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return {
        segments: [
          {
            kind: 'text',
            text: 'Agent-1 completed the first source-aware step. ',
            toolName: null,
            toolId: null,
          },
          {
            kind: 'text',
            text: 'Preserve this assistant handoff.',
            toolName: null,
            toolId: null,
          },
        ],
        inputTokens: 12,
        outputTokens: 9,
        tokensUsed: 21,
      };
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: '@Agent-1 create a resumable handoff.' },
    runtimeClient,
    new Date('2026-04-15T00:18:10.000Z'),
    { chatStore: store },
  );
  await store.write(dispatched.state);

  const sourceMessage = requireChannel(dispatched.state, channelId).messages.filter((message) =>
    message.senderName === 'Agent-1'
    && message.metadata?.event === 'assistant_turn_segment').at(-1);
  assert.ok(sourceMessage);
  const sourceTurnId = sourceMessage?.metadata?.turnId;
  const sourceAssistantTurnId = sourceMessage?.metadata?.assistantTurnId;
  assert.equal(typeof sourceTurnId, 'string');
  assert.equal(typeof sourceAssistantTurnId, 'string');

  const canonicalCore = await store.readCore();
  const sourceLane = canonicalCore.lanes.find((lane) =>
    lane.turnId === sourceTurnId
    && lane.metadata.responseAssistantTurnId === sourceAssistantTurnId) ?? null;
  assert.ok(sourceLane);

  const driftedState = structuredClone(dispatched.state);
  const driftedChannel = requireChannel(driftedState, channelId);
  driftedChannel.messages = driftedChannel.messages.filter((message) =>
    !(message.senderName === 'Agent-1' && message.metadata?.event === 'assistant_turn_segment'));
  let replayState = structuredClone(driftedState);
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
      assert.match(
        content,
        /Latest routed handoff:\nAgent-1 completed the first source-aware step\. ?Preserve this assistant handoff\./u,
      );
      return usage('Agent-2 resumed from source identity metadata.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const replayResult = await resumeWorkflowContinuationReplay({
    request: buildWorkflowContinuationReplayRequest({
      channelId,
      checkpointId: 'checkpoint-replay-assistant-source-identity',
      sourceMessageId: 'missing-assistant-source-message',
      sourceTurnId,
      sourceLaneId: sourceLane.id,
      sourceAssistantTurnId,
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
      recordedAt: '2026-04-15T00:18:40.000Z',
    }),
    chatStore: replayStore,
    runtimeClient: replayRuntimeClient,
    now: new Date('2026-04-15T00:19:00.000Z'),
  });

  assert.equal(replayResult.status, 'dispatched');
  assert.ok(
    requireChannel(await replayStore.read(), channelId).messages.some((message) =>
      message.body === 'Agent-2 resumed from source identity metadata.'),
  );
});

test('resumeWorkflowContinuationReplay rebuilds recent prompt context from canonical history when the source survives transcript drift', async () => {
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
    new Date('2026-04-15T00:20:00.000Z'),
    { chatStore: store },
  );
  await store.write(dispatched.state);

  const sourceMessage = requireChannel(dispatched.state, channelId).messages.find((message) =>
    message.senderName === 'Agent-1'
    && message.metadata?.event === 'assistant_turn_segment') ?? null;
  assert.ok(sourceMessage);

  const driftedState = structuredClone(dispatched.state);
  const driftedChannel = requireChannel(driftedState, channelId);
  driftedChannel.messages = driftedChannel.messages.filter((message) =>
    !(message.senderKind === 'user' && message.body === '@Agent-1 take the first pass.'));

  let replayState = structuredClone(driftedState);
  let replayCore = await store.readCore();
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
      assert.match(
        content,
        /Recent messages:[\s\S]*\[user:User\] @Agent-1 take the first pass\./u,
      );
      assert.match(
        content,
        /Latest routed handoff:\nAgent-1 completed the first step\./u,
      );
      return usage('Agent-2 resumed from canonical recent history.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const result = await resumeWorkflowContinuationReplay({
    request: buildWorkflowContinuationReplayRequest({
      channelId,
      checkpointId: 'checkpoint-replay-canonical-recent-history',
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
      recordedAt: '2026-04-15T00:20:30.000Z',
    }),
    chatStore: replayStore,
    runtimeClient: replayRuntimeClient,
    now: new Date('2026-04-15T00:21:00.000Z'),
  });

  assert.equal(result.status, 'dispatched');
  assert.ok(
    requireChannel(replayState, channelId).messages.some((message) =>
      message.body === 'Agent-2 resumed from canonical recent history.'),
  );
});

test('buildCanonicalChatMessage preserves assistant metadata when rebuilding from canonical segments', async () => {
  const { state, channelId } = await createGroupChannelState();
  const store = new MemoryChatStore();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
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
            text: 'Agent-1 explored the repo. ',
            toolName: null,
            toolId: null,
          },
          {
            kind: 'tool_use',
            text: '',
            toolName: 'plan_fix',
            toolId: 'tool-plan',
          },
          {
            kind: 'text',
            text: [
              'Continue with the next specialist.',
              '```json',
              JSON.stringify({
                workflowRecommendation: {
                  workflowShape: 'sequential',
                  candidateTargetNames: ['Agent-2'],
                  branchStrategy: 'transplant_context',
                  rationale: 'Pass the next step to Agent-2.',
                },
              }),
              '```',
            ].join('\n'),
            toolName: null,
            toolId: null,
          },
        ],
        inputTokens: 21,
        outputTokens: 13,
        tokensUsed: 34,
      };
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: '@Agent-1 take the first pass.' },
    runtimeClient,
    new Date('2026-04-15T00:20:00.000Z'),
    { chatStore: store },
  );
  await store.write(dispatched.state);

  const sourceMessage = requireChannel(dispatched.state, channelId).messages.findLast((message) =>
    message.senderName === 'Agent-1'
    && message.metadata?.event === 'assistant_turn_segment'
    && message.metadata?.terminal === true);
  assert.ok(sourceMessage);

  const core = await store.readCore();
  const rebuilt = buildCanonicalChatMessage(core, channelId, sourceMessage.id);
  assert.ok(rebuilt);
  assert.match(rebuilt?.body ?? '', /Agent-1 explored the repo\./u);
  assert.match(rebuilt?.body ?? '', /Continue with the next specialist\./u);
  assert.equal(rebuilt?.metadata?.event, 'assistant_turn_segment');
  assert.equal(rebuilt?.metadata?.terminal, true);
  assert.equal(rebuilt?.metadata?.routingTrigger, 'explicit_mention');
  assert.equal(rebuilt?.metadata?.dispatchDepth, 0);
  assert.deepEqual(rebuilt?.metadata?.precedingTools, [
    { toolName: 'search_repo', toolId: 'tool-search' },
    { toolName: 'plan_fix', toolId: 'tool-plan' },
  ]);
  assert.equal(rebuilt?.metadata?.workflowRecommendation?.workflowShape, 'sequential');
  assert.equal(
    rebuilt?.metadata?.workflowRecommendation?.candidateTargets?.[0]?.participantName,
    'Agent-2',
  );
});

test('chatStore.write preserves canonical turn and segment history when transcript messages disappear', async () => {
  const { state, channelId, agent1Id, agent2Id } = await createGroupChannelState();
  const store = new MemoryChatStore();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return {
        segments: [
          {
            kind: 'text',
            text: 'Agent-1 completed the first step. ',
            toolName: null,
            toolId: null,
          },
          {
            kind: 'text',
            text: 'Implementation notes included.',
            toolName: null,
            toolId: null,
          },
        ],
        inputTokens: 11,
        outputTokens: 9,
        tokensUsed: 20,
      };
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: '@Agent-1 take the first pass.' },
    runtimeClient,
    new Date('2026-04-15T00:19:30.000Z'),
    { chatStore: store },
  );
  await store.write(dispatched.state);

  const sourceMessages = requireChannel(dispatched.state, channelId).messages.filter((message) =>
    message.senderName === 'Agent-1'
    && message.metadata?.event === 'assistant_turn_segment');
  assert.equal(sourceMessages.length, 2);
  const sourceMessage = sourceMessages.at(-1);
  assert.ok(sourceMessage);

  const brokenState = structuredClone(dispatched.state);
  const brokenChannel = requireChannel(brokenState, channelId);
  brokenChannel.messages = brokenChannel.messages.filter((message) =>
    message.id !== sourceMessage.id
    && message.body !== '@Agent-1 take the first pass.'
    && !(message.senderName === 'Agent-1' && message.metadata?.event === 'assistant_turn_segment'));
  await store.write(brokenState);

  const preservedCore = await store.readCore();
  const conversationId = buildChatConversationId(channelId);
  const preservedTurn = readLatestConversationTurn(preservedCore, conversationId);
  assert.ok(preservedTurn);
  assert.equal(preservedTurn.metadata.sourceMessageBody, '@Agent-1 take the first pass.');
  assert.equal(readTurnSegments(preservedCore, preservedTurn.id).length, 2);

  const replayRuntimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-2')) {
      assert.match(
        content,
        /Latest routed handoff:\nAgent-1 completed the first step\. ?Implementation notes included\./u,
      );
      return usage('Agent-2 resumed after transcript drift.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const replayResult = await resumeWorkflowContinuationReplay({
    request: buildWorkflowContinuationReplayRequest({
      channelId,
      checkpointId: 'checkpoint-replay-preserved-canonical-history',
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
      recordedAt: '2026-04-15T00:20:00.000Z',
    }),
    chatStore: store,
    runtimeClient: replayRuntimeClient,
    now: new Date('2026-04-15T00:20:30.000Z'),
  });

  assert.equal(replayResult.status, 'dispatched');
  assert.ok(
    requireChannel(await store.read(), channelId).messages.some((message) =>
      message.body === 'Agent-2 resumed after transcript drift.'),
  );
});

test('chatStore.write preserves canonical terminal turns when workflow history disappears', async () => {
  const { state, channelId } = await createGroupChannelState();
  const store = new MemoryChatStore();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return usage('Agent-1 completed the durable terminal turn.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: '@Agent-1 preserve this terminal turn.' },
    runtimeClient,
    new Date('2026-04-15T00:24:00.000Z'),
    { chatStore: store },
  );
  await store.write(dispatched.state);

  const conversationId = buildChatConversationId(channelId);
  const beforeCore = await store.readCore();
  const latestTurn = readLatestConversationTurn(beforeCore, conversationId);
  assert.ok(latestTurn);
  assert.equal(latestTurn.status, 'completed');
  assert.equal(readTurnSegments(beforeCore, latestTurn.id).length, 1);

  const driftedState = structuredClone(dispatched.state);
  const driftedChannel = requireChannel(driftedState, channelId);
  driftedChannel.roomRouting.workflow.turnHistory = [];
  await store.write(driftedState);

  const afterCore = await store.readCore();
  const preservedTurn = afterCore.turns.find((turn) => turn.id === latestTurn.id) ?? null;
  assert.ok(preservedTurn);
  assert.equal(preservedTurn.status, 'completed');
  assert.equal(readTurnSegments(afterCore, latestTurn.id).length, 1);
});

test('resumeWorkflowContinuationReplay prefers full canonical assistant turns over surviving terminal transcript segments', async () => {
  const { state, channelId, agent1Id, agent2Id } = await createGroupChannelState();
  const store = new MemoryChatStore();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return {
        segments: [
          {
            kind: 'text',
            text: 'Agent-1 completed the first step. ',
            toolName: null,
            toolId: null,
          },
          {
            kind: 'text',
            text: 'Implementation notes included.',
            toolName: null,
            toolId: null,
          },
        ],
        inputTokens: 11,
        outputTokens: 9,
        tokensUsed: 20,
      };
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: '@Agent-1 take the first pass.' },
    runtimeClient,
    new Date('2026-04-15T00:20:45.000Z'),
    { chatStore: store },
  );
  await store.write(dispatched.state);

  const sourceMessages = requireChannel(dispatched.state, channelId).messages.filter((message) =>
    message.senderName === 'Agent-1'
    && message.metadata?.event === 'assistant_turn_segment');
  assert.equal(sourceMessages.length, 2);
  const sourceMessage = sourceMessages.at(-1);
  assert.ok(sourceMessage);

  const replayRuntimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-2')) {
      assert.match(
        content,
        /Latest routed handoff:\nAgent-1 completed the first step\. ?Implementation notes included\./u,
      );
      return usage('Agent-2 resumed from the surviving canonical handoff.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const replayResult = await resumeWorkflowContinuationReplay({
    request: buildWorkflowContinuationReplayRequest({
      channelId,
      checkpointId: 'checkpoint-replay-surviving-canonical-history',
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
      recordedAt: '2026-04-15T00:21:00.000Z',
    }),
    chatStore: store,
    runtimeClient: replayRuntimeClient,
    now: new Date('2026-04-15T00:21:30.000Z'),
  });

  assert.equal(replayResult.status, 'dispatched');
  assert.ok(
    requireChannel(await store.read(), channelId).messages.some((message) =>
      message.body === 'Agent-2 resumed from the surviving canonical handoff.'),
  );
  const replayCore = await store.readCore();
  const replayConversationId = buildChatConversationId(channelId);
  const replayTurn = readLatestConversationTurn(replayCore, replayConversationId);
  assert.match(
    replayTurn?.metadata.sourceMessageBody ?? '',
    /Agent-1 completed the first step\. ?Implementation notes included\./u,
  );
});

test('beginChannelMessageRetryDispatch can rebuild a missing user source from canonical turn metadata', async () => {
  const { state, channelId } = await createGroupChannelState();
  const store = new MemoryChatStore();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return usage('Agent-1 completed the retryable turn.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: '@Agent-1 create a retryable result.' },
    runtimeClient,
    new Date('2026-04-15T00:21:00.000Z'),
    { chatStore: store },
  );
  await store.write(dispatched.state);

  const originalUserMessage = requireChannel(dispatched.state, channelId).messages.find((message) =>
    message.senderKind === 'user'
    && message.body === '@Agent-1 create a retryable result.');
  assert.ok(originalUserMessage);

  const brokenState = structuredClone(dispatched.state);
  const brokenChannel = requireChannel(brokenState, channelId);
  brokenChannel.messages = brokenChannel.messages.filter((message) =>
    message.id !== originalUserMessage.id);
  await store.write(brokenState);

  const begun = await beginChannelMessageRetryDispatch(
    await store.read(),
    channelId,
    originalUserMessage.id,
    createNoopRuntimeClient(),
    new Date('2026-04-15T00:21:30.000Z'),
    {
      chatStore: store,
    },
  );

  assert.equal(begun.userMessage.id, originalUserMessage.id);
  assert.equal(begun.userMessage.body, '@Agent-1 create a retryable result.');
  assert.deepEqual(
    begun.preparedTurn?.initialResolution.targets.map((target) => target.participantName),
    ['Agent-1'],
  );
});

test('beginChannelMessageDispatch can route a choice response from canonical source segments after transcript drift', async () => {
  const { state, channelId } = await createGroupChannelState();
  const store = new MemoryChatStore();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return usage('Pick a style:\n```json\n{"choices":[{"question":"Which style?","options":[{"id":"minimal","label":"Minimal"}]}]}\n```');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: '@Agent-1 ask the style question.' },
    runtimeClient,
    new Date('2026-04-15T00:22:00.000Z'),
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
  await store.write(brokenState);

  const begun = await beginChannelMessageDispatch(
    await store.read(),
    channelId,
    {
      body: 'Q: Which style?\nA: Minimal',
      choiceResponse: {
        sourceMessageId: sourceMessage.id,
        status: 'submitted',
        submittedAt: '2026-04-15T00:22:30.000Z',
        answers: [
          {
            question: 'Which style?',
            selectedOptionIds: ['minimal'],
          },
        ],
      },
    },
    createNoopRuntimeClient(),
    new Date('2026-04-15T00:22:30.000Z'),
    {
      chatStore: store,
    },
  );

  assert.deepEqual(
    begun.preparedTurn?.initialResolution.targets.map((target) => target.participantName),
    ['Agent-1'],
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

test('repairOrphanedCompletedDispatchTurn can recover a blocked turn from canonical segments when the transcript reply is missing', async () => {
  const runtimeClient = createNoopRuntimeClient();
  const seededAt = new Date('2026-04-15T00:30:00.000Z');
  const responseAt = new Date('2026-04-15T00:30:06.000Z');
  const store = new MemoryChatStore();
  let state = await store.read();
  state = createChannel(
    state,
    {
      title: 'Repair canonical fallback',
      topic: 'Recover a completed turn from canonical interaction segments.',
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelId = state.selectedChannelId;
  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    { body: 'Please recover this completed reply from canonical state' },
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
      body: 'Recovered from canonical core.',
    },
    responseAt,
    {
      metadata: {
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-canonical-fallback',
        targetStateId: 'target-orchestrator-canonical-fallback',
        terminal: true,
        turnId: activeTurnId,
        targetKind: 'orchestrator',
        targetId: 'orchestrator',
        sessionId: 'session-canonical-fallback',
        routingTrigger: 'room_default',
        dispatchDepth: 0,
      },
    },
  ).state;

  const baselineRecovered = repairOrphanedCompletedDispatchTurn(
    repliedState,
    channelId,
    new Date('2026-04-15T00:30:30.000Z'),
  );
  assert.equal(baselineRecovered.repaired, true);
  await store.write(baselineRecovered.state);
  const canonicalCore = await store.readCore();

  const corruptedState = structuredClone(baselineRecovered.state);
  const corruptedChannel = requireChannel(corruptedState, channelId);
  corruptedChannel.messages = corruptedChannel.messages.filter((message) =>
    message.metadata?.assistantTurnId !== 'assistant-turn-canonical-fallback');
  const interruptedTurn = structuredClone(corruptedChannel.roomRouting.workflow.turnHistory[0]);
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
      id: 'guard-blocked-canonical-fallback',
      turnId: interruptedTurn.id,
      kind: 'guard_blocked',
      status: 'blocked',
      message: 'Recovered an interrupted room workflow after restart.',
      actor: null,
      sourceMessageId: null,
      targets: [],
      dispatchId: null,
      checkpointId: 'loop-guard-canonical-fallback',
      outcomeId: null,
      createdAt: responseAt.toISOString(),
      metadata: {
        recoverySource: 'server_restart',
      },
    },
    {
      id: 'outcome-blocked-canonical-fallback',
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
  corruptedChannel.roomRouting.workflow.turnHistory = [interruptedTurn];
  corruptedChannel.roomRouting.lastCheckpoint = {
    id: 'loop-guard-canonical-fallback',
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
    new Date('2026-04-15T00:31:00.000Z'),
    canonicalCore,
  );

  assert.equal(repaired.repaired, true);
  const repairedChannel = requireChannel(repaired.state, channelId);
  const repairedResponse = repairedChannel.messages.find((message) =>
    message.metadata?.assistantTurnId === 'assistant-turn-canonical-fallback');
  assert.ok(repairedResponse);
  assert.equal(repairedResponse?.body, 'Recovered from canonical core.');
  assert.equal(repairedChannel.roomRouting.workflow.activeTurn, null);
  assert.equal(repairedChannel.roomRouting.workflow.turnHistory[0]?.status, 'completed');
  assert.equal(repairedChannel.roomRouting.lastOutcome?.status, 'completed');
  assert.equal(repairedChannel.roomRouting.lastOutcome?.dispatches[0]?.status, 'completed');
});

test('applyChannelReadRepairs restores canonical reply and session metadata after transcript drift', async () => {
  const runtimeClient = createNoopRuntimeClient();
  const seededAt = new Date('2026-04-15T00:32:00.000Z');
  const responseAt = new Date('2026-04-15T00:32:06.000Z');
  const store = new MemoryChatStore();
  let state = await store.read();
  state = createChannel(
    state,
    {
      title: 'Repair chain canonical fallback',
      topic: 'Restore canonical reply and session metadata during read repair.',
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelId = state.selectedChannelId;
  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    { body: 'Please rebuild the missing transcript from canonical state.' },
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
      body: 'Recovered by the canonical read-repair chain.',
    },
    responseAt,
    {
      metadata: {
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-read-repair-chain',
        targetStateId: 'target-orchestrator-read-repair-chain',
        terminal: true,
        turnId: activeTurnId,
        targetKind: 'orchestrator',
        targetId: 'orchestrator',
        sessionId: 'session-read-repair-chain',
        routingTrigger: 'room_default',
        dispatchDepth: 0,
      },
    },
  ).state;

  const baselineRecovered = repairOrphanedCompletedDispatchTurn(
    repliedState,
    channelId,
    new Date('2026-04-15T00:32:30.000Z'),
  );
  assert.equal(baselineRecovered.repaired, true);
  await store.write(baselineRecovered.state);
  const canonicalCore = await store.readCore();

  const corruptedState = structuredClone(baselineRecovered.state);
  const corruptedChannel = requireChannel(corruptedState, channelId);
  corruptedChannel.messages = corruptedChannel.messages.filter((message) =>
    message.metadata?.assistantTurnId !== 'assistant-turn-read-repair-chain'
    && !(message.metadata?.event === 'session_started'
      && message.metadata?.sessionId === 'session-read-repair-chain'));
  const interruptedTurn = structuredClone(corruptedChannel.roomRouting.workflow.turnHistory[0]);
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
      id: 'guard-blocked-read-repair-chain',
      turnId: interruptedTurn.id,
      kind: 'guard_blocked',
      status: 'blocked',
      message: 'Recovered an interrupted room workflow after restart.',
      actor: null,
      sourceMessageId: null,
      targets: [],
      dispatchId: null,
      checkpointId: 'loop-guard-read-repair-chain',
      outcomeId: null,
      createdAt: responseAt.toISOString(),
      metadata: {
        recoverySource: 'server_restart',
      },
    },
    {
      id: 'outcome-blocked-read-repair-chain',
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
  corruptedChannel.roomRouting.workflow.turnHistory = [interruptedTurn];
  corruptedChannel.roomRouting.lastCheckpoint = {
    id: 'loop-guard-read-repair-chain',
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

  const repaired = applyChannelReadRepairs(corruptedState, channelId, {
    core: canonicalCore,
    now: new Date('2026-04-15T00:33:00.000Z'),
  });

  assert.equal(repaired.repaired, true);
  const repairedChannel = requireChannel(repaired.state, channelId);
  const sessionStartedIndex = repairedChannel.messages.findIndex((message) =>
    message.metadata?.event === 'session_started'
    && message.metadata?.sessionId === 'session-read-repair-chain');
  const responseIndex = repairedChannel.messages.findIndex((message) =>
    message.metadata?.assistantTurnId === 'assistant-turn-read-repair-chain');
  assert.equal(sessionStartedIndex >= 0, true);
  assert.equal(responseIndex >= 0, true);
  assert.equal(sessionStartedIndex < responseIndex, true);
  assert.equal(
    repairedChannel.messages[responseIndex]?.body,
    'Recovered by the canonical read-repair chain.',
  );
});

test('applyChannelReadRepairs upgrades a surviving terminal segment to the full canonical reply', async () => {
  const { state, channelId, agent1Id } = await createGroupChannelState();
  const seededAt = new Date('2026-04-15T00:34:00.000Z');
  const store = new MemoryChatStore();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return {
        segments: [
          {
            kind: 'text',
            text: 'Agent-1 completed the first step. ',
            toolName: null,
            toolId: null,
          },
          {
            kind: 'text',
            text: 'Implementation notes included.',
            toolName: null,
            toolId: null,
          },
        ],
        inputTokens: 11,
        outputTokens: 9,
        tokensUsed: 20,
      };
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    { body: '@Agent-1 take the first pass.' },
    runtimeClient,
    seededAt,
    { chatStore: store },
  );
  await store.write(dispatched.state);
  const canonicalCore = await store.readCore();

  const sourceMessages = requireChannel(dispatched.state, channelId).messages.filter((message) =>
    message.senderName === 'Agent-1'
    && message.metadata?.event === 'assistant_turn_segment');
  assert.equal(sourceMessages.length, 2);
  const survivingTerminalMessage = sourceMessages.at(-1);
  assert.ok(survivingTerminalMessage);

  const corruptedState = structuredClone(dispatched.state);
  const corruptedChannel = requireChannel(corruptedState, channelId);
  corruptedChannel.messages = corruptedChannel.messages.filter((message) =>
    message.id === survivingTerminalMessage.id
    || message.metadata?.assistantTurnId !== survivingTerminalMessage.metadata?.assistantTurnId);
  const participantAssignments = corruptedChannel.participantAssignments ?? [];
  const agent1Participant = participantAssignments.find((assignment) =>
    assignment.sourceKind === 'cat' && assignment.sourceRefId === agent1Id);
  assert.ok(agent1Participant);
  const interruptedTurn = structuredClone(corruptedChannel.roomRouting.workflow.turnHistory[0]);
  assert.ok(interruptedTurn);
  interruptedTurn.status = 'blocked';
  interruptedTurn.stageId = 'startup_recovery';
  interruptedTurn.completedAt = survivingTerminalMessage.createdAt;
  interruptedTurn.updatedAt = survivingTerminalMessage.createdAt;
  interruptedTurn.targetStatuses = [];
  interruptedTurn.events = interruptedTurn.events.filter((event) =>
    event.kind === 'turn_started' || event.kind === 'checkpoint');
  interruptedTurn.events.push(
    {
      id: 'guard-blocked-surviving-terminal-segment',
      turnId: interruptedTurn.id,
      kind: 'guard_blocked',
      status: 'blocked',
      message: 'Recovered an interrupted room workflow after restart.',
      actor: null,
      sourceMessageId: null,
      targets: [],
      dispatchId: null,
      checkpointId: 'loop-guard-surviving-terminal-segment',
      outcomeId: null,
      createdAt: survivingTerminalMessage.createdAt,
      metadata: {
        recoverySource: 'server_restart',
      },
    },
    {
      id: 'outcome-blocked-surviving-terminal-segment',
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
      createdAt: survivingTerminalMessage.createdAt,
      metadata: {
        recoverySource: 'server_restart',
      },
    },
  );
  corruptedChannel.roomRouting.workflow.activeTurn = null;
  corruptedChannel.roomRouting.workflow.turnHistory = [interruptedTurn];
  corruptedChannel.roomRouting.lastCheckpoint = {
    id: 'loop-guard-surviving-terminal-segment',
    kind: 'loop_guard',
    message: 'Recovered an interrupted room workflow after restart.',
    actor: null,
    sourceMessageId: null,
    targets: [],
    createdAt: survivingTerminalMessage.createdAt,
  };
  corruptedChannel.roomRouting.lastOutcome = {
    turnId: interruptedTurn.id,
    mode: corruptedChannel.roomRouting.mode,
    sourceMessageId: interruptedTurn.sourceMessageId,
    sourceSenderKind: interruptedTurn.sourceSenderKind,
    sourceSenderName: interruptedTurn.sourceSenderName,
    status: 'blocked',
    resolution: {
      routingMode: 'explicit_single',
      selectionKind: 'explicit_mentions',
      defaultTarget: null,
      defaultTargetReason: null,
      fallbackTarget: null,
      blockedReason: null,
      note: null,
    },
    resolvedTargets: [
      {
        participantKind: 'cat',
        participantId: agent1Participant.participantId,
        participantName: agent1Participant.name,
      },
    ],
    unresolvedMentions: [],
    dispatches: [],
    checkpoints: [],
    continuationCount: 0,
    totalDispatchCount: 0,
    guard: null,
    startedAt: interruptedTurn.startedAt,
    completedAt: interruptedTurn.completedAt,
  };

  const directRepair = repairOrphanedCompletedDispatchTurn(
    corruptedState,
    channelId,
    new Date('2026-04-15T00:34:15.000Z'),
    canonicalCore,
  );
  assert.equal(directRepair.repaired, true);
  const directlyRepairedChannel = requireChannel(directRepair.state, channelId);
  const directlyRepairedResponses = directlyRepairedChannel.messages.filter((message) =>
    message.metadata?.assistantTurnId === survivingTerminalMessage.metadata?.assistantTurnId);
  assert.equal(directlyRepairedResponses.length, 1);
  assert.match(
    directlyRepairedResponses[0]?.body ?? '',
    /Agent-1 completed the first step\. ?Implementation notes included\./u,
  );

  const repaired = applyChannelReadRepairs(corruptedState, channelId, {
    core: canonicalCore,
    now: new Date('2026-04-15T00:34:30.000Z'),
  });

  assert.equal(repaired.repaired, true);
  const repairedChannel = requireChannel(repaired.state, channelId);
  const repairedResponses = repairedChannel.messages.filter((message) =>
    message.metadata?.assistantTurnId === survivingTerminalMessage.metadata?.assistantTurnId);
  assert.equal(repairedResponses.length, 1);
  assert.equal(repairedResponses[0]?.id, survivingTerminalMessage.id);
  assert.match(
    repairedResponses[0]?.body ?? '',
    /Agent-1 completed the first step\. ?Implementation notes included\./u,
  );
  assert.equal(repairedChannel.roomRouting.workflow.activeTurn, null);
  assert.equal(repairedChannel.roomRouting.workflow.turnHistory[0]?.status, 'completed');
  assert.equal(repairedChannel.roomRouting.lastOutcome?.status, 'completed');
});

test('applyChannelReadRepairs restores canonical assistant metadata when rebuilding a partial transcript reply', async () => {
  const runtimeClient = createNoopRuntimeClient();
  const seededAt = new Date('2026-04-15T00:35:00.000Z');
  const responseAt = new Date('2026-04-15T00:35:06.000Z');
  const store = new MemoryChatStore();
  let state = await store.read();
  state = createChannel(
    state,
    {
      title: 'Repair canonical metadata fallback',
      topic: 'Recover assistant metadata from canonical interaction segments.',
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelId = state.selectedChannelId;
  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    { body: 'Please recover this rich canonical reply from partial transcript history.' },
    runtimeClient,
    seededAt,
  );
  const activeTurnId = requireChannel(begun.state, channelId).roomRouting.workflow.activeTurn?.id;
  assert.ok(activeTurnId);
  const repliedState = appendMessage(
    appendMessage(
      begun.state,
      channelId,
      {
        senderKind: 'orchestrator',
        senderName: 'Chat',
        body: 'Agent explored the repo. ',
      },
      responseAt,
      {
        metadata: {
          event: 'assistant_turn_segment',
          assistantTurnId: 'assistant-turn-read-repair-metadata',
          targetStateId: 'target-orchestrator-read-repair-metadata',
          turnId: activeTurnId,
          targetKind: 'orchestrator',
          targetId: 'orchestrator',
          sessionId: 'session-read-repair-metadata',
          routingTrigger: 'room_default',
          dispatchDepth: 0,
          precedingTools: [
            {
              toolName: 'search_repo',
              toolId: 'tool-search',
            },
          ],
        },
      },
    ).state,
    channelId,
    {
      senderKind: 'orchestrator',
      senderName: 'Chat',
      body: 'Continue with the next specialist.',
    },
    new Date('2026-04-15T00:35:07.000Z'),
    {
      metadata: {
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-read-repair-metadata',
        targetStateId: 'target-orchestrator-read-repair-metadata',
        terminal: true,
        turnId: activeTurnId,
        targetKind: 'orchestrator',
        targetId: 'orchestrator',
        sessionId: 'session-read-repair-metadata',
        routingTrigger: 'room_default',
        dispatchDepth: 0,
        precedingTools: [
          {
            toolName: 'plan_fix',
            toolId: 'tool-plan',
          },
        ],
        workflowRecommendation: {
          workflowShape: 'sequential',
          candidateTargets: [
            {
              participantKind: 'cat',
              participantId: 'agent-2',
              participantName: 'Agent-2',
            },
          ],
          branchStrategy: 'transplant_context',
        },
      },
    },
  ).state;

  const baselineRecovered = repairOrphanedCompletedDispatchTurn(
    repliedState,
    channelId,
    new Date('2026-04-15T00:35:30.000Z'),
  );
  assert.equal(baselineRecovered.repaired, true);
  await store.write(baselineRecovered.state);
  const canonicalCore = await store.readCore();
  const baselineResponseMessage = requireChannel(baselineRecovered.state, channelId).messages.find((message) =>
    message.metadata?.assistantTurnId === 'assistant-turn-read-repair-metadata'
    && message.metadata?.terminal === true);
  assert.ok(baselineResponseMessage);
  const canonicalMessage = buildCanonicalChatMessage(
    canonicalCore,
    channelId,
    baselineResponseMessage.id,
  );
  assert.ok(canonicalMessage);
  assert.deepEqual(canonicalMessage?.metadata?.precedingTools, [
    { toolName: 'search_repo', toolId: 'tool-search' },
    { toolName: 'plan_fix', toolId: 'tool-plan' },
  ]);
  assert.equal(canonicalMessage?.metadata?.workflowRecommendation?.workflowShape, 'sequential');

  const corruptedState = structuredClone(baselineRecovered.state);
  const corruptedChannel = requireChannel(corruptedState, channelId);
  corruptedChannel.messages = corruptedChannel.messages.filter((message) =>
    message.metadata?.assistantTurnId !== 'assistant-turn-read-repair-metadata'
    || message.metadata?.terminal === true);
  const interruptedTurn = structuredClone(corruptedChannel.roomRouting.workflow.turnHistory[0]);
  assert.ok(interruptedTurn);
  interruptedTurn.status = 'blocked';
  interruptedTurn.stageId = 'startup_recovery';
  interruptedTurn.completedAt = '2026-04-15T00:35:07.000Z';
  interruptedTurn.updatedAt = '2026-04-15T00:35:07.000Z';
  interruptedTurn.targetStatuses = [];
  interruptedTurn.events = interruptedTurn.events.filter((event) =>
    event.kind === 'turn_started' || event.kind === 'checkpoint');
  interruptedTurn.events.push(
    {
      id: 'guard-blocked-read-repair-metadata',
      turnId: interruptedTurn.id,
      kind: 'guard_blocked',
      status: 'blocked',
      message: 'Recovered an interrupted room workflow after restart.',
      actor: null,
      sourceMessageId: null,
      targets: [],
      dispatchId: null,
      checkpointId: 'loop-guard-read-repair-metadata',
      outcomeId: null,
      createdAt: '2026-04-15T00:35:07.000Z',
      metadata: {
        recoverySource: 'server_restart',
      },
    },
    {
      id: 'outcome-blocked-read-repair-metadata',
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
      createdAt: '2026-04-15T00:35:07.000Z',
      metadata: {
        recoverySource: 'server_restart',
      },
    },
  );
  corruptedChannel.roomRouting.workflow.activeTurn = null;
  corruptedChannel.roomRouting.workflow.turnHistory = [interruptedTurn];
  corruptedChannel.roomRouting.lastCheckpoint = {
    id: 'loop-guard-read-repair-metadata',
    kind: 'loop_guard',
    message: 'Recovered an interrupted room workflow after restart.',
    actor: null,
    sourceMessageId: null,
    targets: [],
    createdAt: '2026-04-15T00:35:07.000Z',
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
    completedAt: '2026-04-15T00:35:07.000Z',
  };

  const repaired = applyChannelReadRepairs(corruptedState, channelId, {
    core: canonicalCore,
    now: new Date('2026-04-15T00:35:45.000Z'),
  });

  assert.equal(repaired.repaired, true);
  const repairedChannel = requireChannel(repaired.state, channelId);
  const repairedResponse = repairedChannel.messages.find((message) =>
    message.metadata?.assistantTurnId === 'assistant-turn-read-repair-metadata');
  assert.ok(repairedResponse);
  assert.match(repairedResponse?.body ?? '', /Agent explored the repo\./u);
  assert.match(repairedResponse?.body ?? '', /Continue with the next specialist\./u);
  assert.deepEqual(repairedResponse?.metadata?.precedingTools, [
    { toolName: 'search_repo', toolId: 'tool-search' },
    { toolName: 'plan_fix', toolId: 'tool-plan' },
  ]);
  assert.equal(repairedResponse?.metadata?.workflowRecommendation?.workflowShape, 'sequential');
  assert.equal(
    repairedResponse?.metadata?.workflowRecommendation?.candidateTargets?.[0]?.participantName,
    'Agent-2',
  );
});

test('repairOrphanedCompletedDispatchTurn keeps a concurrent turn active when canonical core still has another live lane', async () => {
  const { state, channelId, agent1Id, agent2Id } = await createGroupChannelState();
  const store = new MemoryChatStore();
  const seededAt = new Date('2026-04-15T00:35:00.000Z');
  const responseAt = new Date('2026-04-15T00:35:06.000Z');
  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: 'Run both agents in parallel, but only one reply is visible so far.',
      messageMetadata: {
        recipientParticipantIds: [agent1Id, agent2Id],
        workflowShape: 'concurrent',
      },
    },
    createNoopRuntimeClient(),
    seededAt,
  );

  const projectedState = structuredClone(begun.state);
  const projectedChannel = requireChannel(projectedState, channelId);
  const activeTurn = projectedChannel.roomRouting.workflow.activeTurn;
  assert.ok(activeTurn);
  const turnStartedEvent = activeTurn.events.find((event) => event.kind === 'turn_started');
  assert.ok(turnStartedEvent);

  const agent1ParticipantId = projectedChannel.participantAssignments?.find((assignment) =>
    assignment.sourceKind === 'cat' && assignment.sourceRefId === agent1Id)?.participantId;
  const agent2ParticipantId = projectedChannel.participantAssignments?.find((assignment) =>
    assignment.sourceKind === 'cat' && assignment.sourceRefId === agent2Id)?.participantId;
  assert.ok(agent1ParticipantId);
  assert.ok(agent2ParticipantId);

  turnStartedEvent.targets = [
    {
      participantKind: 'cat',
      participantId: agent1ParticipantId,
      participantName: 'Agent-1',
    },
    {
      participantKind: 'cat',
      participantId: agent2ParticipantId,
      participantName: 'Agent-2',
    },
  ];
  activeTurn.workflowShape = 'concurrent';
  activeTurn.targetStatuses = [
    {
      id: 'target-agent-1-canonical-active-peer',
      dispatchId: 'dispatch-agent-1-canonical-active-peer',
      participant: {
        participantKind: 'cat',
        participantId: agent1ParticipantId,
        participantName: 'Agent-1',
      },
      source: null,
      sourceMessageId: activeTurn.sourceMessageId,
      trigger: 'explicit_mention',
      mentionNames: ['Agent-1', 'Agent-2'],
      depth: 0,
      parentCheckpointId: activeTurn.lastCheckpointId,
      branchStrategy: 'transplant_context',
      handoffReason: 'explicit_mention',
      wakeRequestId: null,
      status: 'completed',
      queuedAt: seededAt.toISOString(),
      startedAt: seededAt.toISOString(),
      completedAt: responseAt.toISOString(),
      response: {
        assistantTurnId: 'assistant-turn-agent-1-canonical-active-peer',
        messageIds: ['message-agent-1-canonical-active-peer'],
        fullText: 'Agent-1 finished, but Agent-2 is still running.',
        segmentCount: 1,
      },
      error: null,
    },
    {
      id: 'target-agent-2-canonical-active-peer',
      dispatchId: 'dispatch-agent-2-canonical-active-peer',
      participant: {
        participantKind: 'cat',
        participantId: agent2ParticipantId,
        participantName: 'Agent-2',
      },
      source: null,
      sourceMessageId: activeTurn.sourceMessageId,
      trigger: 'explicit_mention',
      mentionNames: ['Agent-1', 'Agent-2'],
      depth: 0,
      parentCheckpointId: activeTurn.lastCheckpointId,
      branchStrategy: 'transplant_context',
      handoffReason: 'explicit_mention',
      wakeRequestId: null,
      status: 'running',
      queuedAt: seededAt.toISOString(),
      startedAt: responseAt.toISOString(),
      completedAt: null,
      response: null,
      error: null,
    },
  ];

  const repliedState = appendMessage(
    projectedState,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'Agent-1',
      body: 'Agent-1 finished, but Agent-2 is still running.',
    },
    responseAt,
    {
      metadata: {
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-agent-1-canonical-active-peer',
        targetStateId: 'target-agent-1-canonical-active-peer',
        terminal: true,
        turnId: activeTurn.id,
        targetKind: 'cat',
        targetId: agent1ParticipantId,
        routingTrigger: 'explicit_mention',
        dispatchDepth: 0,
        segmentIndex: 0,
      },
      incrementUnread: false,
    },
  ).state;

  await store.write(repliedState);
  const canonicalCore = await store.readCore();
  const conversationId = buildChatConversationId(channelId);
  const turn = readLatestConversationTurn(canonicalCore, conversationId);
  assert.ok(turn);
  const lanes = readOrderedTurnLanes(canonicalCore, turn.id);
  assert.deepEqual(
    lanes.map((lane) => lane.status),
    ['completed', 'connecting'],
  );

  const corruptedState = structuredClone(repliedState);
  const corruptedChannel = requireChannel(corruptedState, channelId);
  const corruptedTurn = corruptedChannel.roomRouting.workflow.activeTurn;
  assert.ok(corruptedTurn);
  corruptedTurn.targetStatuses = [];

  const repaired = repairOrphanedCompletedDispatchTurn(
    corruptedState,
    channelId,
    new Date('2026-04-15T00:35:30.000Z'),
    canonicalCore,
  );

  assert.equal(repaired.repaired, false);
  const repairedChannel = requireChannel(repaired.state, channelId);
  assert.equal(repairedChannel.roomRouting.workflow.activeTurn?.id, turn.id);
});

test('repairOrphanedCompletedDispatchTurn restores final sequential target metadata from canonical lanes', async () => {
  const { state, channelId, agent1Id, agent2Id } = await createGroupChannelState();
  const store = new MemoryChatStore();
  const seededAt = new Date('2026-04-15T00:40:00.000Z');
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return usage('@Agent-2 carry the sequential fix forward.');
    }
    if (content.includes('You are Agent-2')) {
      return usage('Agent-2 finished the repaired sequential step.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Handle this in sequence.',
      messageMetadata: {
        recipientParticipantIds: [agent1Id, agent2Id],
        workflowShape: 'sequential',
      },
    },
    runtimeClient,
    seededAt,
    { chatStore: store },
  );

  await store.write(dispatched.state);
  const canonicalCore = await store.readCore();
  const conversationId = buildChatConversationId(channelId);
  const turn = readLatestConversationTurn(canonicalCore, conversationId);
  assert.ok(turn);
  const lanes = readOrderedTurnLanes(canonicalCore, turn.id);
  assert.equal(lanes.length, 2);
  const repairedLane = lanes[1];
  assert.ok(repairedLane);
  assert.equal(repairedLane?.metadata.trigger, 'continuation_mention');
  assert.equal(repairedLane?.metadata.branchStrategy, 'transplant_context');
  assert.ok(typeof repairedLane?.metadata.sourceMessageId === 'string');
  assert.equal(repairedLane?.metadata.handoffReason, 'workflow_continuation');

  const corruptedState = structuredClone(dispatched.state);
  const corruptedChannel = requireChannel(corruptedState, channelId);
  const interruptedTurn = structuredClone(corruptedChannel.roomRouting.workflow.turnHistory[0]);
  assert.ok(interruptedTurn);
  interruptedTurn.status = 'blocked';
  interruptedTurn.stageId = 'startup_recovery';
  interruptedTurn.targetStatuses = [];
  interruptedTurn.events = interruptedTurn.events.filter((event) =>
    event.kind === 'turn_started' || event.kind === 'checkpoint');
  interruptedTurn.events.push(
    {
      id: 'guard-blocked-sequential-final-lane',
      turnId: interruptedTurn.id,
      kind: 'guard_blocked',
      status: 'blocked',
      message: 'Recovered an interrupted room workflow after restart.',
      actor: null,
      sourceMessageId: null,
      targets: [],
      dispatchId: null,
      checkpointId: 'loop-guard-sequential-final-lane',
      outcomeId: null,
      createdAt: interruptedTurn.completedAt ?? turn.completedAt ?? seededAt.toISOString(),
      metadata: {
        recoverySource: 'server_restart',
      },
    },
    {
      id: 'outcome-blocked-sequential-final-lane',
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
      createdAt: interruptedTurn.completedAt ?? turn.completedAt ?? seededAt.toISOString(),
      metadata: {
        recoverySource: 'server_restart',
      },
    },
  );
  corruptedChannel.roomRouting.workflow.activeTurn = null;
  corruptedChannel.roomRouting.workflow.turnHistory = [interruptedTurn];
  corruptedChannel.roomRouting.lastCheckpoint = {
    id: 'loop-guard-sequential-final-lane',
    kind: 'loop_guard',
    message: 'Recovered an interrupted room workflow after restart.',
    actor: null,
    sourceMessageId: null,
    targets: [],
    createdAt: interruptedTurn.completedAt ?? turn.completedAt ?? seededAt.toISOString(),
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
      defaultTarget: null,
      defaultTargetReason: 'boss_chat_default',
      fallbackTarget: null,
      blockedReason: null,
      note: null,
    },
    resolvedTargets: [],
    unresolvedMentions: [],
    dispatches: [],
    checkpoints: [],
    continuationCount: 0,
    totalDispatchCount: 0,
    guard: null,
    startedAt: interruptedTurn.startedAt,
    completedAt: interruptedTurn.completedAt,
  };

  const repaired = repairOrphanedCompletedDispatchTurn(
    corruptedState,
    channelId,
    new Date('2026-04-15T00:41:00.000Z'),
    canonicalCore,
  );

  assert.equal(repaired.repaired, true);
  const repairedChannel = requireChannel(repaired.state, channelId);
  const repairedTurn = repairedChannel.roomRouting.workflow.turnHistory[0];
  assert.ok(repairedTurn);
  assert.equal(repairedTurn.status, 'completed');
  const repairedTarget = repairedTurn.targetStatuses[0];
  assert.ok(repairedTarget);
  assert.equal(repairedTarget.participant.participantName, 'Agent-2');
  assert.equal(repairedTarget.source?.participantName, 'Agent-1');
  assert.equal(repairedTarget.sourceMessageId, repairedLane?.metadata.sourceMessageId);
  assert.equal(repairedTarget.branchStrategy, repairedLane?.metadata.branchStrategy);
  assert.equal(repairedTarget.handoffReason, repairedLane?.metadata.handoffReason);
  const repairedDispatch = repairedChannel.roomRouting.lastOutcome?.dispatches[0];
  assert.ok(repairedDispatch);
  assert.equal(repairedDispatch?.source?.participantName, 'Agent-1');
  assert.equal(repairedDispatch?.sourceMessageId, repairedLane?.metadata.sourceMessageId);
  assert.equal(repairedDispatch?.trigger, repairedLane?.metadata.trigger);
});

test('repairOrphanedCompletedDispatchTurn keeps a startup-recovered sequential continuation blocked when later queued targets only exist in continuation checkpoints', async () => {
  let { state, channelId, agent1Id, agent2Id } = await createGroupChannelState();
  const seededAt = new Date('2026-04-15T00:42:00.000Z');

  state = createCat(
    state,
    {
      name: 'Agent-3',
      provider: 'codex',
      roles: ['verifier'],
    },
    seededAt,
  );
  const agent3Id = state.cats[0].id;
  state = assignCatToChannel(
    state,
    channelId,
    {
      catId: agent3Id,
      provider: 'codex',
      roles: ['verifier'],
    },
    seededAt,
  );

  const store = new MemoryChatStore();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return usage('@Agent-2 carry the sequential fix forward.');
    }
    if (content.includes('You are Agent-2')) {
      return usage('Agent-2 completed the recovered step.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Handle this in sequence.',
      messageMetadata: {
        recipientParticipantIds: [agent1Id, agent2Id],
        workflowShape: 'sequential',
      },
    },
    runtimeClient,
    seededAt,
    { chatStore: store },
  );

  await store.write(dispatched.state);
  const canonicalCore = await store.readCore();
  const conversationId = buildChatConversationId(channelId);
  const turn = readLatestConversationTurn(canonicalCore, conversationId);
  assert.ok(turn);
  const lanes = readOrderedTurnLanes(canonicalCore, turn.id);
  assert.equal(lanes.length, 2);
  const repairedLane = lanes[1];
  assert.ok(repairedLane);
  assert.equal(repairedLane?.metadata.trigger, 'continuation_mention');

  const corruptedState = structuredClone(dispatched.state);
  const corruptedChannel = requireChannel(corruptedState, channelId);
  const participantAssignments = corruptedChannel.participantAssignments ?? [];
  const agent1Participant = participantAssignments.find((assignment) =>
    assignment.sourceKind === 'cat' && assignment.sourceRefId === agent1Id);
  const agent2Participant = participantAssignments.find((assignment) =>
    assignment.sourceKind === 'cat' && assignment.sourceRefId === agent2Id);
  const agent3Participant = participantAssignments.find((assignment) =>
    assignment.sourceKind === 'cat' && assignment.sourceRefId === agent3Id);
  assert.ok(agent1Participant);
  assert.ok(agent2Participant);
  assert.ok(agent3Participant);
  const interruptedTurn = structuredClone(corruptedChannel.roomRouting.workflow.turnHistory[0]);
  assert.ok(interruptedTurn);
  interruptedTurn.status = 'blocked';
  interruptedTurn.stageId = 'startup_recovery';
  interruptedTurn.targetStatuses = [];
  interruptedTurn.events = interruptedTurn.events.filter((event) =>
    event.kind === 'turn_started' || event.kind === 'checkpoint');
  interruptedTurn.events.push(
    {
      id: 'checkpoint-later-sequential-queued-target',
      turnId: interruptedTurn.id,
      kind: 'checkpoint',
      status: 'running',
      message: 'Agent-1 handed the room forward to Agent-2, then Agent-3.',
      actor: {
        participantKind: 'cat',
        participantId: agent1Participant.participantId,
        participantName: agent1Participant.name,
      },
      sourceMessageId: repairedLane?.metadata.sourceMessageId,
      targets: [
        {
          participantKind: 'cat',
          participantId: agent2Participant.participantId,
          participantName: agent2Participant.name,
        },
        {
          participantKind: 'cat',
          participantId: agent3Participant.participantId,
          participantName: agent3Participant.name,
        },
      ],
      dispatchId: null,
      checkpointId: 'checkpoint-later-sequential-queued-target',
      outcomeId: null,
      createdAt: interruptedTurn.completedAt ?? turn.completedAt ?? seededAt.toISOString(),
      metadata: {
        checkpointKind: 'continuation',
        mentionNames: ['Agent-2', 'Agent-3'],
        workflowStageId: 'continuation_handoff',
        workflowShape: 'sequential',
        branchStrategy: 'transplant_context',
        handoffReason: 'workflow_continuation',
        continuationSource: 'explicit_mentions',
      },
    },
    {
      id: 'guard-blocked-later-sequential-queued-target',
      turnId: interruptedTurn.id,
      kind: 'guard_blocked',
      status: 'blocked',
      message: 'Recovered an interrupted room workflow after restart.',
      actor: null,
      sourceMessageId: null,
      targets: [],
      dispatchId: null,
      checkpointId: 'loop-guard-later-sequential-queued-target',
      outcomeId: null,
      createdAt: interruptedTurn.completedAt ?? turn.completedAt ?? seededAt.toISOString(),
      metadata: {
        recoverySource: 'server_restart',
      },
    },
    {
      id: 'outcome-blocked-later-sequential-queued-target',
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
      createdAt: interruptedTurn.completedAt ?? turn.completedAt ?? seededAt.toISOString(),
      metadata: {
        recoverySource: 'server_restart',
      },
    },
  );
  corruptedChannel.roomRouting.workflow.activeTurn = null;
  corruptedChannel.roomRouting.workflow.turnHistory = [interruptedTurn];
  corruptedChannel.roomRouting.lastCheckpoint = {
    id: 'loop-guard-later-sequential-queued-target',
    kind: 'loop_guard',
    message: 'Recovered an interrupted room workflow after restart.',
    actor: null,
    sourceMessageId: null,
    targets: [],
    createdAt: interruptedTurn.completedAt ?? turn.completedAt ?? seededAt.toISOString(),
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
      defaultTarget: null,
      defaultTargetReason: 'boss_chat_default',
      fallbackTarget: null,
      blockedReason: null,
      note: null,
    },
    resolvedTargets: [],
    unresolvedMentions: [],
    dispatches: [],
    checkpoints: [],
    continuationCount: 0,
    totalDispatchCount: 0,
    guard: null,
    startedAt: interruptedTurn.startedAt,
    completedAt: interruptedTurn.completedAt,
  };

  const repaired = repairOrphanedCompletedDispatchTurn(
    corruptedState,
    channelId,
    new Date('2026-04-15T00:43:00.000Z'),
    canonicalCore,
  );

  assert.equal(repaired.repaired, false);
  const repairedChannel = requireChannel(repaired.state, channelId);
  assert.equal(repairedChannel.roomRouting.workflow.activeTurn, null);
  assert.equal(repairedChannel.roomRouting.workflow.turnHistory[0]?.status, 'blocked');
  assert.equal(repairedChannel.roomRouting.lastOutcome?.status, 'blocked');
});

test('applyChannelReadRepairs keeps startup-recovered later sequential queues blocked while inserting the interruption notice', async () => {
  let { state, channelId, agent1Id, agent2Id } = await createGroupChannelState();
  const seededAt = new Date('2026-04-15T00:44:00.000Z');

  state = createCat(
    state,
    {
      name: 'Agent-3',
      provider: 'codex',
      roles: ['verifier'],
    },
    seededAt,
  );
  const agent3Id = state.cats[0].id;
  state = assignCatToChannel(
    state,
    channelId,
    {
      catId: agent3Id,
      provider: 'codex',
      roles: ['verifier'],
    },
    seededAt,
  );

  const store = new MemoryChatStore();
  const runtimeClient = createRuntimeStub(async ({ content }) => {
    if (content.includes('You are Agent-1')) {
      return usage('@Agent-2 carry the sequential fix forward.');
    }
    if (content.includes('You are Agent-2')) {
      return usage('Agent-2 completed the recovered step.');
    }
    throw new Error(`Unexpected prompt:\n${content}`);
  });

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Handle this in sequence.',
      messageMetadata: {
        recipientParticipantIds: [agent1Id, agent2Id],
        workflowShape: 'sequential',
      },
    },
    runtimeClient,
    seededAt,
    { chatStore: store },
  );

  await store.write(dispatched.state);
  const canonicalCore = await store.readCore();
  const conversationId = buildChatConversationId(channelId);
  const turn = readLatestConversationTurn(canonicalCore, conversationId);
  assert.ok(turn);
  const lanes = readOrderedTurnLanes(canonicalCore, turn.id);
  const repairedLane = lanes[1];
  assert.ok(repairedLane);

  const corruptedState = appendMessage(
    structuredClone(dispatched.state),
    channelId,
    {
      senderKind: 'user',
      senderName: 'Owner',
      body: 'Follow-up after the interrupted continuation.',
    },
    new Date('2026-04-15T00:44:30.000Z'),
  ).state;
  const corruptedChannel = requireChannel(corruptedState, channelId);
  const participantAssignments = corruptedChannel.participantAssignments ?? [];
  const agent1Participant = participantAssignments.find((assignment) =>
    assignment.sourceKind === 'cat' && assignment.sourceRefId === agent1Id);
  const agent2Participant = participantAssignments.find((assignment) =>
    assignment.sourceKind === 'cat' && assignment.sourceRefId === agent2Id);
  const agent3Participant = participantAssignments.find((assignment) =>
    assignment.sourceKind === 'cat' && assignment.sourceRefId === agent3Id);
  assert.ok(agent1Participant);
  assert.ok(agent2Participant);
  assert.ok(agent3Participant);
  const interruptedTurn = structuredClone(corruptedChannel.roomRouting.workflow.turnHistory[0]);
  assert.ok(interruptedTurn);
  interruptedTurn.status = 'blocked';
  interruptedTurn.stageId = 'startup_recovery';
  interruptedTurn.targetStatuses = [];
  interruptedTurn.events = interruptedTurn.events.filter((event) =>
    event.kind === 'turn_started' || event.kind === 'checkpoint');
  interruptedTurn.events.push(
    {
      id: 'checkpoint-later-sequential-read-repair',
      turnId: interruptedTurn.id,
      kind: 'checkpoint',
      status: 'running',
      message: 'Agent-1 handed the room forward to Agent-2, then Agent-3.',
      actor: {
        participantKind: 'cat',
        participantId: agent1Participant.participantId,
        participantName: agent1Participant.name,
      },
      sourceMessageId: repairedLane?.metadata.sourceMessageId,
      targets: [
        {
          participantKind: 'cat',
          participantId: agent2Participant.participantId,
          participantName: agent2Participant.name,
        },
        {
          participantKind: 'cat',
          participantId: agent3Participant.participantId,
          participantName: agent3Participant.name,
        },
      ],
      dispatchId: null,
      checkpointId: 'checkpoint-later-sequential-read-repair',
      outcomeId: null,
      createdAt: interruptedTurn.completedAt ?? turn.completedAt ?? seededAt.toISOString(),
      metadata: {
        checkpointKind: 'continuation',
        mentionNames: ['Agent-2', 'Agent-3'],
        workflowStageId: 'continuation_handoff',
        workflowShape: 'sequential',
        branchStrategy: 'transplant_context',
        handoffReason: 'workflow_continuation',
        continuationSource: 'explicit_mentions',
      },
    },
    {
      id: 'guard-blocked-later-sequential-read-repair',
      turnId: interruptedTurn.id,
      kind: 'guard_blocked',
      status: 'blocked',
      message: 'Recovered an interrupted room workflow after restart.',
      actor: null,
      sourceMessageId: null,
      targets: [],
      dispatchId: null,
      checkpointId: 'loop-guard-later-sequential-read-repair',
      outcomeId: null,
      createdAt: interruptedTurn.completedAt ?? turn.completedAt ?? seededAt.toISOString(),
      metadata: {
        recoverySource: 'server_restart',
      },
    },
    {
      id: 'outcome-blocked-later-sequential-read-repair',
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
      createdAt: interruptedTurn.completedAt ?? turn.completedAt ?? seededAt.toISOString(),
      metadata: {
        recoverySource: 'server_restart',
      },
    },
  );
  corruptedChannel.roomRouting.workflow.activeTurn = null;
  corruptedChannel.roomRouting.workflow.turnHistory = [interruptedTurn];
  corruptedChannel.roomRouting.lastCheckpoint = {
    id: 'loop-guard-later-sequential-read-repair',
    kind: 'loop_guard',
    message: 'Recovered an interrupted room workflow after restart.',
    actor: null,
    sourceMessageId: null,
    targets: [],
    createdAt: interruptedTurn.completedAt ?? turn.completedAt ?? seededAt.toISOString(),
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
      defaultTarget: null,
      defaultTargetReason: 'boss_chat_default',
      fallbackTarget: null,
      blockedReason: null,
      note: null,
    },
    resolvedTargets: [],
    unresolvedMentions: [],
    dispatches: [],
    checkpoints: [],
    continuationCount: 0,
    totalDispatchCount: 0,
    guard: null,
    startedAt: interruptedTurn.startedAt,
    completedAt: interruptedTurn.completedAt,
  };

  const repaired = applyChannelReadRepairs(corruptedState, channelId, {
    core: canonicalCore,
    now: new Date('2026-04-15T00:45:00.000Z'),
  });

  assert.equal(repaired.repaired, true);
  const repairedChannel = requireChannel(repaired.state, channelId);
  const noticeIndex = repairedChannel.messages.findIndex((message) =>
    message.metadata?.event === 'workflow_interrupted'
    && message.metadata?.turnId === interruptedTurn.id);
  const nextUserIndex = repairedChannel.messages.findIndex((message) =>
    message.body === 'Follow-up after the interrupted continuation.');
  assert.ok(noticeIndex >= 0);
  assert.ok(nextUserIndex > noticeIndex);
  assert.equal(repairedChannel.roomRouting.workflow.activeTurn, null);
  assert.equal(repairedChannel.roomRouting.workflow.turnHistory[0]?.status, 'blocked');
  assert.equal(repairedChannel.roomRouting.lastOutcome?.status, 'blocked');
});
