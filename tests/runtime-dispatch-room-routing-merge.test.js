import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import test from 'node:test';

import {
  appendMessage,
  assignCatToChannel,
  buildChannelView,
  createCat,
  createChannel,
  requireChannel,
} from '../build/server/products/chat/state/model/index.js';
import {
  createDefaultCoreState,
  upsertCoreLane,
  upsertCoreSession,
} from '../build/server/core/model/index.js';
import { createAsyncKeyedGate } from '../build/server/products/chat/shared/asyncControl.js';
import {
  beginChannelMessageDispatch,
  continueBegunChannelMessageDispatch,
  settleBegunChannelMessageDispatchFailure,
} from '../build/server/products/chat/state/runtimeActions.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import {
  createMergedDispatchChatStore,
  mergeCompletedDispatchState,
} from '../build/server/products/chat/state/runtime-dispatch/merge.js';
import {
  applyDispatchExecutions,
} from '../build/server/products/chat/state/runtime-dispatch/results.js';
import {
  repairMissingSessionStartedMessages,
  repairMissingStartupRecoveryNotice,
  repairOrphanedCompletedDispatchTurn,
} from '../build/server/products/chat/state/runtime-dispatch/repair.js';
import {
  buildChatConversationId,
  buildDirectLaneTransportBindingId,
  buildChatLaneId,
  CHAT_ROOT_CONTAINER_ID,
} from '../build/server/shared/chatCoreIds.js';

function createNoopRuntimeClient() {
  return {
    async closeSession() {},
  };
}

test('applyDispatchExecutions advances sequential queued frames by canonical source identity before participant fallback', async () => {
  const runtimeClient = createNoopRuntimeClient();
  const seededAt = new Date('2026-04-12T09:00:00.000Z');
  const completedAt = new Date('2026-04-12T09:00:05.000Z');
  const chatStore = new MemoryChatStore();
  let state = await chatStore.read();
  state = createChannel(
    state,
    {
      title: 'Sequential frontier identity',
      topic: 'Advance the correct queued frame when the same participant owns multiple frontiers.',
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelId = state.selectedChannelId;
  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    { body: 'Start a workflow turn.' },
    runtimeClient,
    seededAt,
  );
  const workingState = structuredClone(begun.state);
  const channel = requireChannel(workingState, channelId);
  const workflow = channel.roomRouting.workflow;
  const activeTurn = workflow.activeTurn;
  assert.ok(activeTurn);
  const sourceMessage = channel.messages.find((message) => message.id === activeTurn.sourceMessageId);
  assert.ok(sourceMessage);

  const sourceParticipant = {
    participantKind: 'cat',
    participantId: 'participant-source',
    participantName: 'Source Cat',
  };
  const executionTarget = {
    participantKind: 'orchestrator',
    participantId: 'orchestrator',
    participantName: 'Chat',
    laneId: 'lane-current-frontier',
    sessionId: 'session-current-frontier',
  };

  activeTurn.workflowShape = 'sequential';
  activeTurn.targetStatuses = [
    {
      id: 'target-current-frontier',
      dispatchId: 'dispatch-current-frontier',
      participant: sourceParticipant,
      laneId: executionTarget.laneId,
      sessionId: executionTarget.sessionId,
      source: sourceParticipant,
      sourceMessageId: sourceMessage.id,
      trigger: 'continuation_mention',
      mentionNames: ['Chat'],
      depth: 1,
      parentCheckpointId: activeTurn.lastCheckpointId,
      branchStrategy: 'transplant_context',
      handoffReason: 'workflow_continuation',
      wakeRequestId: null,
      status: 'running',
      queuedAt: seededAt.toISOString(),
      startedAt: seededAt.toISOString(),
      completedAt: null,
      response: null,
      error: null,
    },
  ];

  const outcome = {
    turnId: activeTurn.id,
    mode: channel.roomRouting.mode,
    sourceMessageId: activeTurn.sourceMessageId,
    sourceSenderKind: activeTurn.sourceSenderKind,
    sourceSenderName: activeTurn.sourceSenderName,
    status: 'active',
    resolution: structuredClone(channel.roomRouting.lastOutcome?.resolution ?? {
      routingMode: 'room_default',
      selectionKind: 'default_target',
      defaultTarget: {
        participantKind: 'orchestrator',
        participantId: 'orchestrator',
        participantName: 'Chat',
      },
      defaultTargetReason: 'chat_channel_default',
      fallbackTarget: null,
      blockedReason: null,
      note: null,
    }),
    resolvedTargets: structuredClone(channel.roomRouting.lastOutcome?.resolvedTargets ?? []),
    unresolvedMentions: [],
    dispatches: [],
    checkpoints: structuredClone(channel.roomRouting.lastOutcome?.checkpoints ?? []),
    continuationCount: 0,
    totalDispatchCount: 0,
    guard: null,
    startedAt: seededAt.toISOString(),
    completedAt: null,
  };
  const queue = [
    {
      sourceMessage: { ...sourceMessage, id: 'source-frontier-a' },
      sourceTurnId: 'turn-shared-frontier',
      sourceLaneId: 'lane-frontier-a',
      sourceAssistantTurnId: 'assistant-frontier-a',
      sourceParticipant,
      targets: [{
        participantKind: 'cat',
        participantId: 'participant-a',
        participantName: 'Agent A',
        laneId: null,
        sessionId: null,
      }],
      unresolved: [],
      mentionNames: ['Agent A'],
      trigger: 'continuation_mention',
      depth: 1,
      workflowShapeOverride: 'sequential',
      workflowStageId: 'continuation_handoff',
      reviewRequired: false,
    },
    {
      sourceMessage: { ...sourceMessage, id: 'source-frontier-b' },
      sourceTurnId: 'turn-shared-frontier',
      sourceLaneId: 'lane-frontier-b',
      sourceAssistantTurnId: 'assistant-frontier-b',
      sourceParticipant,
      targets: [{
        participantKind: 'cat',
        participantId: 'participant-b',
        participantName: 'Agent B',
        laneId: null,
        sessionId: null,
      }],
      unresolved: [],
      mentionNames: ['Agent B'],
      trigger: 'continuation_mention',
      depth: 1,
      workflowShapeOverride: 'sequential',
      workflowStageId: 'continuation_handoff',
      reviewRequired: false,
    },
  ];

  const result = applyDispatchExecutions(
    workingState,
    channelId,
    [{
      turnId: activeTurn.id,
      dispatchId: 'dispatch-current-frontier',
      targetStateId: 'target-current-frontier',
      target: executionTarget,
      sourceMessage,
      sourceTurnId: 'turn-shared-frontier',
      sourceLaneId: 'lane-frontier-b',
      sourceAssistantTurnId: 'assistant-frontier-b',
      sourceParticipant,
      targets: [executionTarget],
      unresolved: [],
      mentionNames: ['Chat'],
      trigger: 'continuation_mention',
      depth: 1,
      parentCheckpointId: activeTurn.lastCheckpointId,
      branchStrategy: 'transplant_context',
      handoffReason: 'workflow_continuation',
      responseSegments: [{ kind: 'text', text: 'Handled the queued frontier.', toolName: null, toolId: null }],
      usage: null,
      error: null,
      recoveredMessages: [],
    }],
    completedAt,
    {
      nowIso: completedAt.toISOString(),
      workflow,
      activeTurn,
      outcome,
      latestCheckpoint: channel.roomRouting.lastCheckpoint,
      maxContinuations: 4,
      results: [],
      targetVisitCounts: new Map(),
      queue,
      describeGuardReason: (reason) => reason,
    },
  );

  assert.equal(result.guardReason, null);
  assert.equal(queue[0].promptSourceMessage, undefined);
  assert.equal(queue[0].sourceLaneId, 'lane-frontier-a');
  assert.equal(queue[1].promptSourceMessage?.body, 'Handled the queued frontier.');
  assert.equal(queue[1].sourceTurnId, activeTurn.id);
  assert.equal(queue[1].sourceLaneId, 'lane-current-frontier');
});

test('applyDispatchExecutions keeps replayed depth-0 continuation targets isolated by source identity', async () => {
  const runtimeClient = createNoopRuntimeClient();
  const seededAt = new Date('2026-04-12T10:00:00.000Z');
  const completedAt = new Date('2026-04-12T10:00:05.000Z');
  const chatStore = new MemoryChatStore();
  let state = await chatStore.read();
  state = createCat(
    state,
    {
      name: 'Claude',
      provider: 'claude',
      roles: ['reviewer'],
    },
    seededAt,
  );
  const claudeCatId = state.cats[0]?.id;
  state = createCat(
    state,
    {
      name: 'Codex',
      provider: 'openai',
      roles: ['implementer'],
    },
    seededAt,
  );
  const codexCatId = state.cats[0]?.id;
  assert.ok(claudeCatId);
  assert.ok(codexCatId);
  state = createChannel(
    state,
    {
      title: 'Sequential replay frontier isolation',
      topic: 'Do not dedupe a later replayed frontier against another frontier that only shares the source message.',
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelId = state.selectedChannelId;
  state = assignCatToChannel(state, channelId, { catId: claudeCatId }, seededAt);
  state = assignCatToChannel(state, channelId, { catId: codexCatId }, seededAt);

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    { body: 'Start a replayed sequential workflow turn.' },
    runtimeClient,
    seededAt,
  );
  const workingState = structuredClone(begun.state);
  const channel = requireChannel(workingState, channelId);
  const channelView = buildChannelView(workingState, channelId);
  const workflow = channel.roomRouting.workflow;
  const activeTurn = workflow.activeTurn;
  assert.ok(activeTurn);
  const sourceMessage = channel.messages.find((message) => message.id === activeTurn.sourceMessageId);
  assert.ok(sourceMessage);

  const claudeParticipant = channelView.assignedCats.find((participant) => participant.name === 'Claude');
  const codexParticipant = channelView.assignedCats.find((participant) => participant.name === 'Codex');
  assert.ok(claudeParticipant);
  assert.ok(codexParticipant);

  const currentTarget = {
    participantKind: 'cat',
    participantId: claudeParticipant.participantId,
    participantName: claudeParticipant.name,
    laneId: 'lane-current-frontier',
    sessionId: 'session-current-frontier',
  };
  const codexRef = {
    participantKind: 'cat',
    participantId: codexParticipant.participantId,
    participantName: codexParticipant.name,
  };
  const claudeRef = {
    participantKind: 'cat',
    participantId: claudeParticipant.participantId,
    participantName: claudeParticipant.name,
  };

  activeTurn.workflowShape = 'sequential';
  activeTurn.targetStatuses = [
    {
      id: 'target-replayed-frontier-a',
      dispatchId: 'dispatch-replayed-frontier-a',
      participant: codexRef,
      laneId: 'lane-replayed-frontier-a-target',
      sessionId: null,
      source: claudeRef,
      sourceMessageId: sourceMessage.id,
      sourceTurnId: 'turn-replayed-frontier',
      sourceLaneId: 'lane-frontier-a',
      sourceAssistantTurnId: 'assistant-frontier-a',
      trigger: 'continuation_mention',
      mentionNames: ['Codex'],
      depth: 0,
      parentCheckpointId: activeTurn.lastCheckpointId,
      branchStrategy: 'transplant_context',
      handoffReason: 'workflow_continuation',
      wakeRequestId: null,
      status: 'pending',
      queuedAt: seededAt.toISOString(),
      startedAt: null,
      completedAt: null,
      response: null,
      error: null,
    },
    {
      id: 'target-current-frontier',
      dispatchId: 'dispatch-current-frontier',
      participant: claudeRef,
      laneId: currentTarget.laneId,
      sessionId: currentTarget.sessionId,
      source: claudeRef,
      sourceMessageId: sourceMessage.id,
      sourceTurnId: 'turn-replayed-frontier',
      sourceLaneId: 'lane-frontier-b',
      sourceAssistantTurnId: 'assistant-frontier-b',
      trigger: 'continuation_mention',
      mentionNames: ['Claude'],
      depth: 0,
      parentCheckpointId: activeTurn.lastCheckpointId,
      branchStrategy: 'transplant_context',
      handoffReason: 'workflow_continuation',
      wakeRequestId: null,
      status: 'running',
      queuedAt: seededAt.toISOString(),
      startedAt: seededAt.toISOString(),
      completedAt: null,
      response: null,
      error: null,
    },
  ];

  const outcome = {
    turnId: activeTurn.id,
    mode: channel.roomRouting.mode,
    sourceMessageId: activeTurn.sourceMessageId,
    sourceSenderKind: activeTurn.sourceSenderKind,
    sourceSenderName: activeTurn.sourceSenderName,
    status: 'active',
    resolution: structuredClone(channel.roomRouting.lastOutcome?.resolution ?? {
      routingMode: 'room_default',
      selectionKind: 'default_target',
      defaultTarget: {
        participantKind: 'orchestrator',
        participantId: 'orchestrator',
        participantName: 'Chat',
      },
      defaultTargetReason: 'chat_channel_default',
      fallbackTarget: null,
      blockedReason: null,
      note: null,
    }),
    resolvedTargets: structuredClone(channel.roomRouting.lastOutcome?.resolvedTargets ?? []),
    unresolvedMentions: [],
    dispatches: [],
    checkpoints: structuredClone(channel.roomRouting.lastOutcome?.checkpoints ?? []),
    continuationCount: 0,
    totalDispatchCount: 0,
    guard: null,
    startedAt: seededAt.toISOString(),
    completedAt: null,
  };
  const queue = [];

  const result = applyDispatchExecutions(
    workingState,
    channelId,
    [{
      turnId: activeTurn.id,
      dispatchId: 'dispatch-current-frontier',
      targetStateId: 'target-current-frontier',
      target: currentTarget,
      sourceMessage,
      sourceTurnId: 'turn-replayed-frontier',
      sourceLaneId: 'lane-frontier-b',
      sourceAssistantTurnId: 'assistant-frontier-b',
      sourceParticipant: claudeRef,
      targets: [currentTarget],
      unresolved: [],
      mentionNames: ['Claude'],
      trigger: 'continuation_mention',
      depth: 0,
      parentCheckpointId: activeTurn.lastCheckpointId,
      branchStrategy: 'transplant_context',
      handoffReason: 'workflow_continuation',
      responseSegments: [{ kind: 'text', text: '@Codex please continue from frontier B.', toolName: null, toolId: null }],
      usage: null,
      error: null,
      recoveredMessages: [],
    }],
    completedAt,
    {
      nowIso: completedAt.toISOString(),
      workflow,
      activeTurn,
      outcome,
      latestCheckpoint: channel.roomRouting.lastCheckpoint,
      maxContinuations: 4,
      results: [],
      targetVisitCounts: new Map(),
      queue,
      describeGuardReason: (reason) => reason,
    },
  );

  assert.equal(result.guardReason, null);
  assert.equal(queue.length, 1);
  assert.equal(queue[0]?.targets.length, 1);
  assert.equal(queue[0]?.targets[0]?.participantId, codexParticipant.participantId);
  assert.equal(queue[0]?.sourceLaneId, currentTarget.laneId);
});

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
  const runtimeError = settledChannel.messages.find((message) =>
    message.metadata?.event === 'runtime_error'
    && /Injected runtime failure/u.test(message.body));
  assert.equal(runtimeError?.metadata?.conversationId, buildChatConversationId(channelId));
  assert.equal(runtimeError?.metadata?.containerId, CHAT_ROOT_CONTAINER_ID);
});

