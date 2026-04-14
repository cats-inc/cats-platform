import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreActor,
} from '../build/server/core/model/index.js';
import { listActors } from '../build/server/core/actorList.js';

test('listActors filters actors by kind, status, source, role, and capability flags', () => {
  let core = createDefaultCoreState();

  core = upsertCoreActor(
    core,
    {
      id: 'actor-1',
      name: 'Ops Cat',
      kind: 'worker',
      status: 'active',
      roles: ['planner', 'reviewer'],
      defaultExecutionTarget: {
        provider: 'claude',
        instance: 'default',
        model: 'claude-default',
      },
      memory: {
        summary: 'Has durable memory',
        facts: ['f1'],
        openLoops: [],
        updatedAt: '2026-04-15T04:00:01.000Z',
      },
      source: 'core_record',
      sourceId: 'ops-cat',
      createdAt: '2026-04-15T04:00:00.000Z',
    },
    new Date('2026-04-15T04:00:00.000Z'),
  ).core;

  core = upsertCoreActor(
    core,
    {
      id: 'actor-2',
      name: 'Archived Cat',
      kind: 'bot',
      status: 'archived',
      roles: ['assistant'],
      source: 'chat_cat',
      sourceId: 'chat-bot',
      createdAt: '2026-04-15T04:01:00.000Z',
    },
    new Date('2026-04-15T04:01:00.000Z'),
  ).core;

  const filtered = listActors(core, {
    actorKinds: ['worker'],
    statuses: ['active'],
    sources: ['core_record'],
    sourceIds: ['ops-cat'],
    roles: ['planner'],
    hasDefaultExecutionTarget: true,
    hasMemory: true,
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'actor-1');
});
