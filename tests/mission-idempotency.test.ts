import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreMission,
  upsertCoreRun,
} from '../src/core/model/index.js';
import {
  MISSION_METADATA_IDEMPOTENCY_KEY,
  RUN_METADATA_IDEMPOTENCY_KEY,
  checkMissionIdempotency,
  checkRunIdempotency,
  findMissionByIdempotencyKey,
  findRunByIdempotencyKey,
  readMissionIdempotencyKey,
  readRunIdempotencyKey,
  withMissionIdempotencyKey,
  withRunIdempotencyKey,
} from '../src/core/missionIdempotency.js';

test('readMissionIdempotencyKey trims whitespace and rejects empty values', () => {
  assert.equal(readMissionIdempotencyKey({
    id: 'mission-1',
    managedWorkId: null,
    conversationId: null,
    sourceTurnId: null,
    sourceLaneId: null,
    assignedAgentId: null,
    title: 'X',
    status: 'planned',
    summary: null,
    createdAt: '2026-04-14T22:00:00.000Z',
    updatedAt: '2026-04-14T22:00:00.000Z',
    metadata: { idempotencyKey: '   abc-123   ' },
  }), 'abc-123');
  assert.equal(readMissionIdempotencyKey({
    id: 'mission-2',
    managedWorkId: null,
    conversationId: null,
    sourceTurnId: null,
    sourceLaneId: null,
    assignedAgentId: null,
    title: 'X',
    status: 'planned',
    summary: null,
    createdAt: '2026-04-14T22:00:00.000Z',
    updatedAt: '2026-04-14T22:00:00.000Z',
    metadata: { idempotencyKey: '   ' },
  }), null);
});

test('withMissionIdempotencyKey preserves unrelated metadata and ignores empty keys', () => {
  const base = { source: 'cron' };
  const withKey = withMissionIdempotencyKey(base, 'cron-2026-05-09-tick');
  assert.equal(withKey[MISSION_METADATA_IDEMPOTENCY_KEY], 'cron-2026-05-09-tick');
  assert.equal(withKey.source, 'cron');

  const noChange = withMissionIdempotencyKey(base, '   ');
  assert.equal(noChange[MISSION_METADATA_IDEMPOTENCY_KEY], undefined);
});

test('checkMissionIdempotency surfaces duplicate vs unique by metadata key', () => {
  let core = createDefaultCoreState();
  core = upsertCoreMission(
    core,
    {
      id: 'mission-existing',
      title: 'First mission',
      status: 'planned',
      metadata: { idempotencyKey: 'cron-tick-2026-05-09T00:00' },
    },
    new Date('2026-05-09T00:00:00.000Z'),
  ).core;

  const duplicate = checkMissionIdempotency(core, 'cron-tick-2026-05-09T00:00');
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.existingMissionId, 'mission-existing');

  const unique = checkMissionIdempotency(core, 'cron-tick-2026-05-09T01:00');
  assert.equal(unique.status, 'unique');
  assert.equal(unique.existingMissionId, null);

  const blank = checkMissionIdempotency(core, '   ');
  assert.equal(blank.status, 'unique');
  assert.equal(blank.existingMissionId, null);
});

test('findMissionByIdempotencyKey returns null when key is blank or missing', () => {
  const core = createDefaultCoreState();
  assert.equal(findMissionByIdempotencyKey(core, ''), null);
  assert.equal(findMissionByIdempotencyKey(core, 'never-seeded'), null);
});

test('readRunIdempotencyKey / withRunIdempotencyKey / checkRunIdempotency dedupe runs', () => {
  let core = createDefaultCoreState();
  core = upsertCoreRun(
    core,
    {
      id: 'run-existing',
      title: 'First run',
      status: 'queued',
      orchestratorActorId: null,
      metadata: { idempotencyKey: 'task-checkout:task-1:attempt-1' },
    },
    new Date('2026-05-09T01:00:00.000Z'),
  ).core;

  const duplicate = checkRunIdempotency(core, 'task-checkout:task-1:attempt-1');
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.existingRunId, 'run-existing');

  const unique = checkRunIdempotency(core, 'task-checkout:task-1:attempt-2');
  assert.equal(unique.status, 'unique');
  assert.equal(unique.existingRunId, null);

  const decorated = withRunIdempotencyKey({}, 'fresh-key');
  assert.equal(decorated[RUN_METADATA_IDEMPOTENCY_KEY], 'fresh-key');

  const stored = findRunByIdempotencyKey(core, 'task-checkout:task-1:attempt-1');
  assert.equal(stored?.id, 'run-existing');
  assert.equal(readRunIdempotencyKey(stored!), 'task-checkout:task-1:attempt-1');
});