test('settleBegunChannelMessageDispatchFailure keeps direct-lane transport bindings on runtime_error messages', async () => {
  const chatStore = new MemoryChatStore();
  const runtimeClient = createNoopRuntimeClient();
  const seededAt = new Date('2026-04-15T12:00:00.000Z');
  const failureAt = new Date('2026-04-15T12:00:05.000Z');
  let state = await chatStore.read();
  state = createCat(
    state,
    {
      name: 'Companion',
      provider: 'claude',
      roles: ['companion'],
    },
    seededAt,
  );
  const companionId = state.cats[0].id;
  state = createChannel(
    state,
    {
      title: 'Direct lane settle failure',
      topic: 'Keep implicit direct-lane bindings on outer runtime_error notices.',
      roomMode: 'direct_message',
      participantCatIds: [companionId],
      defaultRecipientId: companionId,
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelId = state.selectedChannelId;

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    { body: 'Trigger an outer dispatch failure.' },
    runtimeClient,
    seededAt,
  );
  const settled = await settleBegunChannelMessageDispatchFailure(
    begun,
    channelId,
    new Error('Injected direct-lane failure'),
    failureAt,
  );
  const settledChannel = requireChannel(settled.state, channelId);
  const runtimeError = settledChannel.messages.find((message) =>
    message.metadata?.event === 'runtime_error'
    && /Injected direct-lane failure/u.test(message.body));
  assert.ok(runtimeError);
  assert.equal(runtimeError?.metadata?.conversationId, buildChatConversationId(channelId));
  assert.equal(runtimeError?.metadata?.containerId, CHAT_ROOT_CONTAINER_ID);
  assert.equal(
    runtimeError?.metadata?.transportBindingId,
    buildDirectLaneTransportBindingId(channelId),
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

test('continueBegunChannelMessageDispatch preserves recovered session_started metadata after stale-session retry', async () => {
  const chatStore = new MemoryChatStore();
  const seededAt = new Date('2026-04-09T12:30:00.000Z');
  const dispatchAt = new Date('2026-04-09T12:30:05.000Z');
  let state = await chatStore.read();
  state = createChannel(
    state,
    {
      title: 'Recovered stale participant session',
      topic: 'Retry a room dispatch after a stale participant session.',
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
  const channel = requireChannel(state, channelId);
  const participantAssignment = channel.participantAssignments.find(
    (assignment) => assignment.participantId === 'participant-inline',
  );
  assert.ok(participantAssignment);
  participantAssignment.execution.lease = {
    sessionId: 'session-stale',
    status: 'ready',
    cwd: 'C:/Users/middl/.cats/runtime/sessions/session-stale',
    lastError: null,
    provider: 'claude',
    model: 'claude-opus-4-6',
    startedAt: seededAt.toISOString(),
    lastUsedAt: seededAt.toISOString(),
  };

  const sentSessionIds = [];
  const closedSessionIds = [];
  const runtimeClient = {
    async sendMessage(sessionId) {
      sentSessionIds.push(sessionId);
      if (sessionId === 'session-stale') {
        throw new Error('Session is closed');
      }
      return {
        segments: [{ kind: 'text', text: 'Recovered reply', toolName: null, toolId: null }],
        inputTokens: 10,
        outputTokens: 20,
        tokensUsed: 30,
      };
    },
    async createSession(input) {
      return {
        id: 'session-recovered',
        provider: input.provider,
        model: input.model,
        cwd: 'C:/Users/middl/.cats/runtime/sessions/session-recovered',
        status: 'ready',
        instance: input.instance,
        modelSelection: input.modelSelection,
      };
    },
    async closeSession(sessionId) {
      closedSessionIds.push(sessionId);
    },
  };

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    { body: 'Please recover this routed turn.' },
    runtimeClient,
    dispatchAt,
  );
  const settled = await continueBegunChannelMessageDispatch(
    begun,
    channelId,
    runtimeClient,
    dispatchAt,
    {
      runtimeRecovery: {
        staleSessionRetryLimit: 1,
      },
    },
  );
  const settledChannel = requireChannel(settled.state, channelId);
  const recoveredTurn = settledChannel.roomRouting.workflow.turnHistory[0];
  const recoveredTargetStateId = recoveredTurn?.targetStatuses[0]?.id;
  const recoveredSessionStartedIndex = settledChannel.messages.findIndex((message) =>
    message.metadata?.event === 'session_started'
    && message.metadata?.sessionId === 'session-recovered');
  const recoveredResponseIndex = settledChannel.messages.findIndex((message) =>
    message.metadata?.event === 'assistant_turn_segment'
    && message.metadata?.terminal === true
    && message.metadata?.sessionId === 'session-recovered');

  assert.equal(settledChannel.chatCwd, 'C:/Users/middl/.cats/runtime/sessions/session-recovered');
  assert.ok(recoveredSessionStartedIndex >= 0);
  assert.ok(recoveredResponseIndex > recoveredSessionStartedIndex);
  assert.equal(typeof recoveredTargetStateId, 'string');
  assert.equal(
    settledChannel.messages[recoveredSessionStartedIndex]?.metadata?.targetStateId,
    recoveredTargetStateId,
  );
  assert.equal(
    settledChannel.messages[recoveredSessionStartedIndex]?.metadata?.laneId,
    buildChatLaneId(recoveredTurn.id, recoveredTargetStateId, 'participant-inline'),
  );
  assert.deepEqual(sentSessionIds, ['session-stale', 'session-recovered']);
  assert.deepEqual(closedSessionIds, ['session-stale']);
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
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-recovered',
        targetStateId: 'target-orchestrator-recovered',
        terminal: true,
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
      defaultTargetReason: 'chat_channel_default',
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

test('repairOrphanedCompletedDispatchTurn ignores non-terminal segmented replies', async () => {
  const runtimeClient = createNoopRuntimeClient();
  const seededAt = new Date('2026-04-09T12:00:00.000Z');
  const responseAt = new Date('2026-04-09T12:00:06.000Z');
  const stateStore = new MemoryChatStore();
  let state = await stateStore.read();
  state = createChannel(
    state,
    {
      title: 'Segment fragment only',
      topic: 'Do not repair a turn from a partial segment.',
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelId = state.selectedChannelId;
  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    { body: 'Only a partial reply exists' },
    runtimeClient,
    seededAt,
  );
  const activeTurnId = requireChannel(begun.state, channelId).roomRouting.workflow.activeTurn?.id;
  assert.ok(activeTurnId);

  const partialState = appendMessage(
    begun.state,
    channelId,
    {
      senderKind: 'orchestrator',
      senderName: 'Chat',
      body: 'Partial response body',
    },
    responseAt,
    {
      metadata: {
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-partial',
        targetStateId: 'target-orchestrator-partial',
        terminal: false,
        turnId: activeTurnId,
        targetKind: 'orchestrator',
        targetId: 'orchestrator',
        routingTrigger: 'room_default',
        dispatchDepth: 0,
        segmentIndex: 0,
      },
    },
  ).state;

  const repaired = repairOrphanedCompletedDispatchTurn(
    partialState,
    channelId,
    new Date('2026-04-09T12:10:00.000Z'),
  );

  assert.equal(repaired.repaired, false);
  assert.equal(
    requireChannel(repaired.state, channelId).roomRouting.workflow.activeTurn?.id,
    activeTurnId,
  );
});

test('repairOrphanedCompletedDispatchTurn keeps an active sequential turn alive while later targets remain in flight', async () => {
  const runtimeClient = createNoopRuntimeClient();
  const seededAt = new Date('2026-04-09T12:00:00.000Z');
  const responseAt = new Date('2026-04-09T12:00:06.000Z');
  const stateStore = new MemoryChatStore();
  let state = await stateStore.read();
  state = createChannel(
    state,
    {
      title: 'Sequential handoff still active',
      topic: 'Do not finalize the room turn while a follow-up speaker remains active.',
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelId = state.selectedChannelId;
  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    { body: 'First speaker should hand off to a second one.' },
    runtimeClient,
    seededAt,
  );
  const inFlightState = structuredClone(begun.state);
  const inFlightChannel = requireChannel(inFlightState, channelId);
  const activeTurn = inFlightChannel.roomRouting.workflow.activeTurn;
  assert.ok(activeTurn);

  activeTurn.workflowShape = 'sequential';
  activeTurn.targetStatuses = [
    {
      id: 'target-claude',
      dispatchId: 'dispatch-claude',
      participant: {
        participantKind: 'cat',
        participantId: 'participant-claude',
        participantName: 'Claude-CLI',
      },
      source: null,
      sourceMessageId: activeTurn.sourceMessageId,
      trigger: 'explicit_mention',
      mentionNames: ['Claude-CLI', 'Codex-CLI'],
      depth: 0,
      parentCheckpointId: activeTurn.lastCheckpointId,
      branchStrategy: 'transplant_context',
      handoffReason: 'explicit_mention',
      wakeRequestId: null,
      status: 'running',
      queuedAt: seededAt.toISOString(),
      startedAt: seededAt.toISOString(),
      completedAt: null,
      response: null,
      error: null,
    },
    {
      id: 'target-codex',
      dispatchId: 'dispatch-codex',
      participant: {
        participantKind: 'cat',
        participantId: 'participant-codex',
        participantName: 'Codex-CLI',
      },
      source: null,
      sourceMessageId: activeTurn.sourceMessageId,
      trigger: 'continuation_mention',
      mentionNames: ['Codex-CLI'],
      depth: 0,
      parentCheckpointId: activeTurn.lastCheckpointId,
      branchStrategy: 'transplant_context',
      handoffReason: 'workflow_continuation',
      wakeRequestId: null,
      status: 'running',
      queuedAt: responseAt.toISOString(),
      startedAt: responseAt.toISOString(),
      completedAt: null,
      response: null,
      error: null,
    },
  ];

  const firstSegmentState = appendMessage(
    inFlightState,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'Claude-CLI',
      body: 'Hello from the first speaker.',
    },
    responseAt,
    {
      metadata: {
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-claude',
        targetStateId: 'target-claude',
        terminal: true,
        turnId: activeTurn.id,
        targetKind: 'cat',
        targetId: 'participant-claude',
        routingTrigger: 'explicit_mention',
        dispatchDepth: 0,
        segmentIndex: 0,
      },
      incrementUnread: false,
    },
  ).state;

  const repaired = repairOrphanedCompletedDispatchTurn(
    firstSegmentState,
    channelId,
    new Date('2026-04-09T12:10:00.000Z'),
  );

  assert.equal(repaired.repaired, false);
  const repairedChannel = requireChannel(repaired.state, channelId);
  assert.equal(repairedChannel.roomRouting.workflow.activeTurn?.id, activeTurn.id);
  assert.deepEqual(
    repairedChannel.roomRouting.workflow.activeTurn?.targetStatuses.map((target) => target.status),
    ['running', 'running'],
  );
});

test('repairOrphanedCompletedDispatchTurn keeps a sequential turn alive while later targets are still unmaterialized', async () => {
  const runtimeClient = createNoopRuntimeClient();
  const seededAt = new Date('2026-04-09T12:00:00.000Z');
  const responseAt = new Date('2026-04-09T12:00:06.000Z');
  const stateStore = new MemoryChatStore();
  let state = await stateStore.read();
  state = createChannel(
    state,
    {
      title: 'Sequential target gap still active',
      topic: 'Do not finalize the room turn before the next sequential target is written.',
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelId = state.selectedChannelId;
  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    { body: 'First speaker should hand off, but the second target is not written yet.' },
    runtimeClient,
    seededAt,
  );
  const inFlightState = structuredClone(begun.state);
  const inFlightChannel = requireChannel(inFlightState, channelId);
  const activeTurn = inFlightChannel.roomRouting.workflow.activeTurn;
  assert.ok(activeTurn);

  activeTurn.workflowShape = 'sequential';
  const turnStartedEvent = activeTurn.events.find((event) => event.kind === 'turn_started');
  assert.ok(turnStartedEvent);
  turnStartedEvent.targets = [
    {
      participantKind: 'cat',
      participantId: 'participant-claude',
      participantName: 'Claude-CLI',
    },
    {
      participantKind: 'cat',
      participantId: 'participant-codex',
      participantName: 'Codex-CLI',
    },
  ];
  activeTurn.targetStatuses = [
    {
      id: 'target-claude',
      dispatchId: 'dispatch-claude',
      participant: {
        participantKind: 'cat',
        participantId: 'participant-claude',
        participantName: 'Claude-CLI',
      },
      source: null,
      sourceMessageId: activeTurn.sourceMessageId,
      trigger: 'explicit_mention',
      mentionNames: ['Claude-CLI', 'Codex-CLI'],
      depth: 0,
      parentCheckpointId: activeTurn.lastCheckpointId,
      branchStrategy: 'transplant_context',
      handoffReason: 'explicit_mention',
      wakeRequestId: null,
      status: 'completed',
      queuedAt: seededAt.toISOString(),
      startedAt: seededAt.toISOString(),
      completedAt: responseAt.toISOString(),
      response: null,
      error: null,
    },
  ];

  const firstSegmentState = appendMessage(
    inFlightState,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'Claude-CLI',
      body: 'Hello from the first speaker.',
    },
    responseAt,
    {
      metadata: {
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-claude-gap',
        targetStateId: 'target-claude',
        terminal: true,
        turnId: activeTurn.id,
        targetKind: 'cat',
        targetId: 'participant-claude',
        routingTrigger: 'explicit_mention',
        dispatchDepth: 0,
        segmentIndex: 0,
      },
      incrementUnread: false,
    },
  ).state;

  const repaired = repairOrphanedCompletedDispatchTurn(
    firstSegmentState,
    channelId,
    new Date('2026-04-09T12:10:00.000Z'),
  );

  assert.equal(repaired.repaired, false);
  const repairedChannel = requireChannel(repaired.state, channelId);
  assert.equal(repairedChannel.roomRouting.workflow.activeTurn?.id, activeTurn.id);
  assert.equal(repairedChannel.roomRouting.workflow.activeTurn?.targetStatuses.length, 1);
  assert.equal(
    repairedChannel.roomRouting.workflow.activeTurn?.targetStatuses[0]?.id,
    'target-claude',
  );
});

test('repairOrphanedCompletedDispatchTurn keeps later same-speaker re-entry targets in flight', async () => {
  const runtimeClient = createNoopRuntimeClient();
  const seededAt = new Date('2026-04-09T12:00:00.000Z');
  const responseAt = new Date('2026-04-09T12:00:06.000Z');
  const stateStore = new MemoryChatStore();
  let state = await stateStore.read();
  state = createChannel(
    state,
    {
      title: 'Same speaker re-entry still active',
      topic: 'Do not treat a later mention of the same speaker as the same target state.',
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelId = state.selectedChannelId;
  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    { body: 'Claude should speak, then Codex, then Claude again.' },
    runtimeClient,
    seededAt,
  );
  const inFlightState = structuredClone(begun.state);
  const inFlightChannel = requireChannel(inFlightState, channelId);
  const activeTurn = inFlightChannel.roomRouting.workflow.activeTurn;
  assert.ok(activeTurn);

  activeTurn.workflowShape = 'sequential';
  activeTurn.targetStatuses = [
    {
      id: 'target-claude-first',
      dispatchId: 'dispatch-claude-first',
      participant: {
        participantKind: 'cat',
        participantId: 'participant-claude',
        participantName: 'Claude-CLI',
      },
      source: null,
      sourceMessageId: activeTurn.sourceMessageId,
      trigger: 'explicit_mention',
      mentionNames: ['Claude-CLI', 'Codex-CLI', 'Claude-CLI'],
      depth: 0,
      parentCheckpointId: activeTurn.lastCheckpointId,
      branchStrategy: 'transplant_context',
      handoffReason: 'explicit_mention',
      wakeRequestId: null,
      status: 'completed',
      queuedAt: seededAt.toISOString(),
      startedAt: seededAt.toISOString(),
      completedAt: responseAt.toISOString(),
      response: null,
      error: null,
    },
    {
      id: 'target-codex',
      dispatchId: 'dispatch-codex',
      participant: {
        participantKind: 'cat',
        participantId: 'participant-codex',
        participantName: 'Codex-CLI',
      },
      source: null,
      sourceMessageId: activeTurn.sourceMessageId,
      trigger: 'continuation_mention',
      mentionNames: ['Codex-CLI'],
      depth: 0,
      parentCheckpointId: activeTurn.lastCheckpointId,
      branchStrategy: 'transplant_context',
      handoffReason: 'workflow_continuation',
      wakeRequestId: null,
      status: 'completed',
      queuedAt: responseAt.toISOString(),
      startedAt: responseAt.toISOString(),
      completedAt: responseAt.toISOString(),
      response: {
        assistantTurnId: 'assistant-turn-codex',
        messageIds: ['message-codex'],
        fullText: 'Codex already responded.',
        segmentCount: 1,
      },
      error: null,
    },
    {
      id: 'target-claude-second',
      dispatchId: 'dispatch-claude-second',
      participant: {
        participantKind: 'cat',
        participantId: 'participant-claude',
        participantName: 'Claude-CLI',
      },
      source: null,
      sourceMessageId: activeTurn.sourceMessageId,
      trigger: 'continuation_mention',
      mentionNames: ['Claude-CLI'],
      depth: 0,
      parentCheckpointId: activeTurn.lastCheckpointId,
      branchStrategy: 'transplant_context',
      handoffReason: 'workflow_continuation',
      wakeRequestId: null,
      status: 'pending',
      queuedAt: responseAt.toISOString(),
      startedAt: null,
      completedAt: null,
      response: null,
      error: null,
    },
  ];

  const firstSegmentState = appendMessage(
    inFlightState,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'Claude-CLI',
      body: 'Hello from the first Claude turn.',
    },
    responseAt,
    {
      metadata: {
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-claude-first',
        targetStateId: 'target-claude-first',
        terminal: true,
        turnId: activeTurn.id,
        targetKind: 'cat',
        targetId: 'participant-claude',
        routingTrigger: 'explicit_mention',
        dispatchDepth: 0,
        segmentIndex: 0,
      },
      incrementUnread: false,
    },
  ).state;

  const repaired = repairOrphanedCompletedDispatchTurn(
    firstSegmentState,
    channelId,
    new Date('2026-04-09T12:10:00.000Z'),
  );

  assert.equal(repaired.repaired, false);
  const repairedChannel = requireChannel(repaired.state, channelId);
  assert.equal(repairedChannel.roomRouting.workflow.activeTurn?.id, activeTurn.id);
  assert.equal(
    repairedChannel.roomRouting.workflow.activeTurn?.targetStatuses.some((target) =>
      target.id === 'target-claude-second' && target.status === 'pending'),
    true,
  );
});

test('repairOrphanedCompletedDispatchTurn restores a drifted same-speaker re-entry target from canonical metadata', async () => {
  const runtimeClient = createNoopRuntimeClient();
  const seededAt = new Date('2026-04-09T12:20:00.000Z');
  const firstResponseAt = new Date('2026-04-09T12:20:06.000Z');
  const secondResponseAt = new Date('2026-04-09T12:20:09.000Z');
  const thirdResponseAt = new Date('2026-04-09T12:20:12.000Z');
  const stateStore = new MemoryChatStore();
  let state = await stateStore.read();
  state = createChannel(
    state,
    {
      title: 'Same speaker re-entry drifted target',
      topic: 'Recover the later same-speaker target when transcript targetStateId drifts.',
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelId = state.selectedChannelId;
  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    { body: 'Claude should speak, then Codex, then Claude again.' },
    runtimeClient,
    seededAt,
  );
  const canonicalState = structuredClone(begun.state);
  const canonicalChannel = requireChannel(canonicalState, channelId);
  const activeTurn = canonicalChannel.roomRouting.workflow.activeTurn;
  assert.ok(activeTurn);

  activeTurn.workflowShape = 'sequential';
  activeTurn.targetStatuses = [
    {
      id: 'target-claude-first',
      dispatchId: 'dispatch-claude-first',
      participant: {
        participantKind: 'cat',
        participantId: 'participant-claude',
        participantName: 'Claude-CLI',
      },
      source: null,
      sourceMessageId: activeTurn.sourceMessageId,
      trigger: 'explicit_mention',
      mentionNames: ['Claude-CLI', 'Codex-CLI', 'Claude-CLI'],
      depth: 0,
      parentCheckpointId: activeTurn.lastCheckpointId,
      branchStrategy: 'transplant_context',
      handoffReason: 'explicit_mention',
      wakeRequestId: null,
      status: 'completed',
      queuedAt: seededAt.toISOString(),
      startedAt: seededAt.toISOString(),
      completedAt: firstResponseAt.toISOString(),
      response: {
        assistantTurnId: 'assistant-turn-claude-first',
        messageIds: ['message-claude-first'],
        fullText: 'Hello from the first Claude turn.',
        segmentCount: 1,
      },
      error: null,
    },
    {
      id: 'target-codex',
      dispatchId: 'dispatch-codex',
      participant: {
        participantKind: 'cat',
        participantId: 'participant-codex',
        participantName: 'Codex-CLI',
      },
      source: null,
      sourceMessageId: activeTurn.sourceMessageId,
      trigger: 'continuation_mention',
      mentionNames: ['Codex-CLI'],
      depth: 0,
      parentCheckpointId: activeTurn.lastCheckpointId,
      branchStrategy: 'transplant_context',
      handoffReason: 'workflow_continuation',
      wakeRequestId: null,
      status: 'completed',
      queuedAt: firstResponseAt.toISOString(),
      startedAt: firstResponseAt.toISOString(),
      completedAt: secondResponseAt.toISOString(),
      response: {
        assistantTurnId: 'assistant-turn-codex',
        messageIds: ['message-codex'],
        fullText: 'Codex already responded.',
        segmentCount: 1,
      },
      error: null,
    },
    {
      id: 'target-claude-second',
      dispatchId: 'dispatch-claude-second',
      participant: {
        participantKind: 'cat',
        participantId: 'participant-claude',
        participantName: 'Claude-CLI',
      },
      source: null,
      sourceMessageId: activeTurn.sourceMessageId,
      trigger: 'continuation_mention',
      mentionNames: ['Claude-CLI'],
      depth: 0,
      parentCheckpointId: activeTurn.lastCheckpointId,
      branchStrategy: 'transplant_context',
      handoffReason: 'workflow_continuation',
      wakeRequestId: null,
      status: 'completed',
      queuedAt: secondResponseAt.toISOString(),
      startedAt: secondResponseAt.toISOString(),
      completedAt: thirdResponseAt.toISOString(),
      response: {
        assistantTurnId: 'assistant-turn-claude-second',
        messageIds: ['message-claude-second'],
        fullText: 'Hello from the second Claude turn.',
        segmentCount: 1,
      },
      error: null,
    },
  ];

  let materializedState = appendMessage(
    canonicalState,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'Claude-CLI',
      body: 'Hello from the first Claude turn.',
    },
    firstResponseAt,
    {
      metadata: {
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-claude-first',
        targetStateId: 'target-claude-first',
        terminal: true,
        turnId: activeTurn.id,
        targetKind: 'cat',
        targetId: 'participant-claude',
        routingTrigger: 'explicit_mention',
        dispatchDepth: 0,
        segmentIndex: 0,
      },
      incrementUnread: false,
    },
  ).state;
  materializedState = appendMessage(
    materializedState,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'Codex-CLI',
      body: 'Codex already responded.',
    },
    secondResponseAt,
    {
      metadata: {
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-codex',
        targetStateId: 'target-codex',
        terminal: true,
        turnId: activeTurn.id,
        targetKind: 'cat',
        targetId: 'participant-codex',
        routingTrigger: 'continuation_mention',
        dispatchDepth: 0,
        segmentIndex: 0,
      },
      incrementUnread: false,
    },
  ).state;
  materializedState = appendMessage(
    materializedState,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'Claude-CLI',
      body: 'Hello from the second Claude turn.',
    },
    thirdResponseAt,
    {
      metadata: {
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-claude-second',
        targetStateId: 'target-claude-second',
        terminal: true,
        turnId: activeTurn.id,
        targetKind: 'cat',
        targetId: 'participant-claude',
        routingTrigger: 'continuation_mention',
        dispatchDepth: 0,
        segmentIndex: 0,
      },
      incrementUnread: false,
    },
  ).state;

  await stateStore.write(materializedState);
  const core = await stateStore.readCore();

  const driftedState = structuredClone(materializedState);
  const driftedChannel = requireChannel(driftedState, channelId);
  const driftedTurn = driftedChannel.roomRouting.workflow.activeTurn;
  assert.ok(driftedTurn);
  const driftedTarget = driftedTurn.targetStatuses.find((target) => target.id === 'target-claude-second');
  assert.ok(driftedTarget);
  driftedTarget.status = 'pending';
  driftedTarget.startedAt = null;
  driftedTarget.completedAt = null;
  driftedTarget.response = null;

  const finalMessage = driftedChannel.messages.find((message) =>
    message.metadata?.assistantTurnId === 'assistant-turn-claude-second');
  assert.ok(finalMessage);
  delete finalMessage.metadata.targetStateId;

  const repaired = repairOrphanedCompletedDispatchTurn(
    driftedState,
    channelId,
    new Date('2026-04-09T12:30:00.000Z'),
    core,
  );

  assert.equal(repaired.repaired, true);
  const repairedChannel = requireChannel(repaired.state, channelId);
  const repairedTurn = repairedChannel.roomRouting.workflow.turnHistory[0];
  assert.ok(repairedTurn);
  const repairedTarget = repairedTurn.targetStatuses.find((target) => target.id === 'target-claude-second');
  assert.equal(repairedTarget?.status, 'completed');
  assert.equal(repairedTarget?.response?.assistantTurnId, 'assistant-turn-claude-second');
});

test('repairMissingSessionStartedMessages restores missing runtime metadata before the response', async () => {
  const chatStore = new MemoryChatStore();
  const seededAt = new Date('2026-04-09T12:00:00.000Z');
  const runtimeDataDir = await mkdtemp(path.join(os.tmpdir(), 'cats-runtime-repair-'));

  try {
    let state = await chatStore.read();
    state = createChannel(
      state,
      {
        title: 'Missing session metadata',
        topic: 'Restore missing session_started from runtime responses.',
        skipBossCatGreeting: true,
      },
      seededAt,
    );
    const channelId = state.selectedChannelId;
    state = appendMessage(
      state,
      channelId,
      {
        senderKind: 'user',
        senderName: 'User',
        body: 'First question',
      },
      new Date('2026-04-09T12:00:01.000Z'),
    ).state;
    state = appendMessage(
      state,
      channelId,
      {
        senderKind: 'agent',
        senderName: 'Chat',
        body: 'First answer',
      },
      new Date('2026-04-09T12:00:02.000Z'),
      {
        metadata: {
          event: 'assistant_turn_segment',
          assistantTurnId: 'assistant-turn-orphan',
          terminal: true,
          targetKind: 'orchestrator',
          targetId: 'orchestrator',
          sessionId: 'session-orphan',
        },
        incrementUnread: false,
      },
    ).state;

    await mkdir(path.join(runtimeDataDir, 'sessions', 'session-orphan'), { recursive: true });

    const repaired = repairMissingSessionStartedMessages(state, channelId, {
      runtimeDataDir,
      now: new Date('2026-04-09T12:05:00.000Z'),
    });

    assert.equal(repaired.repaired, true);
    const repairedChannel = requireChannel(repaired.state, channelId);
    const sessionStartedIndex = repairedChannel.messages.findIndex((message) =>
      message.metadata?.event === 'session_started'
      && message.metadata?.sessionId === 'session-orphan');
    const responseIndex = repairedChannel.messages.findIndex((message) =>
      message.metadata?.event === 'assistant_turn_segment'
      && message.metadata?.terminal === true
      && message.metadata?.sessionId === 'session-orphan');

    assert.equal(sessionStartedIndex >= 0, true);
    assert.equal(responseIndex >= 0, true);
    assert.equal(sessionStartedIndex < responseIndex, true);
    assert.equal(
      repairedChannel.messages[sessionStartedIndex]?.metadata?.conversationId,
      buildChatConversationId(channelId),
    );
    assert.equal(
      repairedChannel.messages[sessionStartedIndex]?.metadata?.containerId,
      CHAT_ROOT_CONTAINER_ID,
    );
    assert.equal(
      repairedChannel.chatCwd,
      path.join(runtimeDataDir, 'sessions', 'session-orphan'),
    );
  } finally {
    await rm(runtimeDataDir, { recursive: true, force: true });
  }
});

test('repairMissingSessionStartedMessages falls back to canonical session metadata when leases drift', async () => {
  const chatStore = new MemoryChatStore();
  const seededAt = new Date('2026-04-09T12:00:00.000Z');
  let state = await chatStore.read();
  state = createChannel(
    state,
    {
      title: 'Canonical session metadata fallback',
      topic: 'Restore missing session metadata from canonical records.',
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelId = state.selectedChannelId;
  const conversationId = buildChatConversationId(channelId);

  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'user',
      senderName: 'User',
      body: 'First question',
    },
    new Date('2026-04-09T12:00:01.000Z'),
  ).state;
  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'Fallback Agent',
      body: 'Recovered answer',
    },
    new Date('2026-04-09T12:00:02.000Z'),
    {
      metadata: {
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-canonical-fallback',
        terminal: true,
        turnId: 'turn-canonical-fallback',
        targetKind: 'cat',
        targetId: 'participant-inline',
        sessionId: 'session-canonical-fallback',
      },
      incrementUnread: false,
    },
  ).state;

  let core = createDefaultCoreState();
  core = upsertCoreLane(
    core,
    {
      id: 'lane-canonical-fallback',
      turnId: 'turn-canonical-fallback',
      conversationId,
      participantId: 'participant-inline-record',
      agentId: 'agent-inline',
      orderIndex: 0,
      status: 'completed',
      createdAt: '2026-04-09T12:00:01.500Z',
      metadata: {
        speakerLabel: 'Canonical Agent',
        targetStateId: 'target-canonical-fallback',
      },
    },
    new Date('2026-04-09T12:00:01.500Z'),
  ).core;
  core = upsertCoreSession(
    core,
    {
      id: 'session-canonical-fallback',
      conversationId,
      turnId: 'turn-canonical-fallback',
      laneId: 'lane-canonical-fallback',
      participantId: 'participant-inline-record',
      agentId: 'agent-inline',
      runtimeKey: 'claude:cli',
      status: 'active',
      createdAt: '2026-04-09T12:00:01.500Z',
      startedAt: '2026-04-09T12:00:01.500Z',
      metadata: {
        leaseCwd: 'C:/canonical/session-canonical-fallback',
      },
    },
    new Date('2026-04-09T12:00:01.500Z'),
  ).core;

  const repaired = repairMissingSessionStartedMessages(state, channelId, {
    core,
    now: new Date('2026-04-09T12:05:00.000Z'),
  });

  assert.equal(repaired.repaired, true);
  const repairedChannel = requireChannel(repaired.state, channelId);
  const sessionStarted = repairedChannel.messages.find((message) =>
    message.metadata?.event === 'session_started'
    && message.metadata?.sessionId === 'session-canonical-fallback');
  assert.ok(sessionStarted);
  assert.match(sessionStarted.body, /Canonical Agent/u);
  assert.match(sessionStarted.body, /C:\/canonical\/session-canonical-fallback/u);
  assert.equal(repairedChannel.chatCwd, 'C:/canonical/session-canonical-fallback');
  assert.equal(sessionStarted.metadata?.laneId, 'lane-canonical-fallback');
  assert.equal(sessionStarted.metadata?.targetStateId, 'target-canonical-fallback');
});

test('repairMissingSessionStartedMessages restores a missing cat targetId from canonical session records', async () => {
  const chatStore = new MemoryChatStore();
  const seededAt = new Date('2026-04-09T12:00:00.000Z');
  let state = await chatStore.read();
  state = createChannel(
    state,
    {
      title: 'Canonical session target fallback',
      topic: 'Restore missing session target ids from canonical records.',
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelId = state.selectedChannelId;
  const conversationId = buildChatConversationId(channelId);

  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'user',
      senderName: 'User',
      body: 'First question',
    },
    new Date('2026-04-09T12:00:01.000Z'),
  ).state;
  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'Fallback Agent',
      body: 'Recovered answer',
    },
    new Date('2026-04-09T12:00:02.000Z'),
    {
      metadata: {
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-canonical-target-fallback',
        terminal: true,
        turnId: 'turn-canonical-target-fallback',
        targetKind: 'cat',
        sessionId: 'session-canonical-target-fallback',
      },
      incrementUnread: false,
    },
  ).state;

  let core = createDefaultCoreState();
  core = upsertCoreLane(
    core,
    {
      id: 'lane-canonical-target-fallback',
      turnId: 'turn-canonical-target-fallback',
      conversationId,
      participantId: 'participant-inline-record',
      agentId: 'agent-inline',
      orderIndex: 0,
      status: 'completed',
      createdAt: '2026-04-09T12:00:01.500Z',
      metadata: {
        speakerLabel: 'Canonical Agent',
        targetStateId: 'target-canonical-target-fallback',
      },
    },
    new Date('2026-04-09T12:00:01.500Z'),
  ).core;
  core = upsertCoreSession(
    core,
    {
      id: 'session-canonical-target-fallback',
      conversationId,
      turnId: 'turn-canonical-target-fallback',
      laneId: 'lane-canonical-target-fallback',
      participantId: 'participant-inline-record',
      agentId: 'agent-inline',
      runtimeKey: 'claude:cli',
      status: 'active',
      createdAt: '2026-04-09T12:00:01.500Z',
      startedAt: '2026-04-09T12:00:01.500Z',
      transportBindingId: 'transport-binding-canonical-target-fallback',
      metadata: {
        leaseCwd: 'C:/canonical/session-canonical-target-fallback',
      },
    },
    new Date('2026-04-09T12:00:01.500Z'),
  ).core;

  const repaired = repairMissingSessionStartedMessages(state, channelId, {
    core,
    now: new Date('2026-04-09T12:05:00.000Z'),
  });

  assert.equal(repaired.repaired, true);
  const repairedChannel = requireChannel(repaired.state, channelId);
  const sessionStarted = repairedChannel.messages.find((message) =>
    message.metadata?.event === 'session_started'
    && message.metadata?.sessionId === 'session-canonical-target-fallback');
  assert.ok(sessionStarted);
  assert.equal(sessionStarted.metadata?.conversationId, conversationId);
  assert.equal(sessionStarted.metadata?.targetId, 'participant-inline-record');
  assert.equal(sessionStarted.metadata?.targetStateId, 'target-canonical-target-fallback');
  assert.equal(sessionStarted.metadata?.laneId, 'lane-canonical-target-fallback');
  assert.equal(
    sessionStarted.metadata?.transportBindingId,
    'transport-binding-canonical-target-fallback',
  );
  assert.match(sessionStarted.body, /Canonical Agent/u);
});

test('repairMissingSessionStartedMessages restores missing cat session identity from canonical lane records', async () => {
  const chatStore = new MemoryChatStore();
  const seededAt = new Date('2026-04-09T12:00:00.000Z');
  let state = await chatStore.read();
  state = createChannel(
    state,
    {
      title: 'Canonical lane target fallback',
      topic: 'Restore missing session target ids directly from canonical lane records.',
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelId = state.selectedChannelId;
  const conversationId = buildChatConversationId(channelId);

  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'user',
      senderName: 'User',
      body: 'First question',
    },
    new Date('2026-04-09T12:00:01.000Z'),
  ).state;
  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'Fallback Agent',
      body: 'Recovered answer',
    },
    new Date('2026-04-09T12:00:02.000Z'),
    {
      metadata: {
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-canonical-lane-target-fallback',
        terminal: true,
        turnId: 'turn-canonical-lane-target-fallback',
        targetKind: 'cat',
        sessionId: 'session-canonical-lane-target-fallback',
      },
      incrementUnread: false,
    },
  ).state;

  let core = createDefaultCoreState();
  core = upsertCoreLane(
    core,
    {
      id: 'lane-canonical-lane-target-fallback',
      turnId: 'turn-canonical-lane-target-fallback',
      conversationId,
      participantId: 'participant-inline-record',
      agentId: 'agent-inline',
      orderIndex: 0,
      status: 'completed',
      createdAt: '2026-04-09T12:00:01.500Z',
      metadata: {
        speakerLabel: 'Canonical Lane Agent',
        targetStateId: 'target-canonical-lane-target-fallback',
        responseAssistantTurnId: 'assistant-turn-canonical-lane-target-fallback',
      },
    },
    new Date('2026-04-09T12:00:01.500Z'),
  ).core;

  const repaired = repairMissingSessionStartedMessages(state, channelId, {
    core,
    now: new Date('2026-04-09T12:05:00.000Z'),
  });

  assert.equal(repaired.repaired, true);
  const repairedChannel = requireChannel(repaired.state, channelId);
  const sessionStarted = repairedChannel.messages.find((message) =>
    message.metadata?.event === 'session_started'
    && message.metadata?.sessionId === 'session-canonical-lane-target-fallback');
  assert.ok(sessionStarted);
  assert.equal(sessionStarted.metadata?.conversationId, conversationId);
  assert.equal(sessionStarted.metadata?.targetId, 'participant-inline-record');
  assert.equal(sessionStarted.metadata?.targetStateId, 'target-canonical-lane-target-fallback');
  assert.equal(sessionStarted.metadata?.laneId, 'lane-canonical-lane-target-fallback');
  assert.match(sessionStarted.body, /Canonical Lane Agent/u);
});

