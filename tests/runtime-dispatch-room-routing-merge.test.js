import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendMessage,
  createChannel,
  requireChannel,
} from '../build/server/products/chat/state/model/index.js';
import { createAsyncKeyedGate } from '../build/server/products/chat/shared/asyncControl.js';
import {
  beginChannelMessageDispatch,
  settleBegunChannelMessageDispatchFailure,
} from '../build/server/products/chat/state/runtimeActions.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import {
  createMergedDispatchChatStore,
  mergeCompletedDispatchState,
} from '../build/server/products/chat/state/runtime-dispatch/merge.js';
import { repairOrphanedCompletedDispatchTurn } from '../build/server/products/chat/state/runtime-dispatch/repair.js';

function createNoopRuntimeClient() {
  return {
    async closeSession() {},
  };
}

test('mergeCompletedDispatchState preserves newer room-routing config while applying dispatch workflow updates', async () => {
  const chatStore = new MemoryChatStore();
  const runtimeClient = createNoopRuntimeClient();
  const seededAt = new Date('2026-04-03T12:00:00.000Z');
  const dispatchAt = new Date('2026-04-03T12:00:05.000Z');
  let state = await chatStore.read();
  state = createChannel(
    state,
    {
      title: 'Room routing merge',
      topic: 'Preserve config while keeping workflow progress.',
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelId = state.selectedChannelId;
  const baselineState = structuredClone(state);
  const begun = await beginChannelMessageDispatch(
    baselineState,
    channelId,
    { body: 'First routing turn' },
    runtimeClient,
    dispatchAt,
  );

  const latestState = structuredClone(baselineState);
  const latestChannel = requireChannel(latestState, channelId);
  latestChannel.roomRouting.maxDispatchesPerTurn += 3;
  latestChannel.roomRouting.defaultRecipientId = 'cat-owner-updated-routing';

  const mergedState = mergeCompletedDispatchState(
    latestState,
    baselineState,
    begun.state,
    channelId,
    dispatchAt,
  );
  const mergedChannel = requireChannel(mergedState, channelId);
  const dispatchChannel = requireChannel(begun.state, channelId);

  assert.equal(
    mergedChannel.roomRouting.maxDispatchesPerTurn,
    latestChannel.roomRouting.maxDispatchesPerTurn,
  );
  assert.equal(
    mergedChannel.roomRouting.defaultRecipientId,
    'cat-owner-updated-routing',
  );
  assert.deepEqual(
    mergedChannel.roomRouting.workflow,
    dispatchChannel.roomRouting.workflow,
  );
  assert.deepEqual(
    mergedChannel.roomRouting.lastOutcome,
    dispatchChannel.roomRouting.lastOutcome,
  );
  assert.deepEqual(
    mergedChannel.roomRouting.lastCheckpoint,
    dispatchChannel.roomRouting.lastCheckpoint,
  );
});

test('settleBegunChannelMessageDispatchFailure preserves a newer room-routing workflow snapshot', async () => {
  const chatStore = new MemoryChatStore();
  const runtimeClient = createNoopRuntimeClient();
  const seededAt = new Date('2026-04-03T12:10:00.000Z');
  const firstDispatchAt = new Date('2026-04-03T12:10:05.000Z');
  const secondDispatchAt = new Date('2026-04-03T12:10:10.000Z');
  const failureAt = new Date('2026-04-03T12:10:15.000Z');
  let state = await chatStore.read();
  state = createChannel(
    state,
    {
      title: 'Room routing failure merge',
      topic: 'Do not overwrite newer workflow state on failure.',
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelId = state.selectedChannelId;

  const firstBegun = await beginChannelMessageDispatch(
    state,
    channelId,
    { body: 'First turn should fail later' },
    runtimeClient,
    firstDispatchAt,
  );
  const secondBegun = await beginChannelMessageDispatch(
    firstBegun.state,
    channelId,
    { body: 'Second turn is newer' },
    runtimeClient,
    secondDispatchAt,
  );
  const latestChannelBeforeSettle = requireChannel(secondBegun.state, channelId);

  const settled = await settleBegunChannelMessageDispatchFailure(
    firstBegun,
    channelId,
    new Error('Injected runtime failure'),
    failureAt,
    {
      latestState: secondBegun.state,
    },
  );
  const settledChannel = requireChannel(settled.state, channelId);

  assert.deepEqual(
    settledChannel.roomRouting.workflow,
    latestChannelBeforeSettle.roomRouting.workflow,
  );
  assert.deepEqual(
    settledChannel.roomRouting.lastOutcome,
    latestChannelBeforeSettle.roomRouting.lastOutcome,
  );
  assert.deepEqual(
    settledChannel.roomRouting.lastCheckpoint,
    latestChannelBeforeSettle.roomRouting.lastCheckpoint,
  );
  assert.ok(
    settledChannel.messages.some((message) =>
      message.metadata?.event === 'runtime_error'
      && /Injected runtime failure/u.test(message.body)),
  );
});

test('mergeCompletedDispatchState treats overlapping workflow mutations as latest-wins', async () => {
  const chatStore = new MemoryChatStore();
  const runtimeClient = createNoopRuntimeClient();
  const seededAt = new Date('2026-04-03T12:20:00.000Z');
  const dispatchAt = new Date('2026-04-03T12:20:05.000Z');
  let state = await chatStore.read();
  state = createChannel(
    state,
    {
      title: 'Workflow latest wins',
      topic: 'Keep the newer workflow snapshot when both sides changed.',
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelId = state.selectedChannelId;
  const baselineState = structuredClone(state);
  const dispatchState = await beginChannelMessageDispatch(
    baselineState,
    channelId,
    { body: 'First overlapping workflow turn' },
    runtimeClient,
    dispatchAt,
  );

  const latestState = structuredClone(dispatchState.state);
  const latestWorkflow = latestState.channels.find((channel) => channel.id === channelId)?.roomRouting?.workflow;
  assert.ok(latestWorkflow?.activeTurn);
  latestWorkflow.activeTurn.stageId = 'newer_dispatch_stage';
  latestWorkflow.activeTurn.updatedAt = '2026-04-03T12:20:06.000Z';

  const mergedState = mergeCompletedDispatchState(
    latestState,
    baselineState,
    dispatchState.state,
    channelId,
    dispatchAt,
  );
  const mergedWorkflow = requireChannel(mergedState, channelId).roomRouting.workflow;

  assert.equal(mergedWorkflow.activeTurn?.stageId, 'newer_dispatch_stage');
  assert.equal(mergedWorkflow.activeTurn?.updatedAt, '2026-04-03T12:20:06.000Z');
});

test('mergeCompletedDispatchState preserves temporary participant execution leases', async () => {
  const chatStore = new MemoryChatStore();
  const seededAt = new Date('2026-04-08T12:00:00.000Z');
  let state = await chatStore.read();
  state = createChannel(
    state,
    {
      title: 'Temporary participant merge',
      topic: 'Keep adhoc participant session leases while dispatch state merges.',
      entryKind: 'group',
      skipBossCatGreeting: true,
      defaultRecipientId: 'participant-inline',
      temporaryParticipants: [
        {
          participantId: 'participant-inline',
          name: 'Inline Reviewer',
          provider: 'claude',
          instance: 'native',
          model: 'claude-opus-4-6',
          modelSelection: null,
          roleHint: 'Primary review pass.',
        },
      ],
    },
    seededAt,
  );
  const channelId = state.selectedChannelId;
  const baselineState = structuredClone(state);
  const latestState = structuredClone(state);
  const dispatchState = structuredClone(state);
  const dispatchParticipant = requireChannel(dispatchState, channelId).participantAssignments.find(
    (assignment) => assignment.participantId === 'participant-inline',
  );
  assert.ok(dispatchParticipant);
  dispatchParticipant.execution.lease = {
    sessionId: 'session-inline',
    status: 'ready',
    cwd: 'C:/repo/cats-platform',
    lastError: null,
    provider: 'claude',
    model: 'claude-opus-4-6',
    startedAt: '2026-04-08T12:00:05.000Z',
    lastUsedAt: '2026-04-08T12:00:05.000Z',
  };

  const mergedState = mergeCompletedDispatchState(
    latestState,
    baselineState,
    dispatchState,
    channelId,
    seededAt,
  );
  const mergedParticipant = requireChannel(mergedState, channelId).participantAssignments.find(
    (assignment) => assignment.participantId === 'participant-inline',
  );
  assert.equal(mergedParticipant?.execution.lease.sessionId, 'session-inline');
  assert.equal(mergedParticipant?.execution.lease.status, 'ready');
});

test('createMergedDispatchChatStore serializes cross-channel writes so parallel dispatches do not clobber each other', async () => {
  const runtimeClient = createNoopRuntimeClient();
  const seededAt = new Date('2026-04-09T12:00:00.000Z');
  const dispatchAt = new Date('2026-04-09T12:00:05.000Z');
  const stateStore = new MemoryChatStore();
  let state = await stateStore.read();
  state = createChannel(
    state,
    {
      title: 'Parallel member A',
      topic: 'First parallel member.',
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelAId = state.selectedChannelId;
  state = createChannel(
    state,
    {
      title: 'Parallel member B',
      topic: 'Second parallel member.',
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelBId = state.selectedChannelId;
  const baselineState = structuredClone(state);

  const begunA = await beginChannelMessageDispatch(
    baselineState,
    channelAId,
    { body: 'Dispatch A' },
    runtimeClient,
    dispatchAt,
  );
  const begunB = await beginChannelMessageDispatch(
    baselineState,
    channelBId,
    { body: 'Dispatch B' },
    runtimeClient,
    dispatchAt,
  );

  let latestState = structuredClone(baselineState);
  const observedReads = [];
  const chatStore = {
    async read() {
      observedReads.push(structuredClone(latestState));
      return structuredClone(latestState);
    },
    async write(nextState) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      latestState = structuredClone(nextState);
      return structuredClone(latestState);
    },
    async readCore() {
      return {};
    },
    async writeCore(nextCore) {
      return nextCore;
    },
  };
  const mutationGate = createAsyncKeyedGate();
  const mergedStoreA = createMergedDispatchChatStore({
    chatStore,
    mutationGate,
    channelId: channelAId,
    baselineState,
    now: () => dispatchAt,
  });
  const mergedStoreB = createMergedDispatchChatStore({
    chatStore,
    mutationGate,
    channelId: channelBId,
    baselineState,
    now: () => dispatchAt,
  });

  await Promise.all([
    mergedStoreA.write(begunA.state),
    mergedStoreB.write(begunB.state),
  ]);

  const channelA = requireChannel(latestState, channelAId);
  const channelB = requireChannel(latestState, channelBId);
  assert.equal(channelA.messages.at(-1)?.body, 'Dispatch A');
  assert.equal(channelB.messages.at(-1)?.body, 'Dispatch B');
  assert.ok(channelA.roomRouting.workflow.activeTurn);
  assert.ok(channelB.roomRouting.workflow.activeTurn);
  assert.equal(observedReads.length, 2);
  assert.equal(
    requireChannel(observedReads[1], channelAId).messages.at(-1)?.body,
    'Dispatch A',
  );
});

test('repairOrphanedCompletedDispatchTurn restores a startup-blocked turn when the reply already exists', async () => {
  const runtimeClient = createNoopRuntimeClient();
  const seededAt = new Date('2026-04-09T12:00:00.000Z');
  const responseAt = new Date('2026-04-09T12:00:06.000Z');
  const stateStore = new MemoryChatStore();
  let state = await stateStore.read();
  state = createChannel(
    state,
    {
      title: 'Blocked after reply',
      topic: 'Restore a completed turn after startup recovery.',
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
        event: 'runtime_response',
        turnId: activeTurnId,
        targetKind: 'orchestrator',
        targetId: 'orchestrator',
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
    checkpoints: [
      corruptedChannel.roomRouting.lastCheckpoint,
    ],
    continuationCount: 0,
    totalDispatchCount: 0,
    guard: null,
    startedAt: seededAt.toISOString(),
    completedAt: responseAt.toISOString(),
  };

  const repaired = repairOrphanedCompletedDispatchTurn(
    corruptedState,
    channelId,
    new Date('2026-04-09T12:10:00.000Z'),
  );

  assert.equal(repaired.repaired, true);
  const repairedChannel = requireChannel(repaired.state, channelId);
  assert.equal(repairedChannel.roomRouting.workflow.activeTurn, null);
  assert.equal(repairedChannel.roomRouting.lastOutcome?.status, 'completed');
  assert.equal(repairedChannel.roomRouting.workflow.turnHistory[0]?.status, 'completed');
});
