import assert from 'node:assert/strict';
import test from 'node:test';

import { createSupervisedToolRegistry } from '../src/platform/supervision/toolRegistry.js';
import {
  WORK_ITEM_CAPTURE_TOOL,
  WORK_ITEM_ASSIGN_PROJECT_TOOL,
  WORK_ITEM_PREPARE_EXECUTION_TOOL,
  WORK_ITEM_PROPOSE_SPLIT_TOOL,
  WORK_ITEM_UPDATE_TOOL,
  WORK_PROJECT_CREATE_TOOL,
  WORK_PROJECT_LOOKUP_TOOL,
  WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL,
  createPhaseScopedWorkToolManifests,
  filterPhaseScopedWorkToolManifests,
  isWorkToolAllowedForCapabilityProfile,
  resolveWorkToolPhase,
  validateWorkItemAssignProjectInput,
  validateWorkItemCaptureInput,
  validateWorkItemPrepareExecutionInput,
  validateWorkItemProposeSplitInput,
  validateWorkItemUpdateInput,
  validateWorkProjectCreateInput,
  validateWorkProjectLookupInput,
  validateWorkTaskCreateFromWorkItemInput,
} from '../src/products/work/shared/workToolSurface.js';

test('phase-scoped Work manifests define intake proposal and capture tools', () => {
  const manifests = createPhaseScopedWorkToolManifests();
  const byName = new Map(manifests.map((manifest) => [manifest.name, manifest]));

  assert.deepEqual(
    manifests.map((manifest) => manifest.name).sort(),
    [
      WORK_ITEM_ASSIGN_PROJECT_TOOL,
      WORK_ITEM_CAPTURE_TOOL,
      WORK_ITEM_PREPARE_EXECUTION_TOOL,
      WORK_ITEM_PROPOSE_SPLIT_TOOL,
      WORK_ITEM_UPDATE_TOOL,
      WORK_PROJECT_CREATE_TOOL,
      WORK_PROJECT_LOOKUP_TOOL,
      WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL,
    ],
  );
  assert.equal(resolveWorkToolPhase(WORK_ITEM_PROPOSE_SPLIT_TOOL), 'intake');
  assert.equal(resolveWorkToolPhase(WORK_ITEM_CAPTURE_TOOL), 'intake');
  assert.equal(resolveWorkToolPhase(WORK_ITEM_ASSIGN_PROJECT_TOOL), 'triage');
  assert.equal(resolveWorkToolPhase(WORK_ITEM_UPDATE_TOOL), 'triage');
  assert.equal(resolveWorkToolPhase(WORK_ITEM_PREPARE_EXECUTION_TOOL), 'execution_preparation');
  assert.equal(resolveWorkToolPhase(WORK_PROJECT_LOOKUP_TOOL), 'triage');
  assert.equal(resolveWorkToolPhase(WORK_PROJECT_CREATE_TOOL), 'triage');
  assert.equal(resolveWorkToolPhase(WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL), 'execution_preparation');
  assert.equal(byName.get(WORK_ITEM_PROPOSE_SPLIT_TOOL)?.sideEffect, 'none');
  assert.equal(byName.get(WORK_ITEM_PROPOSE_SPLIT_TOOL)?.approval, 'never');
  assert.equal(byName.get(WORK_ITEM_CAPTURE_TOOL)?.sideEffect, 'local_state');
  assert.equal(byName.get(WORK_ITEM_CAPTURE_TOOL)?.approval, 'policy');
  assert.equal(byName.get(WORK_ITEM_ASSIGN_PROJECT_TOOL)?.sideEffect, 'local_state');
  assert.equal(byName.get(WORK_ITEM_ASSIGN_PROJECT_TOOL)?.approval, 'policy');
  assert.equal(byName.get(WORK_ITEM_UPDATE_TOOL)?.sideEffect, 'local_state');
  assert.equal(byName.get(WORK_ITEM_UPDATE_TOOL)?.approval, 'policy');
  assert.equal(byName.get(WORK_ITEM_PREPARE_EXECUTION_TOOL)?.sideEffect, 'none');
  assert.equal(byName.get(WORK_ITEM_PREPARE_EXECUTION_TOOL)?.approval, 'never');
  assert.equal(byName.get(WORK_PROJECT_LOOKUP_TOOL)?.sideEffect, 'none');
  assert.equal(byName.get(WORK_PROJECT_LOOKUP_TOOL)?.approval, 'never');
  assert.equal(byName.get(WORK_PROJECT_CREATE_TOOL)?.sideEffect, 'local_state');
  assert.equal(byName.get(WORK_PROJECT_CREATE_TOOL)?.approval, 'policy');
  assert.equal(byName.get(WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL)?.sideEffect, 'local_state');
  assert.equal(byName.get(WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL)?.approval, 'policy');
});

