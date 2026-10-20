import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import { createChannel, setChannelParticipantLease } from '../src/products/chat/state/model/index.ts';
import { MemoryChatStore } from '../src/products/chat/state/store.ts';
import { createConversationExecutionInspector } from '../src/products/chat/state/conversationExecutionInspection.ts';
import { buildChatConversationId } from '../src/shared/chatCoreIds.ts';
import { buildRoomWorkflowRunId, buildRoomWorkflowMissionId } from '../src/platform/orchestration/runIds.ts';
import { setOwnerEntry } from '../src/core/ownerLifecycle.ts';
import type { RoomWorkflowTurn } from '../src/shared/roomRouting.ts';
import { createCodeWorkAreasService } from '../src/products/code/state/workAreas.ts';
import { runtimeInspection, runtimeSnapshot } from './fixtures/workAreas.ts';

function fixture() {
  const now = '2026-10-20T00:00:00.000Z';
  let chat = createChannel(createDefaultChatState(), { title: 'Code', topic: '', originSurface: 'code',
    entryKind: 'group', repoPath: path.resolve('fixture-only'), temporaryParticipants: [{
      participantId: 'coder', name: 'Coder', provider: 'claude', instance: 'native',
      model: 'claude-sonnet', modelSelection: null,
    }] }, new Date(now));
  const channelId = chat.selectedChannelId;
  chat = setChannelParticipantLease(chat, channelId, 'coder', {
    sessionId: 'session-a', laneId: 'lane-a', status: 'ready', startedAt: now,
  });
  const channel = chat.channels.find(c => c.id === channelId)!;
  channel.coordinatorParticipantId = 'coder';
  const turn: RoomWorkflowTurn = { id: 'turn-a', status: 'running', sourceMessageId: 'user-a',
    sourceSenderKind: 'user', sourceSenderName: 'Owner', guard: null, stageId: 'dispatch',
    workflowShape: 'sequential', reviewRequired: false, lastCheckpointId: null, convergeTargetId: null,
    continuationCount: 0, dispatchCount: 1, startedAt: now, updatedAt: now, completedAt: null, events: [],
    targetStatuses: [{ id: 'target-a', dispatchId: 'dispatch-a',
      participant: { participantKind: 'cat', participantId: 'coder', participantName: 'Coder' },
      laneId: 'lane-a', sessionId: 'session-a', source: null, sourceMessageId: 'user-a',
      trigger: 'explicit_mention', mentionNames: [], depth: 0, parentCheckpointId: null,
      branchStrategy: null, handoffReason: null, wakeRequestId: null, status: 'running',
      queuedAt: now, startedAt: now, completedAt: null, response: null, error: null }],
  };
  channel.roomRouting!.workflow = { activeTurn: turn, turnHistory: [], eventHistory: [],
    lastCheckpointEvent: null, lastOutcomeEvent: null };
  const store = new MemoryChatStore(chat);
  return { store, channelId, conversationId: buildChatConversationId(channelId) };
}

test('engine inspection reads canonical provider/model participant provenance without mutating stores', async () => {
  const { store, conversationId } = fixture();
  const before = [await store.read(), await store.readCore()];
  // Any repair/write during inspection is a failure, including the atomic snapshot path.
  store.write = async () => { throw new Error('unexpected write'); };
  store.updateSnapshot = async () => { throw new Error('unexpected update'); };
  const context = (await createConversationExecutionInspector(store).read(conversationId))!;
  assert.equal(context.owned, true);
  assert.equal(context.origin, 'code');
  assert.equal(context.participants.length, 1);
  const participant = context.participants[0];
  assert.equal(participant.sourceKind, 'adhoc');
  assert.equal(participant.coordinator, true);
  assert.notEqual(participant.canonicalParticipantId, participant.participantId);
  assert.equal(participant.attempts[0].bindings[0].turnId, 'turn-a');
  assert.equal(participant.attempts[0].activeBindings.length, 1);
  assert.deepEqual([await store.read(), await store.readCore()], before);
  assert.equal(await createConversationExecutionInspector(store).read('another-conversation'), null);
});

for (const family of ['run', 'mission'] as const) for (const intent of ['logs', 'deleted'] as const) {
  test(`engine ${family} ${intent} cleanup removes workflow and retained Core fallback attribution`, async () => {
    const { store, conversationId, channelId } = fixture();
    const inspector = createConversationExecutionInspector(store);
    const original = (await inspector.read(conversationId))!;
    const snapshot = runtimeSnapshot('session-a', 'runtime-run-a', true);
    const payload = runtimeInspection(original, snapshot);
    const service = createCodeWorkAreasService({ inspector, runtime: {
      observeSession: async () => payload, streamSession: async () => {},
    } });
    assert.ok((await service.read(conversationId))!.participants[0].repositories.length);
    const coreBefore = await store.readCore();
    assert.ok(coreBefore.sessions.some(s => s.id === 'session-a' && s.turnId === 'turn-a'));
    assert.ok(coreBefore.lanes.some(l => l.metadata.targetStateId === 'target-a'));
    const id = family === 'run' ? buildRoomWorkflowRunId(channelId, 'turn-a')
      : buildRoomWorkflowMissionId(channelId, 'turn-a', 'target-a');
    await store.updateCore(core => setOwnerEntry(core, family, id,
      intent === 'logs' ? { logsClearedAt: '2026-10-20T01:00:00.000Z' } : { deleted: true }));
    const cleared = (await inspector.read(conversationId))!;
    assert.equal(cleared.participants[0].attempts.flatMap(a => a.bindings).length, 0);
    assert.deepEqual((await service.read(conversationId))!.participants[0].repositories, []);
    // Even after engine history is gone, the Core session/lane cannot restore deleted logs.
    await store.updateSnapshot!(({ chat, core }) => {
      chat.channels.find(c => c.id === channelId)!.roomRouting!.workflow.activeTurn = null;
      return { chat, core };
    });
    const fallback = (await inspector.read(conversationId))!;
    assert.equal(fallback.participants[0].attempts.flatMap(a => a.bindings).length, 0);
    assert.deepEqual((await service.read(conversationId))!.participants[0].repositories, []);
  });
}
