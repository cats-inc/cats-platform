import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreMission,
  upsertCoreRun,
  upsertCoreTask,
  upsertCoreWorkItem,
} from '../build/server/core/model/index.js';
import { buildManagedWorkProjection } from '../build/server/core/managedWorkProjection.js';

test('buildManagedWorkProjection links work items to task, missions, and latest run', () => {
  let core = createDefaultCoreState();

  core = upsertCoreTask(
    core,
    {
      id: 'task-1',
      title: 'Shared task',
      conversationId: 'conversation-1',
      ownerActorId: 'actor-owner',
      createdAt: '2026-04-14T22:00:00.000Z',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;

  core = upsertCoreWorkItem(
    core,
    {
      id: 'work-item-1',
      title: 'Shared work item',
      conversationId: 'conversation-1',
      taskId: 'task-1',
      ownerActorId: 'actor-owner',
      createdAt: '2026-04-14T22:01:00.000Z',
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;

  core = upsertCoreRun(
    core,
    {
      id: 'run-1',
      title: 'Primary run',
      conversationId: 'conversation-1',
      taskId: 'task-1',
      status: 'running',
      createdAt: '2026-04-14T22:02:00.000Z',
      startedAt: '2026-04-14T22:02:00.000Z',
    },
    new Date('2026-04-14T22:02:00.000Z'),
  ).core;

  core = upsertCoreMission(
    core,
    {
      id: 'mission-1',
      managedWorkId: 'work-item-1',
      conversationId: 'conversation-1',
      assignedAgentId: 'actor-orchestrator-global',
      title: 'Route mission',
      status: 'running',
      createdAt: '2026-04-14T22:03:00.000Z',
      metadata: {
        runId: 'run-1',
      },
    },
    new Date('2026-04-14T22:03:00.000Z'),
  ).core;

  const projection = buildManagedWorkProjection(core);

  assert.equal(projection.summary.total, 1);
  assert.equal(projection.summary.withTask, 1);
  assert.equal(projection.summary.withMission, 1);
  assert.equal(projection.summary.withRun, 1);
  assert.equal(projection.items.length, 1);
  assert.equal(projection.items[0].workItem.id, 'work-item-1');
  assert.equal(projection.items[0].linkedTask?.id, 'task-1');
  assert.equal(projection.items[0].latestMission?.id, 'mission-1');
  assert.equal(projection.items[0].latestRun?.id, 'run-1');
});