test('phase and capability profile filtering hides Work tools from weak or unknown callers', () => {
  const manifests = createPhaseScopedWorkToolManifests();

  assert.deepEqual(
    filterPhaseScopedWorkToolManifests(manifests, {
      phase: 'intake',
      capabilityProfile: 'strong_agent',
    }).map((manifest) => manifest.name),
    [WORK_ITEM_CAPTURE_TOOL, WORK_ITEM_PROPOSE_SPLIT_TOOL],
  );
  assert.deepEqual(
    filterPhaseScopedWorkToolManifests(manifests, {
      phase: 'triage',
      capabilityProfile: 'strong_agent',
    }).map((manifest) => manifest.name),
    [
      WORK_ITEM_ASSIGN_PROJECT_TOOL,
      WORK_ITEM_UPDATE_TOOL,
      WORK_PROJECT_CREATE_TOOL,
      WORK_PROJECT_LOOKUP_TOOL,
    ],
  );
  assert.deepEqual(
    filterPhaseScopedWorkToolManifests(manifests, {
      phase: 'execution_preparation',
      capabilityProfile: 'boss_cat',
    }).map((manifest) => manifest.name),
    [WORK_ITEM_PREPARE_EXECUTION_TOOL, WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL],
  );
  assert.deepEqual(
    filterPhaseScopedWorkToolManifests(manifests, {
      phase: 'execution_preparation',
      capabilityProfile: 'strong_agent',
    }),
    [],
  );
  assert.deepEqual(
    filterPhaseScopedWorkToolManifests(manifests, {
      phase: 'intake',
      capabilityProfile: 'weak_worker',
    }),
    [],
  );
  assert.equal(isWorkToolAllowedForCapabilityProfile(WORK_ITEM_CAPTURE_TOOL, 'unknown'), false);
});

test('supervised tool registry policy scope keeps capture behind narrow-write grants', () => {
  const registry = createSupervisedToolRegistry();

  for (const manifest of createPhaseScopedWorkToolManifests()) {
    registry.register(manifest);
  }

  assert.deepEqual(
    registry.filter({ parentToolScope: 'read_only', policyToolScope: 'read_only' })
      .map((manifest) => manifest.name),
    [
      WORK_ITEM_PREPARE_EXECUTION_TOOL,
      WORK_ITEM_PROPOSE_SPLIT_TOOL,
      WORK_PROJECT_LOOKUP_TOOL,
    ],
  );
  assert.deepEqual(
    registry.filter({ parentToolScope: 'narrow_write', policyToolScope: 'narrow_write' })
      .map((manifest) => manifest.name),
    [
      WORK_ITEM_ASSIGN_PROJECT_TOOL,
      WORK_ITEM_CAPTURE_TOOL,
      WORK_ITEM_PREPARE_EXECUTION_TOOL,
      WORK_ITEM_PROPOSE_SPLIT_TOOL,
      WORK_ITEM_UPDATE_TOOL,
      WORK_PROJECT_CREATE_TOOL,
      WORK_PROJECT_LOOKUP_TOOL,
      WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL,
    ],
  );
  assert.equal(
    registry.authorize(
      WORK_ITEM_CAPTURE_TOOL,
      { parentToolScope: 'read_only', policyToolScope: 'read_only' },
    ).status,
    'rejected',
  );
});

test('Work item capture validation rejects execution fields and non-planning statuses', () => {
  const errors = validateWorkItemCaptureInput({
    title: 'Implement Telegram work intake',
    status: 'in_progress',
    taskId: 'task-1',
    source: {
      surface: 'telegram',
      sourceMessageId: 'msg-1',
      sourceText: 'Turn these notes into work items',
    },
  });

  assert.deepEqual(
    errors.map((entry) => [entry.field, entry.code]),
    [
      ['taskId', 'server_resolved_field'],
      ['status', 'unsupported_value'],
    ],
  );
  assert.deepEqual(validateWorkItemCaptureInput({
    title: 'Review Work tool surface',
    status: 'draft',
    kind: 'todo',
    priority: 'medium',
    source: {
      surface: 'chat',
      conversationId: 'conversation-1',
      sourceText: 'Review this plan later',
    },
  }), []);
});

test('Work item split proposal validation bounds source and candidate count inputs', () => {
  assert.deepEqual(validateWorkItemProposeSplitInput({
    source: {
      surface: 'chat',
      channelId: 'channel-1',
      sourceText: 'Do A, then do B',
    },
    maxItems: 2,
    defaultKind: 'todo',
    defaultPriority: 'low',
  }), []);

  assert.deepEqual(
    validateWorkItemProposeSplitInput({
      source: {
        surface: 'email',
      },
      maxItems: 21,
      runId: 'run-1',
    }).map((entry) => [entry.field, entry.code]),
    [
      ['runId', 'server_resolved_field'],
      ['source.surface', 'unsupported_value'],
      ['maxItems', 'bounds'],
    ],
  );
});

