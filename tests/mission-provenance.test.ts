import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreMission,
} from '../src/core/model/index.js';
import {
  MISSION_METADATA_IDEMPOTENCY_KEY,
} from '../src/core/missionIdempotency.js';
import {
  MISSION_METADATA_PARENT_MISSION_KEY,
  buildMissionProvenance,
  findMissionLineage,
  readMissionParentMissionId,
  withMissionParentMissionId,
} from '../src/core/missionProvenance.js';
import {
  MISSION_METADATA_SCHEDULE_KEY,
  MISSION_METADATA_TRIGGER_KEY,
} from '../src/core/missionTriggers.js';

test('buildMissionProvenance aggregates intrinsic fields and metadata-backed provenance', () => {
  let core = createDefaultCoreState();
  core = upsertCoreMission(
    core,
    {
      id: 'mission-cron-1',
      title: 'Cron-fired mission',
      conversationId: 'conversation-1',
      sourceTurnId: 'turn-1',
      sourceLaneId: 'lane-1',
      status: 'queued',
      createdAt: '2026-05-09T01:00:00.000Z',
      metadata: {
        [MISSION_METADATA_TRIGGER_KEY]: {
          kind: 'cron',
          scheduleRuleId: 'rule-1',
          firedAt: '2026-05-09T01:00:00.000Z',
        },
        [MISSION_METADATA_SCHEDULE_KEY]: {
          kind: 'cron',
          cronExpression: '0 * * * *',
          timezone: 'UTC',
          expiresAt: null,
        },
        [MISSION_METADATA_IDEMPOTENCY_KEY]: 'cron-tick-2026-05-09T01:00',
        [MISSION_METADATA_PARENT_MISSION_KEY]: 'mission-parent',
      },
    },
    new Date('2026-05-09T01:00:00.000Z'),
  ).core;
  const mission = core.missions.find((candidate) => candidate.id === 'mission-cron-1');
  assert.ok(mission);

  const provenance = buildMissionProvenance(mission);
  assert.equal(provenance.missionId, 'mission-cron-1');
  assert.equal(provenance.trigger?.kind, 'cron');
  assert.equal(provenance.scheduleRule?.kind, 'cron');
  assert.equal(provenance.parentMissionId, 'mission-parent');
  assert.equal(provenance.idempotencyKey, 'cron-tick-2026-05-09T01:00');
  assert.equal(provenance.conversationId, 'conversation-1');
  assert.equal(provenance.sourceTurnId, 'turn-1');
  assert.equal(provenance.sourceLaneId, 'lane-1');
  assert.equal(provenance.recordedAt, '2026-05-09T01:00:00.000Z');
});

test('readMissionParentMissionId / withMissionParentMissionId trim and round-trip', () => {
  const initial = { source: 'cron' };
  const withParent = withMissionParentMissionId(initial, '   mission-99   ');
  assert.equal(withParent[MISSION_METADATA_PARENT_MISSION_KEY], 'mission-99');
  assert.equal(withParent.source, 'cron');

  // Empty / blank parent ids do not pollute the metadata.
  const unchanged = withMissionParentMissionId(initial, '   ');
  assert.equal(unchanged[MISSION_METADATA_PARENT_MISSION_KEY], undefined);

  assert.equal(
    readMissionParentMissionId({
      id: 'mission-1',
      managedWorkId: null,
      conversationId: null,
      sourceTurnId: null,
      sourceLaneId: null,
      assignedAgentId: null,
      title: 'X',
      status: 'planned',
      summary: null,
      createdAt: '2026-05-09T01:00:00.000Z',
      updatedAt: '2026-05-09T01:00:00.000Z',
      metadata: { [MISSION_METADATA_PARENT_MISSION_KEY]: 'mission-99' },
    }),
    'mission-99',
  );
});

test('findMissionLineage walks the parent chain until the root', () => {
  let core = createDefaultCoreState();
  core = upsertCoreMission(
    core,
    {
      id: 'mission-grandparent',
      title: 'Grandparent',
      status: 'completed',
    },
    new Date('2026-05-09T00:00:00.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    {
      id: 'mission-parent',
      title: 'Parent',
      status: 'completed',
      metadata: { [MISSION_METADATA_PARENT_MISSION_KEY]: 'mission-grandparent' },
    },
    new Date('2026-05-09T00:01:00.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    {
      id: 'mission-child',
      title: 'Child',
      status: 'queued',
      metadata: { [MISSION_METADATA_PARENT_MISSION_KEY]: 'mission-parent' },
    },
    new Date('2026-05-09T00:02:00.000Z'),
  ).core;

  const lineage = findMissionLineage(core, 'mission-child');
  assert.equal(lineage.cycleDetected, false);
  assert.equal(lineage.brokenLinkAt, null);
  assert.deepEqual(
    lineage.entries.map((entry) => entry.mission.id),
    ['mission-child', 'mission-parent', 'mission-grandparent'],
  );
});

test('findMissionLineage flags a broken parent link', () => {
  let core = createDefaultCoreState();
  core = upsertCoreMission(
    core,
    {
      id: 'mission-orphan',
      title: 'Orphan child',
      status: 'queued',
      metadata: { [MISSION_METADATA_PARENT_MISSION_KEY]: 'mission-missing' },
    },
    new Date('2026-05-09T00:00:00.000Z'),
  ).core;

  const lineage = findMissionLineage(core, 'mission-orphan');
  assert.equal(lineage.brokenLinkAt, 'mission-missing');
  assert.equal(lineage.cycleDetected, false);
  assert.equal(lineage.entries.length, 1);
});

test('findMissionLineage flags a cycle without infinite loop', () => {
  let core = createDefaultCoreState();
  core = upsertCoreMission(
    core,
    {
      id: 'mission-a',
      title: 'A',
      status: 'queued',
      metadata: { [MISSION_METADATA_PARENT_MISSION_KEY]: 'mission-b' },
    },
    new Date('2026-05-09T00:00:00.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    {
      id: 'mission-b',
      title: 'B',
      status: 'queued',
      metadata: { [MISSION_METADATA_PARENT_MISSION_KEY]: 'mission-a' },
    },
    new Date('2026-05-09T00:01:00.000Z'),
  ).core;

  const lineage = findMissionLineage(core, 'mission-a');
  assert.equal(lineage.cycleDetected, true);
  assert.ok(lineage.entries.length >= 2);
});

test('findMissionLineage returns no entries for an unknown mission', () => {
  const core = createDefaultCoreState();
  const lineage = findMissionLineage(core, 'mission-never-seeded');
  assert.deepEqual(lineage.entries, []);
  assert.equal(lineage.cycleDetected, false);
  assert.equal(lineage.brokenLinkAt, null);
});
