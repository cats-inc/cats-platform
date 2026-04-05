import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreTask,
} from '../build/server/core/model/index.js';
import { writeTaskPlanningMetadata, readTaskPlanningMetadata } from '../build/server/shared/taskPlanning.js';
import {
  createCodeTask,
  resumeCodeTask,
} from '../build/server/products/code/state/taskExecution.js';
import {
  readCodeWorkspaceSummaryFromTask,
} from '../build/server/products/code/shared/workspaceSummary.js';

test('createCodeTask creates a task with productHint code and reflexion strategy', () => {
  const core = createDefaultCoreState();
  const now = new Date('2026-03-29T10:00:00.000Z');

  const result = createCodeTask(core, {
    title: 'Build landing page',
    summary: 'Create a responsive landing page',
    acceptanceCriteria: 'Page renders on mobile',
  }, now);

  assert.ok(result.task);
  assert.equal(result.task.title, 'Build landing page');
  assert.equal(result.task.status, 'approved');
  assert.equal(result.task.summary, 'Create a responsive landing page');

  const planning = readTaskPlanningMetadata(result.task.metadata);
  assert.equal(planning.productHint, 'code');
  assert.equal(planning.strategyHint, 'reflexion');
  assert.equal(planning.acceptanceCriteria, 'Page renders on mobile');
});

test('createCodeTask generates a unique task id', () => {
  const core = createDefaultCoreState();
  const now = new Date('2026-03-29T10:00:00.000Z');

  const result1 = createCodeTask(core, { title: 'Task A' }, now);
  const result2 = createCodeTask(result1.core, { title: 'Task B' }, now);

  assert.notEqual(result1.task.id, result2.task.id);
  assert.ok(result1.task.id.startsWith('task-'));
  assert.ok(result2.task.id.startsWith('task-'));
});

test('createCodeTask supports parentTaskId', () => {
  const core = createDefaultCoreState();
  const now = new Date('2026-03-29T10:00:00.000Z');

  const parent = createCodeTask(core, { title: 'Parent task' }, now);
  const child = createCodeTask(parent.core, {
    title: 'Child task',
    parentTaskId: parent.task.id,
  }, now);

  assert.equal(child.task.parentTaskId, parent.task.id);
});

test('createCodeTask records workspace ownership summary when a workspace is provided', () => {
  const core = createDefaultCoreState();
  const now = new Date('2026-03-29T10:00:00.000Z');

  const result = createCodeTask(core, {
    title: 'Task with workspace',
    workspacePath: 'C:/repo/cats-platform',
    workspaceKind: 'conversation_repo',
  }, now);

  assert.deepEqual(readCodeWorkspaceSummaryFromTask(result.task), {
    workspacePath: 'C:/repo/cats-platform',
    workspaceKind: 'conversation_repo',
    ownershipState: 'conversation_bound',
  });
});

test('resumeCodeTask transitions a draft task to approved', () => {
  const core = createDefaultCoreState();
  const now = new Date('2026-03-29T10:00:00.000Z');

  const metadata = writeTaskPlanningMetadata({}, { productHint: 'code' });
  const taskResult = upsertCoreTask(core, {
    id: 'task-draft',
    title: 'Draft task',
    status: 'draft',
    metadata,
  }, now);

  const resumeResult = resumeCodeTask(taskResult.core, { taskId: 'task-draft' }, now);
  assert.equal(resumeResult.task.status, 'approved');
});

test('resumeCodeTask transitions a blocked task to approved', () => {
  const core = createDefaultCoreState();
  const now = new Date('2026-03-29T10:00:00.000Z');

  const taskResult = upsertCoreTask(core, {
    id: 'task-blocked',
    title: 'Blocked task',
    status: 'blocked',
  }, now);

  const resumeResult = resumeCodeTask(taskResult.core, { taskId: 'task-blocked' }, now);
  assert.equal(resumeResult.task.status, 'approved');
});

test('resumeCodeTask transitions a failed task to approved', () => {
  const core = createDefaultCoreState();
  const now = new Date('2026-03-29T10:00:00.000Z');

  const taskResult = upsertCoreTask(core, {
    id: 'task-failed',
    title: 'Failed task',
    status: 'failed',
  }, now);

  const resumeResult = resumeCodeTask(taskResult.core, { taskId: 'task-failed' }, now);
  assert.equal(resumeResult.task.status, 'approved');
});

test('resumeCodeTask throws for a completed task', () => {
  const core = createDefaultCoreState();
  const now = new Date('2026-03-29T10:00:00.000Z');

  const taskResult = upsertCoreTask(core, {
    id: 'task-completed',
    title: 'Completed task',
    status: 'completed',
  }, now);

  assert.throws(
    () => resumeCodeTask(taskResult.core, { taskId: 'task-completed' }, now),
    /not resumable/u,
  );
});

test('resumeCodeTask throws for a nonexistent task', () => {
  const core = createDefaultCoreState();
  assert.throws(
    () => resumeCodeTask(core, { taskId: 'nonexistent' }),
    /Task not found/u,
  );
});

test('resumeCodeTask throws for an in_progress task', () => {
  const core = createDefaultCoreState();
  const now = new Date('2026-03-29T10:00:00.000Z');

  const taskResult = upsertCoreTask(core, {
    id: 'task-running',
    title: 'Running task',
    status: 'in_progress',
  }, now);

  assert.throws(
    () => resumeCodeTask(taskResult.core, { taskId: 'task-running' }, now),
    /not resumable/u,
  );
});

test('resumeCodeTask preserves recorded workspace ownership summary', () => {
  const core = createDefaultCoreState();
  const now = new Date('2026-03-29T10:00:00.000Z');

  const created = createCodeTask(core, {
    title: 'Workspace task',
    workspacePath: 'C:/room/workspace',
    workspaceKind: 'managed_room',
  }, now);
  const draft = upsertCoreTask(created.core, {
    id: created.task.id,
    title: created.task.title,
    status: 'draft',
    metadata: created.task.metadata,
  }, now);

  const resumed = resumeCodeTask(draft.core, { taskId: created.task.id }, now);
  assert.deepEqual(readCodeWorkspaceSummaryFromTask(resumed.task), {
    workspacePath: 'C:/room/workspace',
    workspaceKind: 'managed_room',
    ownershipState: 'room_owned',
  });
});