test('Work item project assignment validation allows bounded ids only', () => {
  assert.deepEqual(validateWorkItemAssignProjectInput({
    workItemId: 'work-item-1',
    projectId: 'project-1',
    note: 'Group this under the platform work.',
  }), []);

  assert.deepEqual(
    validateWorkItemAssignProjectInput({
      workItemId: '',
      projectId: 'project-1',
      taskId: 'task-1',
      runId: 'run-1',
      assignedActorIds: ['actor-worker'],
      note: 'x'.repeat(501),
    }).map((entry) => [entry.field, entry.code]),
    [
      ['taskId', 'server_resolved_field'],
      ['runId', 'server_resolved_field'],
      ['assignedActorIds', 'server_resolved_field'],
      ['workItemId', 'blank'],
      ['note', 'too_long'],
    ],
  );
});

test('Work item execution preparation validation rejects execution-owned fields', () => {
  assert.deepEqual(validateWorkItemPrepareExecutionInput({
    workItemIds: ['work-item-1'],
    executionGoal: 'Ship the smallest useful Telegram intake slice.',
    maxItems: 1,
  }), []);

  assert.deepEqual(
    validateWorkItemPrepareExecutionInput({
      workItemIds: [],
      taskId: 'task-1',
      runId: 'run-1',
      executionGoal: 'x'.repeat(1001),
      maxItems: 0,
    }).map((entry) => [entry.field, entry.code]),
    [
      ['taskId', 'server_resolved_field'],
      ['runId', 'server_resolved_field'],
      ['workItemIds', 'bounds'],
      ['executionGoal', 'too_long'],
      ['maxItems', 'bounds'],
    ],
  );
});

test('Work Task creation validation allows a Work Item handle only', () => {
  assert.deepEqual(validateWorkTaskCreateFromWorkItemInput({
    workItemId: 'work-item-1',
    title: 'Implement the first execution slice',
    summary: 'Create a pending approval Task from the selected Work Item.',
    approvalNote: 'Owner should approve before runtime checkout.',
  }), []);

  assert.deepEqual(
    validateWorkTaskCreateFromWorkItemInput({
      workItemId: '',
      taskId: 'task-1',
      runId: 'run-1',
      assignedActorIds: ['actor-worker'],
      title: 'x'.repeat(181),
      summary: 'x'.repeat(4001),
      approvalNote: 'x'.repeat(501),
    }).map((entry) => [entry.field, entry.code]),
    [
      ['taskId', 'server_resolved_field'],
      ['runId', 'server_resolved_field'],
      ['assignedActorIds', 'server_resolved_field'],
      ['workItemId', 'blank'],
      ['title', 'too_long'],
      ['summary', 'too_long'],
      ['approvalNote', 'too_long'],
    ],
  );
});

test('Work item update validation allows item handle but rejects execution fields', () => {
  assert.deepEqual(validateWorkItemUpdateInput({
    workItemId: 'work-item-1',
    title: 'Triage Telegram intake',
    status: 'ready',
    kind: 'todo',
    priority: 'high',
    assignmentHint: 'Boss Cat should pick this up after review',
    openQuestions: ['Which project owns the bot binding?'],
  }), []);

  assert.deepEqual(
    validateWorkItemUpdateInput({
      workItemId: 'work-item-1',
      projectId: 'project-1',
      taskId: 'task-1',
      status: 'in_progress',
      assignedActorIds: ['actor-worker'],
    }).map((entry) => [entry.field, entry.code]),
    [
      ['projectId', 'server_resolved_field'],
      ['taskId', 'server_resolved_field'],
      ['assignedActorIds', 'server_resolved_field'],
      ['status', 'unsupported_value'],
    ],
  );

  assert.deepEqual(
    validateWorkItemUpdateInput({
      workItemId: 'work-item-1',
    }).map((entry) => [entry.field, entry.code]),
    [['$', 'required']],
  );
});

test('Work project lookup validation bounds query, limit, and server fields', () => {
  assert.deepEqual(validateWorkProjectLookupInput({
    query: 'Cats Platform',
    limit: 5,
    includeArchived: false,
  }), []);

  assert.deepEqual(
    validateWorkProjectLookupInput({
      projectId: 'project-1',
      query: 'x'.repeat(161),
      limit: 0,
      includeArchived: 'yes',
    }).map((entry) => [entry.field, entry.code]),
    [
      ['projectId', 'server_resolved_field'],
      ['query', 'too_long'],
      ['limit', 'bounds'],
      ['includeArchived', 'type'],
    ],
  );
});

test('Work project create validation rejects server fields and archived status', () => {
  assert.deepEqual(validateWorkProjectCreateInput({
    title: 'Cats Platform',
    status: 'active',
    summary: 'Next-generation Cats product application',
    repoPath: 'cats-platform',
    primaryConversationId: 'conversation-cats',
  }), []);

  assert.deepEqual(
    validateWorkProjectCreateInput({
      projectId: 'project-1',
      runId: 'run-1',
      title: '',
      status: 'archived',
      summary: 'x'.repeat(4001),
    }).map((entry) => [entry.field, entry.code]),
    [
      ['projectId', 'server_resolved_field'],
      ['runId', 'server_resolved_field'],
      ['title', 'blank'],
      ['summary', 'too_long'],
      ['status', 'unsupported_value'],
    ],
  );
});
