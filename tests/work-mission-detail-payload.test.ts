import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreMission,
  upsertCoreRun,
} from '../src/core/model/index.js';
import {
  createWorkMissionDetailPayload,
  createWorkMissionListPayload,
} from '../src/products/work/api/index.js';

test('createWorkMissionDetailPayload returns null for an unknown mission id', () => {
  const detail = createWorkMissionDetailPayload(createDefaultCoreState(), 'mission-unknown');
  assert.equal(detail, null);
});

test('createWorkMissionDetailPayload exposes direct mission runs without managed work', () => {
  // Mission has no managed work bridge; the detail payload must
  // still surface the back-referenced run via inspectMission so the
  // Work mission detail renderer no longer reports "no linked
  // work item / no run".
  let core = createDefaultCoreState();
  core = upsertCoreMission(
    core,
    {
      id: 'mission-direct',
      title: 'Mission with no managed work',
      status: 'running',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-back-ref',
      title: 'Run anchored only by metadata.missionId',
      status: 'running',
      orchestratorActorId: null,
      metadata: { missionId: 'mission-direct' },
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;

  const detail = createWorkMissionDetailPayload(core, 'mission-direct');
  assert.ok(detail);
  assert.equal(detail?.mission.id, 'mission-direct');
  assert.equal(detail?.runs.length, 1);
  assert.equal(detail?.runs[0]?.id, 'run-back-ref');
  assert.equal(detail?.activeRunCount, 1);
  assert.equal(detail?.terminalRunCount, 0);
});

test('createWorkMissionListPayload defaults to hiding internal missions and honors includeInternal', () => {
  let core = createDefaultCoreState();
  core = upsertCoreMission(
    core,
    {
      id: 'mission-failed',
      title: 'Failed mission (requires_review)',
      status: 'failed',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    {
      id: 'mission-internal',
      title: 'Internal background sweep',
      status: 'completed',
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;

  const defaultPayload = createWorkMissionListPayload(core);
  const defaultIds = defaultPayload.missions.map((mission) => mission.id);
  assert.deepEqual(defaultIds, ['mission-failed']);
  assert.equal(defaultPayload.summary.returned, 1);
  assert.equal(defaultPayload.summary.totalAvailable, 2);
  assert.equal(defaultPayload.summary.internalCount, 1);

  const includeAll = createWorkMissionListPayload(core, { includeInternal: true });
  const includeAllIds = includeAll.missions.map((mission) => mission.id).sort();
  assert.deepEqual(includeAllIds, ['mission-failed', 'mission-internal']);
  assert.equal(includeAll.summary.returned, 2);
});