test('repairMissingStartupRecoveryNotice inserts an interrupted-turn note before the next user message', async () => {
  const chatStore = new MemoryChatStore();
  const seededAt = new Date('2026-04-09T12:00:00.000Z');
  let state = await chatStore.read();
  state = createChannel(
    state,
    {
      title: 'Interrupted startup recovery',
      topic: 'Show a visible note when startup recovery blocked the prior turn.',
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelId = state.selectedChannelId;
  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'user',
      senderName: 'User',
      body: 'First question',
    },
    new Date('2026-04-09T12:00:01.000Z'),
  ).state;
  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'system',
      senderName: 'Runtime',
      body: 'Chat connected to cats-runtime session session-interrupted.\n(cwd: C:/runtime/session-interrupted)',
    },
    new Date('2026-04-09T12:00:01.000Z'),
    {
      metadata: {
        event: 'session_started',
        targetKind: 'orchestrator',
        sessionId: 'session-interrupted',
      },
      incrementUnread: false,
    },
  ).state;
  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'user',
      senderName: 'User',
      body: 'Second question',
    },
    new Date('2026-04-09T12:10:00.000Z'),
  ).state;

  const channel = requireChannel(state, channelId);
  channel.roomRouting.workflow.turnHistory.unshift({
    id: 'turn-startup-recovery',
    status: 'blocked',
    sourceMessageId: channel.messages[1].id,
    sourceSenderKind: 'user',
    sourceSenderName: 'User',
    guard: null,
    stageId: 'startup_recovery',
    workflowShape: 'sequential',
    reviewRequired: false,
    lastCheckpointId: 'checkpoint-startup-recovery',
    convergeTargetId: null,
    continuationCount: 0,
    dispatchCount: 0,
    targetStatuses: [
      {
        id: 'target-startup-recovery',
        dispatchId: 'dispatch-startup-recovery',
        participant: {
          participantKind: 'orchestrator',
          participantId: 'orchestrator',
          participantName: 'Chat',
        },
        source: null,
        sourceMessageId: channel.messages[1].id,
        trigger: 'room_default',
        mentionNames: [],
        depth: 0,
        parentCheckpointId: 'checkpoint-startup-recovery',
        branchStrategy: 'fresh_no_parent',
        handoffReason: 'room_default',
        wakeRequestId: 'wake-startup-recovery',
        status: 'blocked',
        queuedAt: '2026-04-09T12:00:01.000Z',
        startedAt: '2026-04-09T12:00:01.000Z',
        completedAt: '2026-04-09T12:05:00.000Z',
        response: null,
        error: 'Cats server restarted before room workflow cleanup completed.',
      },
    ],
    events: [
      {
        id: 'event-startup-recovery',
        turnId: 'turn-startup-recovery',
        kind: 'outcome',
        status: 'blocked',
        message: 'Room workflow moved to blocked recovery after startup interrupted the active turn.',
        actor: null,
        sourceMessageId: channel.messages[1].id,
        targets: [
          {
            participantKind: 'orchestrator',
            participantId: 'orchestrator',
            participantName: 'Chat',
          },
        ],
        dispatchId: null,
        checkpointId: null,
        outcomeId: null,
        createdAt: '2026-04-09T12:05:00.000Z',
        metadata: {
          recoverySource: 'server_restart',
          interruptedError: 'Cats server restarted before room workflow cleanup completed.',
        },
      },
    ],
    startedAt: '2026-04-09T12:00:01.000Z',
    updatedAt: '2026-04-09T12:05:00.000Z',
    completedAt: '2026-04-09T12:05:00.000Z',
  });

  const repaired = repairMissingStartupRecoveryNotice(
    state,
    channelId,
    { now: new Date('2026-04-09T12:15:00.000Z') },
  );

  assert.equal(repaired.repaired, true);
  const repairedChannel = requireChannel(repaired.state, channelId);
  const sourceIndex = repairedChannel.messages.findIndex((message) => message.body === 'First question');
  const noticeIndex = repairedChannel.messages.findIndex((message) =>
    message.metadata?.event === 'workflow_interrupted'
    && message.metadata?.turnId === 'turn-startup-recovery');
  const nextUserIndex = repairedChannel.messages.findIndex((message) => message.body === 'Second question');

  assert.ok(sourceIndex >= 0);
  assert.ok(noticeIndex > sourceIndex);
  assert.ok(nextUserIndex > noticeIndex);
  assert.match(
    repairedChannel.messages[noticeIndex].body,
    /Cats server restarted before room workflow cleanup completed/i,
  );
});

