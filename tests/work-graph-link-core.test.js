import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  listCoreWorkGraphLinks,
  removeCoreWorkGraphLink,
  upsertCoreProject,
  upsertCoreTask,
  upsertCoreWorkGraphLink,
  upsertCoreWorkItem,
} from '../build/server/core/model/index.js';

const NOW = new Date('2026-04-28T12:00:00.000Z');

function seedSampleCore() {
  let core = createDefaultCoreState();
  core = upsertCoreProject(
    core,
    { id: 'project-a', title: 'Project A', ownerActorId: 'actor-owner' },
    NOW,
  ).core;
  core = upsertCoreProject(
    core,
    { id: 'project-b', title: 'Project B', ownerActorId: 'actor-owner' },
    NOW,
  ).core;
  core = upsertCoreWorkItem(
    core,
    {
      id: 'work-item-1',
      title: 'Work item 1',
      ownerActorId: 'actor-owner',
      projectId: 'project-a',
    },
    NOW,
  ).core;
  core = upsertCoreWorkItem(
    core,
    {
      id: 'work-item-2',
      title: 'Work item 2',
      ownerActorId: 'actor-owner',
      projectId: 'project-a',
    },
    NOW,
  ).core;
  core = upsertCoreTask(
    core,
    {
      id: 'task-1',
      title: 'Task 1',
      conversationId: 'conversation-1',
      ownerActorId: 'actor-owner',
    },
    NOW,
  ).core;
  core = upsertCoreTask(
    core,
    {
      id: 'task-2',
      title: 'Task 2',
      conversationId: 'conversation-1',
      ownerActorId: 'actor-owner',
    },
    NOW,
  ).core;
  return core;
}

test('upsertCoreWorkGraphLink stores blocks rows as written', () => {
  const seed = seedSampleCore();
  const result = upsertCoreWorkGraphLink(
    seed,
    {
      kind: 'blocks',
      sourceRecordFamily: 'task',
      sourceRecordId: 'task-1',
      targetRecordFamily: 'task',
      targetRecordId: 'task-2',
    },
    NOW,
  );
  assert.equal(result.created, true);
  assert.equal(result.link.kind, 'blocks');
  assert.equal(result.link.sourceRecordId, 'task-1');
  assert.equal(result.link.targetRecordId, 'task-2');
  assert.equal(result.core.workGraphLinks.length, 1);
});

test('upsertCoreWorkGraphLink coerces blocked_by into blocks with swapped endpoints', () => {
  const seed = seedSampleCore();
  const result = upsertCoreWorkGraphLink(
    seed,
    {
      kind: 'blocked_by',
      // "task-1 blocked_by task-2" should canonicalize to
      // "task-2 blocks task-1".
      sourceRecordFamily: 'task',
      sourceRecordId: 'task-1',
      targetRecordFamily: 'task',
      targetRecordId: 'task-2',
    },
    NOW,
  );
  assert.equal(result.link.kind, 'blocks');
  assert.equal(result.link.sourceRecordId, 'task-2');
  assert.equal(result.link.targetRecordId, 'task-1');
});

test('upsertCoreWorkGraphLink lex-sorts related_to so the smaller tuple is the source', () => {
  const seed = seedSampleCore();
  // Submit in the "wrong" order — work_item:work-item-2 is lex-greater
  // than project:project-a, so the smaller (project) tuple should
  // become the source.
  const result = upsertCoreWorkGraphLink(
    seed,
    {
      kind: 'related_to',
      sourceRecordFamily: 'work_item',
      sourceRecordId: 'work-item-2',
      targetRecordFamily: 'project',
      targetRecordId: 'project-a',
    },
    NOW,
  );
  assert.equal(result.link.sourceRecordFamily, 'project');
  assert.equal(result.link.sourceRecordId, 'project-a');
  assert.equal(result.link.targetRecordFamily, 'work_item');
  assert.equal(result.link.targetRecordId, 'work-item-2');
});

