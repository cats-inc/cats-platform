import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreProject,
  upsertCoreWorkItem,
} from '../src/core/model/index.js';
import { MemoryCoreStore } from '../src/core/store.js';
import {
  createInMemoryToolEvidenceSink,
  createToolBoundary,
} from '../src/platform/supervision/toolBoundary.js';
import { createSupervisedToolRegistry } from '../src/platform/supervision/toolRegistry.js';
import {
  WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL,
  createPhaseScopedWorkToolManifests,
} from '../src/products/work/shared/workToolSurface.js';
import { createWorkIntakeDelegate } from '../src/products/work/state/workIntakeDelegate.js';
import {
  createTaskFromWorkItem,
  createWorkExecutionTaskDelegate,
  createWorkExecutionTaskToolExecutors,
} from '../src/products/work/state/workExecutionTaskDelegate.js';

function coreWithReadyWorkItem() {
  const now = new Date('2026-05-13T10:00:00.000Z');
  let core = createDefaultCoreState();
  core = upsertCoreProject(core, {
    id: 'project-cats-platform',
    title: 'Cats Platform',
    status: 'active',
    ownerActorId: core.ownerProfile.actorId,
    primaryConversationId: 'conversation-cats',
  }, now).core;
  core = upsertCoreWorkItem(core, {
    id: 'work-item-ready',
    title: 'Implement Telegram Work intake',
    status: 'ready',
    projectId: 'project-cats-platform',
    conversationId: 'conversation-cats',
    ownerActorId: core.ownerProfile.actorId,
    summary: 'Capture owner-spoken todos into Cats Work Items.',
    metadata: {
      workIntake: {
        source: {
          surface: 'telegram',
          transportBindingId: 'telegram-boss-cat',
          sourceMessageId: 'message-1',
        },
      },
    },
  }, now).core;

  return core;
}

test('Work Task creation creates a pending approval Task and links the Work Item', async () => {
  const coreStore = new MemoryCoreStore(coreWithReadyWorkItem());
  const delegate = createWorkExecutionTaskDelegate({
    coreStore,
    now: () => new Date('2026-05-13T10:05:00.000Z'),
  });
  const executors = createWorkExecutionTaskToolExecutors(delegate);
  const registry = createSupervisedToolRegistry();
  const evidenceSink = createInMemoryToolEvidenceSink();
  const boundary = createToolBoundary({
    registry,
    evidenceSink,
    now: () => '2026-05-13T10:05:00.000Z',
  });

  for (const manifest of createPhaseScopedWorkToolManifests()) {
    registry.register(manifest);
  }

  const first = await boundary.invoke({
    toolName: WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL,
    input: {
      workItemId: 'work-item-ready',
      title: 'Implement the Telegram intake slice',
      summary: 'Use the accepted Work Item as the execution context.',
      approvalNote: 'Approve before runtime checkout.',
    },
    actionId: 'action-work-task-create-1',
    runId: 'run-execution-preparation-2',
    actorRef: 'cat:boss',
    grant: { parentToolScope: 'narrow_write', policyToolScope: 'narrow_write' },
    execute: executors[WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL],
  });

  assert.equal(first.status, 'applied');
  assert.equal(first.result.created, true);
  assert.equal(first.result.linked, true);
  assert.equal(first.result.taskStatus, 'pending_approval');
  assert.equal(first.result.approvalStatus, 'pending');
  assert.match(first.result.taskId, /^task-work-item-/u);

  const afterFirst = await coreStore.readCore();
  const workItem = afterFirst.workItems.find((candidate) => candidate.id === 'work-item-ready');
  const task = afterFirst.tasks.find((candidate) => candidate.id === first.result.taskId);
  assert.equal(workItem?.taskId, first.result.taskId);
  assert.equal(task?.title, 'Implement the Telegram intake slice');
  assert.equal(task?.status, 'pending_approval');
  assert.equal(task?.approval.status, 'pending');
  assert.equal(task?.conversationId, 'conversation-cats');
  assert.deepEqual(workItem?.metadata.workIntake, {
    source: {
      surface: 'telegram',
      transportBindingId: 'telegram-boss-cat',
      sourceMessageId: 'message-1',
    },
  });
  assert.equal(afterFirst.runs.length, 0);
  assert.equal(afterFirst.approvalBindings.length, 1);
  assert.equal(afterFirst.approvalBindings[0]?.subjectKind, 'work_item');
  assert.equal(afterFirst.approvalBindings[0]?.subjectId, 'work-item-ready');
  assert.equal(afterFirst.activities.length, 1);
  assert.equal(afterFirst.activities[0]?.kind, 'approval_requested');

  const second = await boundary.invoke({
    toolName: WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL,
    input: {
      workItemId: 'work-item-ready',
      title: 'Implement the Telegram intake slice',
      summary: 'Use the accepted Work Item as the execution context.',
      approvalNote: 'Approve before runtime checkout.',
    },
    actionId: 'action-work-task-create-2',
    runId: 'run-execution-preparation-2',
    actorRef: 'cat:boss',
    grant: { parentToolScope: 'narrow_write', policyToolScope: 'narrow_write' },
    execute: executors[WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL],
  });

  assert.equal(second.status, 'applied');
  assert.equal(second.result.taskId, first.result.taskId);
  assert.equal(second.result.created, false);
  assert.equal(second.result.linked, false);
  const afterSecond = await coreStore.readCore();
  assert.equal(afterSecond.tasks.length, 1);
  assert.equal(afterSecond.activities.length, 1);
  assert.deepEqual(
    evidenceSink.read().map((event) => [event.toolName, event.status]),
    [
      [WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL, 'applied'],
      [WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL, 'applied'],
    ],
  );
});

