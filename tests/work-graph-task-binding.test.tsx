import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreArtifact,
  upsertCoreConversation,
  upsertCoreTask,
  upsertCoreWorkItem,
} from '../src/core/model/index.ts';
import { buildWorkGraphProjection } from '../src/products/work/api/workGraphProjection.ts';
import { writeTaskPlanningMetadata } from '../src/shared/taskPlanning.ts';

const NOW = new Date('2026-04-28T18:00:00.000Z');

test('Work Graph task product binding is derived from structural Work linkage first', () => {
  let core = createDefaultCoreState();

  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-code',
      title: 'Code conversation',
      kind: 'code_thread',
      status: 'active',
    },
    NOW,
  ).core;
  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-chat',
      title: 'Chat conversation',
      kind: 'chat_channel',
      status: 'active',
    },
    NOW,
  ).core;
  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-work-hint-only',
      title: 'Work hint without bridge',
      kind: 'work_thread',
      status: 'active',
    },
    NOW,
  ).core;

  core = upsertCoreTask(
    core,
    {
      id: 'task-code-promoted',
      title: 'Code-origin task linked into Work',
      conversationId: 'conversation-code',
      metadata: writeTaskPlanningMetadata({}, { productHint: 'code' }),
    },
    NOW,
  ).core;
  core = upsertCoreTask(
    core,
    {
      id: 'task-chat',
      title: 'Chat task',
      conversationId: 'conversation-chat',
    },
    NOW,
  ).core;
  core = upsertCoreTask(
    core,
    {
      id: 'task-work-hint-only',
      title: 'Work hint without WorkItem',
      conversationId: 'conversation-work-hint-only',
      metadata: writeTaskPlanningMetadata({}, { productHint: 'work' }),
    },
    NOW,
  ).core;
  core = upsertCoreTask(
    core,
    {
      id: 'task-artifact-code',
      title: 'Code task inferred from build output',
    },
    NOW,
  ).core;

  core = upsertCoreWorkItem(
    core,
    {
      id: 'work-item-promoted',
      title: 'Promoted code work',
      taskId: 'task-code-promoted',
    },
    NOW,
  ).core;
  core = upsertCoreArtifact(
    core,
    {
      id: 'artifact-build',
      title: 'Build output',
      kind: 'build',
      status: 'ready',
      taskId: 'task-artifact-code',
    },
    NOW,
  ).core;

  const tasks = new Map(
    buildWorkGraphProjection(core)
      .objects
      .filter((object) => object.kind === 'task')
      .map((object) => [object.id, object]),
  );

  assert.equal(tasks.get('task-code-promoted')?.productBinding, 'work');
  assert.equal(tasks.get('task-chat')?.productBinding, 'chat');
  assert.equal(tasks.get('task-work-hint-only')?.productBinding, 'unbound');
  assert.equal(tasks.get('task-artifact-code')?.productBinding, 'code');
});
