import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createChannel,
  requireChannel,
} from '../build/server/products/chat/state/model/index.js';
import {
  beginChannelMessageDispatch,
  settleBegunChannelMessageDispatchFailure,
} from '../build/server/products/chat/state/runtimeActions.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { mergeCompletedDispatchState } from '../build/server/products/chat/state/runtime-dispatch/merge.js';

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
