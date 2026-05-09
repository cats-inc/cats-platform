import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreConversation,
  upsertCoreMission,
  upsertCoreRun,
} from '../src/core/model/index.js';
import {
  buildMissionsByConversation,
  findMissionsForConversation,
} from '../src/core/missionsByConversation.js';

function seedConversation(
  coreInput: ReturnType<typeof createDefaultCoreState>,
  id: string,
): ReturnType<typeof createDefaultCoreState> {
  return upsertCoreConversation(
    coreInput,
    {
      id,
      title: id,
      kind: 'work_thread',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
}

test('buildMissionsByConversation groups missions by conversation and folds in runs via metadata.runId', () => {
  let core = createDefaultCoreState();
  core = seedConversation(core, 'conversation-a');
  core = upsertCoreRun(
    core,
    {
      id: 'run-a',
      title: 'Run for mission-a',
      status: 'running',
      conversationId: 'conversation-a',
      orchestratorActorId: null,
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    {
      id: 'mission-a',
      title: 'Mission a',
      conversationId: 'conversation-a',
      status: 'running',
      metadata: { runId: 'run-a' },
    },
    new Date('2026-04-14T22:00:30.000Z'),
  ).core;

  const index = buildMissionsByConversation(core);
  const link = findMissionsForConversation(index, 'conversation-a');
  assert.equal(link.length, 1);
  assert.equal(link[0]?.mission.id, 'mission-a');
  assert.equal(link[0]?.runs.length, 1);
  assert.equal(link[0]?.runs[0]?.id, 'run-a');
});

test('buildMissionsByConversation folds in runs via run.metadata.missionId back-references', () => {
  let core = createDefaultCoreState();
  core = seedConversation(core, 'conversation-a');
  core = upsertCoreMission(
    core,
    {
      id: 'mission-a',
      title: 'Mission a',
      conversationId: 'conversation-a',
      status: 'running',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-back-ref',
      title: 'Back-referenced run',
      status: 'queued',
      orchestratorActorId: null,
      metadata: { missionId: 'mission-a' },
    },
    new Date('2026-04-14T22:00:30.000Z'),
  ).core;

  const index = buildMissionsByConversation(core);
  const link = findMissionsForConversation(index, 'conversation-a');
  assert.equal(link.length, 1);
  assert.equal(link[0]?.runs.length, 1);
  assert.equal(link[0]?.runs[0]?.id, 'run-back-ref');
});

test('buildMissionsByConversation uses the loose conversation bridge only when neither reference is present', () => {
  let core = createDefaultCoreState();
  core = seedConversation(core, 'conversation-a');
  core = upsertCoreMission(
    core,
    {
      id: 'mission-a',
      title: 'Mission a',
      conversationId: 'conversation-a',
      status: 'running',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-conversation-only',
      title: 'Run anchored only by conversation',
      status: 'completed',
      conversationId: 'conversation-a',
      orchestratorActorId: null,
    },
    new Date('2026-04-14T22:00:30.000Z'),
  ).core;

  const index = buildMissionsByConversation(core);
  const link = findMissionsForConversation(index, 'conversation-a');
  assert.equal(link.length, 1);
  assert.equal(link[0]?.runs.length, 1);
  assert.equal(link[0]?.runs[0]?.id, 'run-conversation-only');
});

test('buildMissionsByConversation surfaces unanchored missions separately', () => {
  let core = createDefaultCoreState();
  core = upsertCoreMission(
    core,
    {
      id: 'mission-floating',
      title: 'No conversation',
      status: 'planned',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;

  const index = buildMissionsByConversation(core);
  assert.equal(index.unanchoredMissions.length, 1);
  assert.equal(index.unanchoredMissions[0]?.mission.id, 'mission-floating');
  assert.equal(index.entries.length, 0);
});

test('buildMissionsByConversation entries are sorted by conversation id and supports many missions per conversation', () => {
  let core = createDefaultCoreState();
  core = seedConversation(core, 'conversation-z');
  core = seedConversation(core, 'conversation-a');
  core = upsertCoreMission(
    core,
    {
      id: 'mission-1',
      title: 'First',
      conversationId: 'conversation-z',
      status: 'running',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    {
      id: 'mission-2',
      title: 'Second',
      conversationId: 'conversation-z',
      status: 'queued',
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    {
      id: 'mission-3',
      title: 'Third',
      conversationId: 'conversation-a',
      status: 'planned',
    },
    new Date('2026-04-14T22:02:00.000Z'),
  ).core;

  const index = buildMissionsByConversation(core);
  assert.deepEqual(
    index.entries.map((entry) => entry.conversationId),
    ['conversation-a', 'conversation-z'],
  );
  const zEntry = index.byConversationId.get('conversation-z');
  assert.equal(zEntry?.missions.length, 2);
});

test('buildMissionsByConversation does not double-count when both metadata bridges agree', () => {
  let core = createDefaultCoreState();
  core = seedConversation(core, 'conversation-a');
  core = upsertCoreMission(
    core,
    {
      id: 'mission-a',
      title: 'Mission a',
      conversationId: 'conversation-a',
      status: 'running',
      metadata: { runId: 'run-a' },
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-a',
      title: 'Run a',
      status: 'running',
      conversationId: 'conversation-a',
      orchestratorActorId: null,
      metadata: { missionId: 'mission-a' },
    },
    new Date('2026-04-14T22:00:30.000Z'),
  ).core;

  const index = buildMissionsByConversation(core);
  const link = findMissionsForConversation(index, 'conversation-a');
  assert.equal(link[0]?.runs.length, 1);
  assert.equal(link[0]?.runs[0]?.id, 'run-a');
});