test('upsertCoreWorkGraphLink is idempotent on the canonical form', () => {
  const seed = seedSampleCore();
  const first = upsertCoreWorkGraphLink(
    seed,
    {
      kind: 'related_to',
      sourceRecordFamily: 'project',
      sourceRecordId: 'project-a',
      targetRecordFamily: 'project',
      targetRecordId: 'project-b',
    },
    NOW,
  );
  // Submit the same relation in reverse order — canonicalization
  // produces the same canonical row.
  const second = upsertCoreWorkGraphLink(
    first.core,
    {
      kind: 'related_to',
      sourceRecordFamily: 'project',
      sourceRecordId: 'project-b',
      targetRecordFamily: 'project',
      targetRecordId: 'project-a',
    },
    NOW,
  );
  assert.equal(second.created, false);
  assert.equal(second.link.id, first.link.id);
  assert.equal(second.core.workGraphLinks.length, 1);
});

test('upsertCoreWorkGraphLink rejects self-links', () => {
  const seed = seedSampleCore();
  assert.throws(
    () =>
      upsertCoreWorkGraphLink(
        seed,
        {
          kind: 'related_to',
          sourceRecordFamily: 'task',
          sourceRecordId: 'task-1',
          targetRecordFamily: 'task',
          targetRecordId: 'task-1',
        },
        NOW,
      ),
    /self-link|self_link/,
  );
});

test('upsertCoreWorkGraphLink rejects unresolved endpoints', () => {
  const seed = seedSampleCore();
  assert.throws(
    () =>
      upsertCoreWorkGraphLink(
        seed,
        {
          kind: 'blocks',
          sourceRecordFamily: 'task',
          sourceRecordId: 'task-1',
          targetRecordFamily: 'task',
          targetRecordId: 'task-deleted',
        },
        NOW,
      ),
    /endpoint|unresolved/,
  );
});

test('upsertCoreWorkGraphLink rejects notes longer than 280 chars', () => {
  const seed = seedSampleCore();
  assert.throws(
    () =>
      upsertCoreWorkGraphLink(
        seed,
        {
          kind: 'blocks',
          sourceRecordFamily: 'task',
          sourceRecordId: 'task-1',
          targetRecordFamily: 'task',
          targetRecordId: 'task-2',
          note: 'x'.repeat(300),
        },
        NOW,
      ),
    /note/,
  );
});

test('removeCoreWorkGraphLink removes by id', () => {
  const seed = seedSampleCore();
  const after = upsertCoreWorkGraphLink(
    seed,
    {
      id: 'link-test',
      kind: 'blocks',
      sourceRecordFamily: 'task',
      sourceRecordId: 'task-1',
      targetRecordFamily: 'task',
      targetRecordId: 'task-2',
    },
    NOW,
  );
  const removed = removeCoreWorkGraphLink(after.core, 'link-test', NOW);
  assert.equal(removed.removed, true);
  assert.equal(removed.core.workGraphLinks.length, 0);
});

test('removeCoreWorkGraphLink returns removed=false when the id does not match', () => {
  const seed = seedSampleCore();
  const removed = removeCoreWorkGraphLink(seed, 'nonexistent-id', NOW);
  assert.equal(removed.removed, false);
});

test('listCoreWorkGraphLinks filters by recordFamily/recordId/kind', () => {
  let core = seedSampleCore();
  core = upsertCoreWorkGraphLink(
    core,
    {
      id: 'link-1',
      kind: 'blocks',
      sourceRecordFamily: 'task',
      sourceRecordId: 'task-1',
      targetRecordFamily: 'task',
      targetRecordId: 'task-2',
    },
    NOW,
  ).core;
  core = upsertCoreWorkGraphLink(
    core,
    {
      id: 'link-2',
      kind: 'related_to',
      sourceRecordFamily: 'project',
      sourceRecordId: 'project-a',
      targetRecordFamily: 'project',
      targetRecordId: 'project-b',
    },
    NOW,
  ).core;

  // Filter by kind
  const blocksOnly = listCoreWorkGraphLinks(core, { kind: 'blocks' });
  assert.equal(blocksOnly.length, 1);
  assert.equal(blocksOnly[0].id, 'link-1');

  // Filter by recordFamily + recordId — matches either source or target
  const onTask1 = listCoreWorkGraphLinks(core, {
    recordFamily: 'task',
    recordId: 'task-1',
  });
  assert.equal(onTask1.length, 1);
  assert.equal(onTask1[0].id, 'link-1');

  const onProjectB = listCoreWorkGraphLinks(core, {
    recordFamily: 'project',
    recordId: 'project-b',
  });
  assert.equal(onProjectB.length, 1);
  assert.equal(onProjectB[0].id, 'link-2');
});
