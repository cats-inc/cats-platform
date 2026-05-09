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
  findLooseRunsForConversationFromIndex,
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

test('buildMissionsByConversation surfaces loose conversation runs at the entry level, not per mission', () => {
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
  core = upsertCoreMission(
    core,
    {
      id: 'mission-b',
      title: 'Mission b',
      conversationId: 'conversation-a',
      status: 'queued',
    },
    new Date('2026-04-14T22:00:30.000Z'),
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
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;

  const index = buildMissionsByConversation(core);
  const links = findMissionsForConversation(index, 'conversation-a');
  assert.equal(links.length, 2);
  // Critical regression guard: a loose run must NOT be duplicated
  // across every mission of the same conversation.
  assert.equal(links[0]?.runs.length, 0);
  assert.equal(links[1]?.runs.length, 0);

  const looseRuns = findLooseRunsForConversationFromIndex(index, 'conversation-a');
  assert.equal(looseRuns.length, 1);
  assert.equal(looseRuns[0]?.id, 'run-conversation-only');
});

test('buildMissionsByConversation does not double-count a strongly-claimed run when run.conversationId differs from mission.conversationId', () => {
  let core = createDefaultCoreState();
  core = seedConversation(core, 'conversation-mission');
  core = seedConversation(core, 'conversation-run');
  core = upsertCoreMission(
    core,
    {
      id: 'mission-mismatch',
      title: 'Mission anchored to conversation-mission, claims a run anchored elsewhere',
      conversationId: 'conversation-mission',
      status: 'running',
      metadata: { runId: 'run-elsewhere' },
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-elsewhere',
      title: 'Run anchored to conversation-run',
      status: 'running',
      conversationId: 'conversation-run',
      orchestratorActorId: null,
    },
    new Date('2026-04-14T22:00:30.000Z'),
  ).core;

  const index = buildMissionsByConversation(core);
  const missionLinks = findMissionsForConversation(index, 'conversation-mission');
  assert.equal(missionLinks.length, 1);
  assert.equal(missionLinks[0]?.runs.length, 1);
  assert.equal(missionLinks[0]?.runs[0]?.id, 'run-elsewhere');
  // Critical regression guard: even though the run lives on
  // conversation-run, it must NOT also appear as a loose run there
  // because mission-mismatch already strongly claims it.
  assert.deepEqual(
    findLooseRunsForConversationFromIndex(index, 'conversation-run'),
    [],
  );
});

test('buildMissionsByConversation cross-conversation claim: claimed run never duplicates onto another conversation that also has missions', () => {
  // Stronger regression: both conversations have missions of their
  // own, and a run that conversation B owns is claimed by mission A
  // in conversation A. Previously this could appear twice — once in
  // mission-A.runs and once in conversation-B's mission runs[]
  // (loose-bridge fallthrough) or B's looseRuns. With the global
  // claimedRunIds set, the run must show up exactly once.
  let core = createDefaultCoreState();
  core = seedConversation(core, 'conversation-a');
  core = seedConversation(core, 'conversation-b');
  core = upsertCoreMission(
    core,
    {
      id: 'mission-a',
      title: 'Mission in A claiming run in B',
      conversationId: 'conversation-a',
      status: 'running',
      metadata: { runId: 'run-b' },
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    {
      id: 'mission-b',
      title: 'Independent mission in B',
      conversationId: 'conversation-b',
      status: 'running',
    },
    new Date('2026-04-14T22:00:30.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-b',
      title: 'Run anchored to conversation-b',
      status: 'running',
      conversationId: 'conversation-b',
      orchestratorActorId: null,
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;

  const index = buildMissionsByConversation(core);

  // Mission A in conversation-a is the sole claimant of run-b.
  const aMissions = findMissionsForConversation(index, 'conversation-a');
  assert.equal(aMissions.length, 1);
  assert.equal(aMissions[0]?.runs.length, 1);
  assert.equal(aMissions[0]?.runs[0]?.id, 'run-b');

  // Mission B in conversation-b must NOT inherit run-b just because
  // it shares the conversation. Its runs[] stays empty.
  const bMissions = findMissionsForConversation(index, 'conversation-b');
  assert.equal(bMissions.length, 1);
  assert.equal(bMissions[0]?.runs.length, 0);

  // Conversation-b's looseRuns must NOT contain run-b either, since
  // mission A globally claims it.
  assert.deepEqual(
    findLooseRunsForConversationFromIndex(index, 'conversation-b'),
    [],
  );
});

test('buildMissionsByConversation does not surface a strongly-claimed run as a loose run', () => {
  let core = createDefaultCoreState();
  core = seedConversation(core, 'conversation-a');
  core = upsertCoreMission(
    core,
    {
      id: 'mission-a',
      title: 'Mission a',
      conversationId: 'conversation-a',
      status: 'running',
      metadata: { runId: 'run-claimed' },
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-claimed',
      title: 'Strongly claimed run',
      status: 'completed',
      conversationId: 'conversation-a',
      orchestratorActorId: null,
    },
    new Date('2026-04-14T22:00:30.000Z'),
  ).core;

  const index = buildMissionsByConversation(core);
  const links = findMissionsForConversation(index, 'conversation-a');
  assert.equal(links[0]?.runs.length, 1);
  assert.equal(
    findLooseRunsForConversationFromIndex(index, 'conversation-a').length,
    0,
  );
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
