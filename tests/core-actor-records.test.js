import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreActor,
} from '../build/server/core/model/index.js';

test('core actor helper persists operational actor profiles with execution target and memory', () => {
  let core = createDefaultCoreState();

  core = upsertCoreActor(
    core,
    {
      id: 'actor-worker-1',
      name: 'Ops Cat',
      kind: 'worker',
      roles: ['planner', 'executor'],
      skillProfile: 'ops-v1',
      mcpProfile: 'work-memory',
      defaultExecutionTarget: {
        provider: 'claude',
        instance: 'subscription',
        model: 'sonnet',
      },
      memory: {
        summary: 'Ready for background work',
        facts: ['prefers retries'],
        openLoops: ['nightly sync'],
        updatedAt: '2026-04-14T22:00:00.000Z',
      },
      source: 'core_record',
      sourceId: 'ops-cat',
      createdAt: '2026-04-14T22:00:00.000Z',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;

  const actor = core.actors.find((candidate) => candidate.id === 'actor-worker-1');
  assert.ok(actor);
  assert.equal(actor?.name, 'Ops Cat');
  assert.equal(actor?.defaultExecutionTarget?.provider, 'claude');
  assert.deepEqual(actor?.memory.facts, ['prefers retries']);
});