test('repairMissingStartupRecoveryNotice falls back to canonical turn timing when the source message drifted', async () => {
  const chatStore = new MemoryChatStore();
  const seededAt = new Date('2026-04-09T12:00:00.000Z');
  let state = await chatStore.read();
  state = createChannel(
    state,
    {
      title: 'Interrupted startup recovery with drift',
      topic: 'Restore startup notice even when the source user message is missing.',
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelId = state.selectedChannelId;
  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'user',
      senderName: 'User',
      body: 'First question',
    },
    new Date('2026-04-09T12:00:01.000Z'),
  ).state;
  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'system',
      senderName: 'Runtime',
      body: 'Chat connected to cats-runtime session session-interrupted.\n(cwd: C:/runtime/session-interrupted)',
    },
    new Date('2026-04-09T12:00:01.000Z'),
    {
      metadata: {
        event: 'session_started',
        targetKind: 'orchestrator',
        sessionId: 'session-interrupted',
      },
      incrementUnread: false,
    },
  ).state;
  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'user',
      senderName: 'User',
      body: 'Second question',
    },
    new Date('2026-04-09T12:10:00.000Z'),
  ).state;

  const channel = requireChannel(state, channelId);
  const sourceMessageId = channel.messages[1].id;
  channel.roomRouting.workflow.turnHistory.unshift({
    id: 'turn-startup-recovery-drifted',
    status: 'blocked',
    sourceMessageId,
    sourceSenderKind: 'user',
    sourceSenderName: 'User',
    guard: null,
    stageId: 'startup_recovery',
    workflowShape: 'sequential',
    reviewRequired: false,
    lastCheckpointId: 'checkpoint-startup-recovery-drifted',
    convergeTargetId: null,
    continuationCount: 0,
    dispatchCount: 0,
    targetStatuses: [
      {
        id: 'target-startup-recovery-drifted',
        dispatchId: 'dispatch-startup-recovery-drifted',
        participant: {
          participantKind: 'orchestrator',
          participantId: 'orchestrator',
          participantName: 'Chat',
        },
        source: null,
        sourceMessageId,
        trigger: 'room_default',
        mentionNames: [],
        depth: 0,
        parentCheckpointId: 'checkpoint-startup-recovery-drifted',
        branchStrategy: 'fresh_no_parent',
        handoffReason: 'room_default',
        wakeRequestId: 'wake-startup-recovery-drifted',
        status: 'blocked',
        queuedAt: '2026-04-09T12:00:01.000Z',
        startedAt: '2026-04-09T12:00:01.000Z',
        completedAt: '2026-04-09T12:05:00.000Z',
        response: null,
        error: 'Cats server restarted before room workflow cleanup completed.',
      },
    ],
    events: [
      {
        id: 'event-startup-recovery-drifted',
        turnId: 'turn-startup-recovery-drifted',
        kind: 'outcome',
        status: 'blocked',
        message: 'Room workflow moved to blocked recovery after startup interrupted the active turn.',
        actor: null,
        sourceMessageId,
        targets: [
          {
            participantKind: 'orchestrator',
            participantId: 'orchestrator',
            participantName: 'Chat',
          },
        ],
        dispatchId: null,
        checkpointId: null,
        outcomeId: null,
        createdAt: '2026-04-09T12:05:00.000Z',
        metadata: {
          recoverySource: 'server_restart',
          interruptedError: 'Cats server restarted before room workflow cleanup completed.',
        },
      },
    ],
    startedAt: '2026-04-09T12:00:01.000Z',
    updatedAt: '2026-04-09T12:05:00.000Z',
    completedAt: '2026-04-09T12:05:00.000Z',
  });

  await chatStore.write(state);
  const core = await chatStore.readCore();
  const driftedState = structuredClone(state);
  requireChannel(driftedState, channelId).messages = requireChannel(driftedState, channelId)
    .messages
    .filter((message) => message.id !== sourceMessageId);

  const repaired = repairMissingStartupRecoveryNotice(
    driftedState,
    channelId,
    {
      core,
      now: new Date('2026-04-09T12:15:00.000Z'),
    },
  );

  assert.equal(repaired.repaired, true);
  const repairedChannel = requireChannel(repaired.state, channelId);
  const noticeIndex = repairedChannel.messages.findIndex((message) =>
    message.metadata?.event === 'workflow_interrupted'
    && message.metadata?.turnId === 'turn-startup-recovery-drifted');
  const nextUserIndex = repairedChannel.messages.findIndex((message) => message.body === 'Second question');

  assert.ok(noticeIndex >= 0);
  assert.ok(nextUserIndex > noticeIndex);
  assert.match(
    repairedChannel.messages[noticeIndex].body,
    /Cats server restarted before room workflow cleanup completed/i,
  );
});