test('Work Task creation rejects non-ready Work Items without writing', async () => {
  const now = new Date('2026-05-13T10:00:00.000Z');
  let core = createDefaultCoreState();
  core = upsertCoreWorkItem(core, {
    id: 'work-item-planned',
    title: 'Needs more triage',
    status: 'planned',
    ownerActorId: core.ownerProfile.actorId,
  }, now).core;
  const coreStore = new MemoryCoreStore(core);

  const result = await createTaskFromWorkItem(
    coreStore,
    { workItemId: 'work-item-planned' },
    { actorRef: 'cat:boss' },
    () => new Date('2026-05-13T10:05:00.000Z'),
  );

  assert.equal(result.status, 'rejected');
  assert.equal(result.error.code, 'E_PRECHECK_FAILED');
  const after = await coreStore.readCore();
  assert.equal(after.tasks.length, 0);
  assert.equal(after.workItems[0]?.taskId, null);
});

test('Work Task creation requires an acknowledgement boundary after intake capture', async () => {
  const coreStore = new MemoryCoreStore(createDefaultCoreState());
  const intakeDelegate = createWorkIntakeDelegate({
    coreStore,
    now: () => new Date('2026-05-13T10:00:00.000Z'),
  });
  const capture = await intakeDelegate.capture(
    {
      title: 'Same-turn captured work',
      status: 'planned',
      source: {
        surface: 'chat',
        conversationId: 'conversation-cats',
        sourceMessageId: 'message-same-turn',
        sourceText: 'Track this and start it right away.',
      },
    },
    {
      actorRef: 'cat:boss',
      actionId: 'action-intake-capture',
      runId: 'run-same-turn',
    },
  );

  assert.equal(capture.status, 'applied');
  const workItemId = capture.result.workItemId;
  await coreStore.updateCore((core) => {
    const workItem = core.workItems.find((candidate) => candidate.id === workItemId);
    assert.ok(workItem);

    return upsertCoreWorkItem(core, {
      id: workItem.id,
      title: workItem.title,
      status: 'ready',
      projectId: workItem.projectId,
      conversationId: workItem.conversationId,
      taskId: workItem.taskId,
      parentWorkItemId: workItem.parentWorkItemId,
      ownerActorId: workItem.ownerActorId,
      assignedActorIds: workItem.assignedActorIds,
      summary: workItem.summary,
      createdAt: workItem.createdAt,
      metadata: workItem.metadata,
    }, new Date('2026-05-13T10:01:00.000Z')).core;
  });

  const sameRun = await createTaskFromWorkItem(
    coreStore,
    { workItemId },
    {
      actorRef: 'cat:boss',
      actionId: 'action-task-create',
      runId: 'run-same-turn',
    },
    () => new Date('2026-05-13T10:02:00.000Z'),
  );

  assert.equal(sameRun.status, 'rejected');
  assert.equal(sameRun.error.code, 'E_PRECHECK_FAILED');
  assert.match(sameRun.error.message, /owner-visible acknowledgement boundary/u);
  assert.equal((await coreStore.readCore()).tasks.length, 0);

  const nextRun = await createTaskFromWorkItem(
    coreStore,
    { workItemId },
    {
      actorRef: 'cat:boss',
      actionId: 'action-task-create-next',
      runId: 'run-after-acknowledgement',
    },
    () => new Date('2026-05-13T10:03:00.000Z'),
  );

  assert.equal(nextRun.status, 'applied');
  assert.equal(nextRun.result.created, true);
  assert.equal((await coreStore.readCore()).runs.length, 0);
});

test('Work Task creation is rejected by read-only grants before executor writes', async () => {
  const coreStore = new MemoryCoreStore(coreWithReadyWorkItem());
  const delegate = createWorkExecutionTaskDelegate({ coreStore });
  const executors = createWorkExecutionTaskToolExecutors(delegate);
  const registry = createSupervisedToolRegistry();
  const evidenceSink = createInMemoryToolEvidenceSink();
  const boundary = createToolBoundary({
    registry,
    evidenceSink,
    now: () => '2026-05-13T10:05:00.000Z',
  });

  for (const manifest of createPhaseScopedWorkToolManifests()) {
    registry.register(manifest);
  }

  const result = await boundary.invoke({
    toolName: WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL,
    input: {
      workItemId: 'work-item-ready',
    },
    actionId: 'action-work-task-create-readonly',
    runId: 'run-execution-preparation-3',
    actorRef: 'cat:boss',
    grant: { parentToolScope: 'read_only', policyToolScope: 'read_only' },
    execute: executors[WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL],
  });

  assert.equal(result.status, 'rejected');
  assert.equal(result.error.code, 'E_TOOL_SCOPE_DENIED');
  assert.equal((await coreStore.readCore()).tasks.length, 0);
});
