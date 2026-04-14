import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendCoreActivity,
  createDefaultCoreState,
  upsertCoreApprovalBinding,
  upsertCoreArtifact,
  upsertCoreConversation,
  upsertCoreOutcome,
  upsertCoreProject,
  upsertCoreTask,
  upsertCoreWorkItem,
  writeApprovalDecision,
} from '../build/server/core/model/index.js';
import { buildCoreTaskStructuredOutputView } from '../build/server/core/taskStructuredOutputs.js';

test('buildCoreTaskStructuredOutputView normalizes artifact, governance, execution, mutation, and reference outputs', () => {
  let core = createDefaultCoreState();

  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-1',
      title: 'Primary conversation',
      kind: 'work_thread',
      status: 'active',
      participantActorIds: ['actor-owner'],
      createdAt: '2026-04-15T00:00:00.000Z',
    },
    new Date('2026-04-15T00:00:00.000Z'),
  ).core;

  core = upsertCoreProject(
    core,
    {
      id: 'project-1',
      title: 'Primary project',
      createdAt: '2026-04-15T00:00:01.000Z',
    },
    new Date('2026-04-15T00:00:01.000Z'),
  ).core;

  core = upsertCoreTask(
    core,
    {
      id: 'task-1',
      title: 'Primary task',
      conversationId: 'conversation-1',
      ownerActorId: 'actor-owner',
      createdAt: '2026-04-15T00:00:02.000Z',
    },
    new Date('2026-04-15T00:00:02.000Z'),
  ).core;

  core = upsertCoreWorkItem(
    core,
    {
      id: 'work-item-1',
      title: 'Primary work item',
      taskId: 'task-1',
      conversationId: 'conversation-1',
      projectId: 'project-1',
      ownerActorId: 'actor-owner',
      createdAt: '2026-04-15T00:00:03.000Z',
    },
    new Date('2026-04-15T00:00:03.000Z'),
  ).core;

  core = upsertCoreArtifact(
    core,
    {
      id: 'artifact-1',
      title: 'Spec draft',
      kind: 'document',
      status: 'ready',
      taskId: 'task-1',
      workItemId: 'work-item-1',
      conversationId: 'conversation-1',
      createdAt: '2026-04-15T00:00:04.000Z',
    },
    new Date('2026-04-15T00:00:04.000Z'),
  ).core;

  core = upsertCoreOutcome(
    core,
    {
      id: 'outcome-1',
      title: 'Execution outcome',
      status: 'succeeded',
      taskId: 'task-1',
      conversationId: 'conversation-1',
      recordedAt: '2026-04-15T00:00:05.000Z',
    },
    new Date('2026-04-15T00:00:05.000Z'),
  ).core;

  core = upsertCoreApprovalBinding(
    core,
    {
      id: 'approval-binding-1',
      kind: 'owner_decision',
      approvalTaskId: 'task-1',
      subjectKind: 'work_item',
      subjectId: 'work-item-1',
      workItemId: 'work-item-1',
      conversationId: 'conversation-1',
      createdAt: '2026-04-15T00:00:06.000Z',
    },
    new Date('2026-04-15T00:00:06.000Z'),
  ).core;

  core = writeApprovalDecision(
    core,
    {
      taskId: 'task-1',
      status: 'approved',
      action: 'approve',
    },
    new Date('2026-04-15T00:00:07.000Z'),
  ).core;

  core = appendCoreActivity(
    core,
    {
      id: 'activity-1',
      kind: 'work_item_updated',
      taskId: 'task-1',
      workItemId: 'work-item-1',
      conversationId: 'conversation-1',
      message: 'Updated work item state.',
      createdAt: '2026-04-15T00:00:08.000Z',
    },
    new Date('2026-04-15T00:00:08.000Z'),
  ).core;

  const task = core.tasks.find((candidate) => candidate.id === 'task-1');
  assert.ok(task);

  const view = buildCoreTaskStructuredOutputView(core, task);

  assert.equal(view.taskId, 'task-1');
  assert.ok(view.outputs.some((output) => output.kind === 'artifact'));
  assert.ok(view.outputs.some((output) => output.kind === 'execution_result'));
  assert.ok(view.outputs.some((output) => output.kind === 'governance_event'));
  assert.ok(view.outputs.some((output) => output.kind === 'mutation'));
  assert.ok(view.outputs.some((output) => output.kind === 'reference'));
  assert.equal(view.summary.total, view.outputs.length);
  assert.ok(view.summary.applied >= 3);
});