test('repairMissingStartupRecoveryNotice uses canonical assistant source timing for drifted later sequential handoffs', async () => {
  const chatStore = new MemoryChatStore();
  const seededAt = new Date('2026-04-09T12:20:00.000Z');
  let state = await chatStore.read();
  state = createChannel(
    state,
    {
      title: 'Interrupted later sequential startup recovery',
      topic: 'Place startup recovery notice after the missing assistant handoff frontier.',
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelId = state.selectedChannelId;
  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'user',
      senderName: 'User',
      body: 'Initial room request',
    },
    new Date('2026-04-09T12:20:01.000Z'),
  ).state;
  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'user',
      senderName: 'User',
      body: 'Queued follow-up while the room was still running',
    },
    new Date('2026-04-09T12:20:04.000Z'),
  ).state;
  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'Agent-1',
      body: '@Agent-2 continue the recovered room step.',
    },
    new Date('2026-04-09T12:20:05.000Z'),
    {
      metadata: {
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-later-sequential-source',
        targetStateId: 'target-later-sequential-source',
        terminal: true,
        turnId: 'turn-later-sequential-recovery',
        targetKind: 'cat',
        targetId: 'participant-agent-1',
        routingTrigger: 'continuation_mention',
        dispatchDepth: 0,
      },
      incrementUnread: false,
    },
  ).state;

  const channel = requireChannel(state, channelId);
  const sourceAssistantMessageId = channel.messages.at(-1)?.id;
  assert.ok(sourceAssistantMessageId);
  channel.roomRouting.workflow.turnHistory.unshift({
    id: 'turn-later-sequential-recovery',
    status: 'blocked',
    sourceMessageId: sourceAssistantMessageId,
    sourceSenderKind: 'agent',
    sourceSenderName: 'Agent-1',
    guard: null,
    stageId: 'startup_recovery',
    workflowShape: 'sequential',
    reviewRequired: false,
    lastCheckpointId: 'checkpoint-later-sequential-recovery',
    convergeTargetId: null,
    continuationCount: 1,
    dispatchCount: 2,
    targetStatuses: [
      {
        id: 'target-later-sequential-recovery',
        dispatchId: 'dispatch-later-sequential-recovery',
        participant: {
          participantKind: 'cat',
          participantId: 'participant-agent-2',
          participantName: 'Agent-2',
        },
        source: {
          participantKind: 'cat',
          participantId: 'participant-agent-1',
          participantName: 'Agent-1',
        },
        sourceMessageId: sourceAssistantMessageId,
        trigger: 'continuation_mention',
        mentionNames: ['Agent-2'],
        depth: 1,
        parentCheckpointId: 'checkpoint-later-sequential-recovery',
        branchStrategy: 'transplant_context',
        handoffReason: 'workflow_continuation',
        wakeRequestId: 'wake-later-sequential-recovery',
        status: 'blocked',
        queuedAt: '2026-04-09T12:20:05.000Z',
        startedAt: '2026-04-09T12:20:05.000Z',
        completedAt: '2026-04-09T12:20:07.000Z',
        response: null,
        error: 'Cats server restarted before room workflow cleanup completed.',
      },
    ],
    events: [
      {
        id: 'event-later-sequential-recovery',
        turnId: 'turn-later-sequential-recovery',
        kind: 'outcome',
        status: 'blocked',
        message: 'Room workflow moved to blocked recovery after startup interrupted the active turn.',
        actor: null,
        sourceMessageId: sourceAssistantMessageId,
        targets: [
          {
            participantKind: 'cat',
            participantId: 'participant-agent-2',
            participantName: 'Agent-2',
          },
        ],
        dispatchId: null,
        checkpointId: null,
        outcomeId: null,
        createdAt: '2026-04-09T12:20:07.000Z',
        metadata: {
          recoverySource: 'server_restart',
          interruptedError: 'Cats server restarted before room workflow cleanup completed.',
        },
      },
    ],
    startedAt: '2026-04-09T12:20:01.000Z',
    updatedAt: '2026-04-09T12:20:07.000Z',
    completedAt: '2026-04-09T12:20:07.000Z',
  });

  await chatStore.write(state);
  const core = await chatStore.readCore();
  const driftedState = structuredClone(state);
  requireChannel(driftedState, channelId).messages = requireChannel(driftedState, channelId)
    .messages
    .filter((message) => message.id !== sourceAssistantMessageId);

  const repaired = repairMissingStartupRecoveryNotice(
    driftedState,
    channelId,
    {
      core,
      now: new Date('2026-04-09T12:25:00.000Z'),
    },
  );

  assert.equal(repaired.repaired, true);
  const repairedChannel = requireChannel(repaired.state, channelId);
  const queuedUserIndex = repairedChannel.messages.findIndex((message) =>
    message.body === 'Queued follow-up while the room was still running');
  const noticeIndex = repairedChannel.messages.findIndex((message) =>
    message.metadata?.event === 'workflow_interrupted'
    && message.metadata?.turnId === 'turn-later-sequential-recovery');

  assert.ok(queuedUserIndex >= 0);
  assert.ok(noticeIndex > queuedUserIndex);
  assert.match(
    repairedChannel.messages[noticeIndex].body,
    /Cats server restarted before room workflow cleanup completed/i,
  );
});

