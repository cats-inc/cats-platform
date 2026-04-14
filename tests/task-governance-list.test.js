import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreApprovalBinding,
  upsertCoreTask,
} from '../build/server/core/model/index.js';
import { listApprovalBindings } from '../build/server/core/governanceRecordList.js';
import { listTasks } from '../build/server/core/taskList.js';

test('listTasks filters task records by workflow, ownership, and approval fields', () => {
  let core = createDefaultCoreState();

  core = upsertCoreTask(
    core,
    {
      id: 'task-1',
      title: 'Primary task',
      status: 'in_progress',
      conversationId: 'conversation-1',
      parentTaskId: 'task-parent',
      ownerActorId: 'actor-owner',
      orchestratorActorId: 'actor-orchestrator',
      assignedActorIds: ['actor-worker'],
      approval: {
        status: 'approved',
        decisionAction: 'approve',
      },
      createdAt: '2026-04-15T05:00:00.000Z',
    },
    new Date('2026-04-15T05:00:00.000Z'),
  ).core;

  core = upsertCoreTask(
    core,
    {
      id: 'task-2',
      title: 'Secondary task',
      status: 'blocked',
      conversationId: 'conversation-2',
      ownerActorId: 'actor-owner',
      assignedActorIds: ['actor-reviewer'],
      approval: {
        status: 'pending',
      },
      createdAt: '2026-04-15T05:01:00.000Z',
    },
    new Date('2026-04-15T05:01:00.000Z'),
  ).core;

  const tasks = listTasks(core, {
    statuses: ['in_progress'],
    conversationIds: ['conversation-1'],
    parentTaskIds: ['task-parent'],
    ownerActorIds: ['actor-owner'],
    orchestratorActorIds: ['actor-orchestrator'],
    assignedActorIds: ['actor-worker'],
    approvalStatuses: ['approved'],
    approvalDecisionActions: ['approve'],
  });

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, 'task-1');
});

test('listApprovalBindings filters governance records by canonical relationship fields', () => {
  let core = createDefaultCoreState();

  core = upsertCoreTask(
    core,
    {
      id: 'task-1',
      title: 'Approval task',
      status: 'pending_approval',
      ownerActorId: 'actor-owner',
      createdAt: '2026-04-15T05:02:00.000Z',
    },
    new Date('2026-04-15T05:02:00.000Z'),
  ).core;

  core = upsertCoreApprovalBinding(
    core,
    {
      id: 'approval-binding-1',
      kind: 'owner_decision',
      approvalTaskId: 'task-1',
      subjectKind: 'task',
      subjectId: 'task-1',
      projectId: 'project-1',
      workItemId: 'work-item-1',
      conversationId: 'conversation-1',
      requestedByActorId: 'actor-orchestrator',
      requestedForActorId: 'actor-owner',
      createdAt: '2026-04-15T05:03:00.000Z',
    },
    new Date('2026-04-15T05:03:00.000Z'),
  ).core;

  const approvalBindings = listApprovalBindings(core, {
    kinds: ['owner_decision'],
    subjectKinds: ['task'],
    approvalTaskIds: ['task-1'],
    subjectIds: ['task-1'],
    projectIds: ['project-1'],
    workItemIds: ['work-item-1'],
    conversationIds: ['conversation-1'],
    requestedByActorIds: ['actor-orchestrator'],
    requestedForActorIds: ['actor-owner'],
  });

  assert.equal(approvalBindings.length, 1);
  assert.equal(approvalBindings[0].id, 'approval-binding-1');
});