test('repairMissingStartupRecoveryNotice prefers source identity when startup recovery source message ids drift', async () => {
  const chatStore = new MemoryChatStore();
  const seededAt = new Date('2026-04-09T12:30:00.000Z');
  let state = await chatStore.read();
  state = createChannel(
    state,
    {
      title: 'Interrupted later sequential startup recovery with drifted source ids',
      topic: 'Use canonical source identity instead of drifted source message ids when inserting recovery notices.',
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelId = state.selectedChannelId;
  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'user',
      senderName: 'User',
      body: 'Initial room request',
    },
    new Date('2026-04-09T12:30:01.000Z'),
  ).state;
  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'user',
      senderName: 'User',
      body: 'Queued follow-up while the room was still running',
    },
    new Date('2026-04-09T12:30:04.000Z'),
  ).state;
  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'Agent-1',
      body: '@Agent-2 continue the recovered room step.',
    },
    new Date('2026-04-09T12:30:05.000Z'),
    {
      metadata: {
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-later-sequential-source-identity',
        targetStateId: 'target-later-sequential-source-identity',
        terminal: true,
        turnId: 'turn-later-sequential-source-identity',
        transportBindingId: 'transport-binding-source-identity',
        targetKind: 'cat',
        targetId: 'participant-agent-1',
        routingTrigger: 'continuation_mention',
        dispatchDepth: 0,
      },
      incrementUnread: false,
    },
  ).state;

  const channel = requireChannel(state, channelId);
  const sourceAssistantMessageId = channel.messages.at(-1)?.id;
  assert.ok(sourceAssistantMessageId);
  channel.roomRouting.workflow.turnHistory.unshift({
    id: 'turn-later-sequential-source-identity',
    status: 'blocked',
    sourceMessageId: 'drifted-source-message-id',
    sourceSenderKind: 'agent',
    sourceSenderName: 'Agent-1',
    guard: null,
    stageId: 'startup_recovery',
    workflowShape: 'sequential',
    reviewRequired: false,
    lastCheckpointId: 'checkpoint-later-sequential-source-identity',
    convergeTargetId: null,
    continuationCount: 1,
    dispatchCount: 2,
    targetStatuses: [
      {
        id: 'target-earlier-noise',
        dispatchId: 'dispatch-earlier-noise',
        participant: {
          participantKind: 'cat',
          participantId: 'participant-agent-noise',
          participantName: 'Agent-Noise',
        },
        source: {
          participantKind: 'cat',
          participantId: 'participant-agent-1',
          participantName: 'Agent-1',
        },
        sourceMessageId: 'drifted-source-message-id',
        sourceTurnId: 'turn-noise',
        sourceLaneId: 'lane-noise',
        sourceAssistantTurnId: 'assistant-turn-noise',
        trigger: 'continuation_mention',
        mentionNames: ['Agent-Noise'],
        depth: 1,
        parentCheckpointId: 'checkpoint-later-sequential-source-identity',
        branchStrategy: 'transplant_context',
        handoffReason: 'workflow_continuation',
        wakeRequestId: 'wake-earlier-noise',
        status: 'blocked',
        queuedAt: '2026-04-09T12:30:02.000Z',
        startedAt: '2026-04-09T12:30:02.000Z',
        completedAt: '2026-04-09T12:30:03.000Z',
        response: null,
        error: 'Cats server restarted before room workflow cleanup completed.',
      },
      {
        id: 'target-later-sequential-source-identity',
        dispatchId: 'dispatch-later-sequential-source-identity',
        participant: {
          participantKind: 'cat',
          participantId: 'participant-agent-2',
          participantName: 'Agent-2',
        },
        source: {
          participantKind: 'cat',
          participantId: 'participant-agent-1',
          participantName: 'Agent-1',
        },
        sourceMessageId: 'drifted-source-message-id',
        sourceTurnId: 'turn-later-sequential-source-identity',
        sourceLaneId: 'lane-later-sequential-source-identity',
        sourceAssistantTurnId: 'assistant-turn-later-sequential-source-identity',
        trigger: 'continuation_mention',
        mentionNames: ['Agent-2'],
        depth: 1,
        parentCheckpointId: 'checkpoint-later-sequential-source-identity',
        branchStrategy: 'transplant_context',
        handoffReason: 'workflow_continuation',
        wakeRequestId: 'wake-later-sequential-source-identity',
        status: 'blocked',
        queuedAt: '2026-04-09T12:30:05.000Z',
        startedAt: '2026-04-09T12:30:05.000Z',
        completedAt: '2026-04-09T12:30:07.000Z',
        response: null,
        error: 'Cats server restarted before room workflow cleanup completed.',
      },
    ],
    events: [
      {
        id: 'event-later-sequential-source-identity',
        turnId: 'turn-later-sequential-source-identity',
        kind: 'outcome',
        status: 'blocked',
        message: 'Room workflow moved to blocked recovery after startup interrupted the active turn.',
        actor: null,
        sourceMessageId: 'drifted-source-message-id',
        targets: [
          {
            participantKind: 'cat',
            participantId: 'participant-agent-2',
            participantName: 'Agent-2',
          },
        ],
        dispatchId: null,
        checkpointId: null,
        outcomeId: null,
        createdAt: '2026-04-09T12:30:07.000Z',
        metadata: {
          recoverySource: 'server_restart',
          interruptedError: 'Cats server restarted before room workflow cleanup completed.',
        },
      },
    ],
    startedAt: '2026-04-09T12:30:01.000Z',
    updatedAt: '2026-04-09T12:30:07.000Z',
    completedAt: '2026-04-09T12:30:07.000Z',
  });

  await chatStore.write(state);
  const core = await chatStore.readCore();
  const driftedState = structuredClone(state);
  requireChannel(driftedState, channelId).messages = requireChannel(driftedState, channelId)
    .messages
    .filter((message) => message.id !== sourceAssistantMessageId);

  const repaired = repairMissingStartupRecoveryNotice(
    driftedState,
    channelId,
    {
      core,
      now: new Date('2026-04-09T12:35:00.000Z'),
    },
  );

  assert.equal(repaired.repaired, true);
  const repairedChannel = requireChannel(repaired.state, channelId);
  const queuedUserIndex = repairedChannel.messages.findIndex((message) =>
    message.body === 'Queued follow-up while the room was still running');
  const noticeIndex = repairedChannel.messages.findIndex((message) =>
    message.metadata?.event === 'workflow_interrupted'
    && message.metadata?.turnId === 'turn-later-sequential-source-identity');
  const notice = noticeIndex >= 0 ? repairedChannel.messages[noticeIndex] : null;

  assert.ok(queuedUserIndex >= 0);
  assert.ok(noticeIndex > queuedUserIndex);
  assert.equal(notice?.metadata?.containerId, CHAT_ROOT_CONTAINER_ID);
  assert.equal(notice?.metadata?.conversationId, buildChatConversationId(channelId));
  assert.equal(notice?.metadata?.sourceMessageId, sourceAssistantMessageId);
  assert.equal(notice?.metadata?.sourceTurnId, 'turn-later-sequential-source-identity');
  assert.equal(notice?.metadata?.sourceLaneId, 'lane-later-sequential-source-identity');
  assert.equal(
    notice?.metadata?.sourceAssistantTurnId,
    'assistant-turn-later-sequential-source-identity',
  );
  assert.equal(notice?.metadata?.transportBindingId, 'transport-binding-source-identity');
});
