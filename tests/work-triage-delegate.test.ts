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
  createWorkTriageDelegate,
  createWorkTriageToolExecutors,
  lookupWorkProjects,
} from '../src/products/work/state/workTriageDelegate.js';
import {
  WORK_ITEM_ASSIGN_PROJECT_TOOL,
  WORK_ITEM_UPDATE_TOOL,
  WORK_PROJECT_CREATE_TOOL,
  WORK_PROJECT_LOOKUP_TOOL,
  createPhaseScopedWorkToolManifests,
} from '../src/products/work/shared/workToolSurface.js';

function coreWithProjects() {
  const now = new Date('2026-05-13T10:00:00.000Z');
  let core = createDefaultCoreState();
  core = upsertCoreProject(core, {
    id: 'project-cats-platform',
    title: 'Cats Platform',
    status: 'active',
    summary: 'Main Cats product surface',
    repoPath: 'cats-platform',
    primaryConversationId: 'conversation-cats',
  }, now).core;
  core = upsertCoreProject(core, {
    id: 'project-archive',
    title: 'Archived Project',
    status: 'archived',
    summary: 'Old project',
  }, now).core;
  core = upsertCoreProject(core, {
    id: 'project-telegram',
    title: 'Telegram Intake',
    status: 'planned',
    summary: 'Capture chat todos from Telegram',
  }, now).core;
  core = upsertCoreWorkItem(core, {
    id: 'work-item-cats-1',
    title: 'Wire Work tool lookup',
    status: 'draft',
    ownerActorId: core.ownerProfile.actorId,
    projectId: 'project-cats-platform',
  }, now).core;

  return core;
}

test('Work project lookup returns bounded active project matches without writing Core', () => {
  const core = coreWithProjects();
  const result = lookupWorkProjects(core, {
    query: 'cats',
    limit: 5,
  });

  assert.equal(result.status, 'applied');
  assert.deepEqual(
    result.result.projects.map((project) => [
      project.projectId,
      project.title,
      project.status,
      project.workItemCount,
    ]),
    [
      ['project-cats-platform', 'Cats Platform', 'active', 1],
    ],
  );
  assert.equal(core.projects.length, 3);
});

test('Work project lookup can include archived projects when explicitly requested', () => {
  const result = lookupWorkProjects(coreWithProjects(), {
    query: 'project',
    includeArchived: true,
    limit: 10,
  });

  assert.equal(result.status, 'applied');
  assert.deepEqual(
    result.result.projects.map((project) => project.projectId),
    ['project-archive'],
  );
});

test('Work triage delegate runs lookup through supervised read-only boundary', async () => {
  const coreStore = new MemoryCoreStore(coreWithProjects());
  const delegate = createWorkTriageDelegate({ coreStore });
  const executors = createWorkTriageToolExecutors(delegate);
  const registry = createSupervisedToolRegistry();
  const evidenceSink = createInMemoryToolEvidenceSink();
  const boundary = createToolBoundary({
    registry,
    evidenceSink,
    now: () => '2026-05-13T10:00:00.000Z',
  });

  for (const manifest of createPhaseScopedWorkToolManifests()) {
    registry.register(manifest);
  }

  const result = await boundary.invoke({
    toolName: WORK_PROJECT_LOOKUP_TOOL,
    input: {
      query: 'telegram',
    },
    actionId: 'action-project-lookup-1',
    runId: 'run-triage-1',
    actorRef: 'cat:boss',
    grant: { parentToolScope: 'read_only', policyToolScope: 'read_only' },
    execute: executors[WORK_PROJECT_LOOKUP_TOOL],
  });

  assert.equal(result.status, 'applied');
  assert.deepEqual(
    result.result.projects.map((project) => project.projectId),
    ['project-telegram'],
  );
  assert.equal(evidenceSink.read()[0]?.toolName, WORK_PROJECT_LOOKUP_TOOL);
});

test('Work triage delegate updates Work Items through supervised narrow-write boundary', async () => {
  const coreStore = new MemoryCoreStore(coreWithProjects());
  const delegate = createWorkTriageDelegate({
    coreStore,
    now: () => new Date('2026-05-13T10:00:00.000Z'),
  });
  const executors = createWorkTriageToolExecutors(delegate);
  const registry = createSupervisedToolRegistry();
  const evidenceSink = createInMemoryToolEvidenceSink();
  const boundary = createToolBoundary({
    registry,
    evidenceSink,
    now: () => '2026-05-13T10:00:00.000Z',
  });

  for (const manifest of createPhaseScopedWorkToolManifests()) {
    registry.register(manifest);
  }

  const first = await boundary.invoke({
    toolName: WORK_ITEM_UPDATE_TOOL,
    input: {
      workItemId: 'work-item-cats-1',
      title: 'Wire Work triage tools',
      status: 'ready',
      kind: 'todo',
      priority: 'high',
      assignmentHint: 'Boss Cat should review the project grouping.',
      openQuestions: ['Should this bind to Cats Platform or Cats Runtime?'],
    },
    actionId: 'action-work-item-update-1',
    runId: 'run-triage-2',
    actorRef: 'cat:boss',
    grant: { parentToolScope: 'narrow_write', policyToolScope: 'narrow_write' },
    execute: executors[WORK_ITEM_UPDATE_TOOL],
  });

  assert.equal(first.status, 'applied');
  assert.deepEqual(first.result, {
    workItemId: 'work-item-cats-1',
    status: 'ready',
    updated: true,
  });

  const afterFirst = await coreStore.readCore();
  const workItem = afterFirst.workItems.find((candidate) => candidate.id === 'work-item-cats-1');
  assert.equal(workItem?.title, 'Wire Work triage tools');
  assert.equal(workItem?.status, 'ready');
  assert.deepEqual(workItem?.metadata.workTriage, {
    schemaVersion: 1,
    phase: 'triage',
    toolName: WORK_ITEM_UPDATE_TOOL,
    idempotencyKey: [
      WORK_ITEM_UPDATE_TOOL,
      'work-item-cats-1',
      'wire work triage tools',
      '',
      'ready',
      'todo',
      'high',
      'boss cat should review the project grouping.',
      'should this bind to cats platform or cats runtime?',
    ].join('\n'),
    producingActorRef: 'cat:boss',
    actionId: 'action-work-item-update-1',
    runId: 'run-triage-2',
    updatedAt: '2026-05-13T10:00:00.000Z',
    kind: 'todo',
    priority: 'high',
    assignmentHint: 'Boss Cat should review the project grouping.',
    openQuestions: ['Should this bind to Cats Platform or Cats Runtime?'],
  });
  assert.equal(afterFirst.activities.length, 1);
  assert.equal(afterFirst.activities[0]?.kind, 'work_item_updated');
  assert.equal(afterFirst.activities[0]?.workItemId, 'work-item-cats-1');

  const second = await boundary.invoke({
    toolName: WORK_ITEM_UPDATE_TOOL,
    input: {
      workItemId: 'work-item-cats-1',
      title: 'Wire Work triage tools',
      status: 'ready',
      kind: 'todo',
      priority: 'high',
      assignmentHint: 'Boss Cat should review the project grouping.',
      openQuestions: ['Should this bind to Cats Platform or Cats Runtime?'],
    },
    actionId: 'action-work-item-update-2',
    runId: 'run-triage-2',
    actorRef: 'cat:boss',
    grant: { parentToolScope: 'narrow_write', policyToolScope: 'narrow_write' },
    execute: executors[WORK_ITEM_UPDATE_TOOL],
  });

  assert.equal(second.status, 'applied');
  assert.deepEqual(second.result, {
    workItemId: 'work-item-cats-1',
    status: 'ready',
    updated: false,
  });

  const afterSecond = await coreStore.readCore();
  assert.equal(afterSecond.activities.length, 1);
  assert.deepEqual(
    evidenceSink.read().map((event) => [event.toolName, event.status]),
    [
      [WORK_ITEM_UPDATE_TOOL, 'applied'],
      [WORK_ITEM_UPDATE_TOOL, 'applied'],
    ],
  );
});

test('Work item update rejects non-triage current statuses before writing', async () => {
  const now = new Date('2026-05-13T10:00:00.000Z');
  let core = createDefaultCoreState();
  core = upsertCoreWorkItem(core, {
    id: 'work-item-executing',
    title: 'Already executing',
    status: 'in_progress',
    ownerActorId: core.ownerProfile.actorId,
  }, now).core;

  const coreStore = new MemoryCoreStore(core);
  const delegate = createWorkTriageDelegate({ coreStore });
  const executors = createWorkTriageToolExecutors(delegate);
  const registry = createSupervisedToolRegistry();
  const evidenceSink = createInMemoryToolEvidenceSink();
  const boundary = createToolBoundary({
    registry,
    evidenceSink,
    now: () => '2026-05-13T10:00:00.000Z',
  });

  for (const manifest of createPhaseScopedWorkToolManifests()) {
    registry.register(manifest);
  }

  const result = await boundary.invoke({
    toolName: WORK_ITEM_UPDATE_TOOL,
    input: {
      workItemId: 'work-item-executing',
      title: 'Still should not change',
    },
    actionId: 'action-work-item-update-executing',
    runId: 'run-triage-3',
    actorRef: 'cat:boss',
    grant: { parentToolScope: 'narrow_write', policyToolScope: 'narrow_write' },
    execute: executors[WORK_ITEM_UPDATE_TOOL],
  });

  assert.equal(result.status, 'rejected');
  assert.equal(result.error.code, 'E_PRECHECK_FAILED');
  const after = await coreStore.readCore();
  assert.equal(after.workItems[0]?.title, 'Already executing');
  assert.equal(after.activities.length, 0);
});

test('Work triage delegate assigns Work Items to Projects through supervised boundary', async () => {
  const coreStore = new MemoryCoreStore(coreWithProjects());
  const delegate = createWorkTriageDelegate({
    coreStore,
    now: () => new Date('2026-05-13T10:00:00.000Z'),
  });
  const executors = createWorkTriageToolExecutors(delegate);
  const registry = createSupervisedToolRegistry();
  const evidenceSink = createInMemoryToolEvidenceSink();
  const boundary = createToolBoundary({
    registry,
    evidenceSink,
    now: () => '2026-05-13T10:00:00.000Z',
  });

  for (const manifest of createPhaseScopedWorkToolManifests()) {
    registry.register(manifest);
  }

  const first = await boundary.invoke({
    toolName: WORK_ITEM_ASSIGN_PROJECT_TOOL,
    input: {
      workItemId: 'work-item-cats-1',
      projectId: 'project-telegram',
      note: 'This belongs with Telegram intake triage.',
    },
    actionId: 'action-work-item-assign-1',
    runId: 'run-triage-4',
    actorRef: 'cat:boss',
    grant: { parentToolScope: 'narrow_write', policyToolScope: 'narrow_write' },
    execute: executors[WORK_ITEM_ASSIGN_PROJECT_TOOL],
  });

  assert.equal(first.status, 'applied');
  assert.deepEqual(first.result, {
    workItemId: 'work-item-cats-1',
    projectId: 'project-telegram',
    assigned: true,
  });

  const afterFirst = await coreStore.readCore();
  const workItem = afterFirst.workItems.find((candidate) => candidate.id === 'work-item-cats-1');
  assert.equal(workItem?.projectId, 'project-telegram');
  assert.equal(workItem?.metadata.workTriage !== undefined, true);
  assert.equal(afterFirst.activities.length, 1);
  assert.equal(afterFirst.activities[0]?.kind, 'work_item_updated');
  assert.equal(afterFirst.activities[0]?.projectId, 'project-telegram');
  assert.equal(afterFirst.activities[0]?.workItemId, 'work-item-cats-1');

  const second = await boundary.invoke({
    toolName: WORK_ITEM_ASSIGN_PROJECT_TOOL,
    input: {
      workItemId: 'work-item-cats-1',
      projectId: 'project-telegram',
      note: 'Retry should not duplicate assignment activity.',
    },
    actionId: 'action-work-item-assign-2',
    runId: 'run-triage-4',
    actorRef: 'cat:boss',
    grant: { parentToolScope: 'narrow_write', policyToolScope: 'narrow_write' },
    execute: executors[WORK_ITEM_ASSIGN_PROJECT_TOOL],
  });

  assert.equal(second.status, 'applied');
  assert.deepEqual(second.result, {
    workItemId: 'work-item-cats-1',
    projectId: 'project-telegram',
    assigned: false,
  });
  assert.equal((await coreStore.readCore()).activities.length, 1);
  assert.deepEqual(
    evidenceSink.read().map((event) => [event.toolName, event.status]),
    [
      [WORK_ITEM_ASSIGN_PROJECT_TOOL, 'applied'],
      [WORK_ITEM_ASSIGN_PROJECT_TOOL, 'applied'],
    ],
  );
});

test('Work item project assignment rejects archived target projects', async () => {
  const coreStore = new MemoryCoreStore(coreWithProjects());
  const delegate = createWorkTriageDelegate({ coreStore });
  const executors = createWorkTriageToolExecutors(delegate);
  const registry = createSupervisedToolRegistry();
  const evidenceSink = createInMemoryToolEvidenceSink();
  const boundary = createToolBoundary({
    registry,
    evidenceSink,
    now: () => '2026-05-13T10:00:00.000Z',
  });

  for (const manifest of createPhaseScopedWorkToolManifests()) {
    registry.register(manifest);
  }

  const result = await boundary.invoke({
    toolName: WORK_ITEM_ASSIGN_PROJECT_TOOL,
    input: {
      workItemId: 'work-item-cats-1',
      projectId: 'project-archive',
    },
    actionId: 'action-work-item-assign-archived',
    runId: 'run-triage-5',
    actorRef: 'cat:boss',
    grant: { parentToolScope: 'narrow_write', policyToolScope: 'narrow_write' },
    execute: executors[WORK_ITEM_ASSIGN_PROJECT_TOOL],
  });

  assert.equal(result.status, 'rejected');
  assert.equal(result.error.code, 'E_PRECHECK_FAILED');
  const after = await coreStore.readCore();
  assert.equal(after.workItems[0]?.projectId, 'project-cats-platform');
  assert.equal(after.activities.length, 0);
});

test('Work triage delegate creates projects through supervised narrow-write boundary', async () => {
  const coreStore = new MemoryCoreStore(createDefaultCoreState());
  const delegate = createWorkTriageDelegate({
    coreStore,
    now: () => new Date('2026-05-13T10:00:00.000Z'),
  });
  const executors = createWorkTriageToolExecutors(delegate);
  const registry = createSupervisedToolRegistry();
  const evidenceSink = createInMemoryToolEvidenceSink();
  const boundary = createToolBoundary({
    registry,
    evidenceSink,
    now: () => '2026-05-13T10:00:00.000Z',
  });

  for (const manifest of createPhaseScopedWorkToolManifests()) {
    registry.register(manifest);
  }

  const first = await boundary.invoke({
    toolName: WORK_PROJECT_CREATE_TOOL,
    input: {
      title: 'Cats Runtime',
      status: 'active',
      summary: 'Runtime facade over backend agent execution',
      repoPath: 'cats-runtime',
      primaryConversationId: 'conversation-runtime',
    },
    actionId: 'action-project-create-1',
    runId: 'run-triage-2',
    actorRef: 'cat:boss',
    grant: { parentToolScope: 'narrow_write', policyToolScope: 'narrow_write' },
    execute: executors[WORK_PROJECT_CREATE_TOOL],
  });

  assert.equal(first.status, 'applied');
  assert.equal(first.result.status, 'active');
  assert.equal(first.result.created, true);

  const afterFirst = await coreStore.readCore();
  const project = afterFirst.projects.find((candidate) =>
    candidate.id === first.result.projectId,
  );
  assert.equal(project?.title, 'Cats Runtime');
  assert.equal(project?.repoPath, 'cats-runtime');
  assert.equal(project?.primaryConversationId, 'conversation-runtime');
  assert.equal(project?.metadata.workTriage !== undefined, true);
  assert.equal(afterFirst.activities.length, 1);
  assert.equal(afterFirst.activities[0]?.kind, 'note');
  assert.equal(afterFirst.activities[0]?.projectId, first.result.projectId);

  const second = await boundary.invoke({
    toolName: WORK_PROJECT_CREATE_TOOL,
    input: {
      title: 'Cats Runtime',
      status: 'active',
      summary: 'Retry should not duplicate this Project',
      repoPath: 'cats-runtime',
      primaryConversationId: 'conversation-runtime',
    },
    actionId: 'action-project-create-2',
    runId: 'run-triage-2',
    actorRef: 'cat:boss',
    grant: { parentToolScope: 'narrow_write', policyToolScope: 'narrow_write' },
    execute: executors[WORK_PROJECT_CREATE_TOOL],
  });

  assert.equal(second.status, 'applied');
  assert.equal(second.result.projectId, first.result.projectId);
  assert.equal(second.result.created, false);

  const afterSecond = await coreStore.readCore();
  assert.equal(afterSecond.projects.length, 1);
  assert.equal(afterSecond.activities.length, 1);
  assert.deepEqual(
    evidenceSink.read().map((event) => [event.toolName, event.status]),
    [
      [WORK_PROJECT_CREATE_TOOL, 'applied'],
      [WORK_PROJECT_CREATE_TOOL, 'applied'],
    ],
  );
});

test('Work project create is rejected by read-only grants before executor writes', async () => {
  const coreStore = new MemoryCoreStore(createDefaultCoreState());
  const delegate = createWorkTriageDelegate({ coreStore });
  const executors = createWorkTriageToolExecutors(delegate);
  const registry = createSupervisedToolRegistry();
  const evidenceSink = createInMemoryToolEvidenceSink();
  const boundary = createToolBoundary({
    registry,
    evidenceSink,
    now: () => '2026-05-13T10:00:00.000Z',
  });

  for (const manifest of createPhaseScopedWorkToolManifests()) {
    registry.register(manifest);
  }

  const result = await boundary.invoke({
    toolName: WORK_PROJECT_CREATE_TOOL,
    input: {
      title: 'Should Not Persist',
    },
    actionId: 'action-project-create-readonly',
    runId: 'run-triage-3',
    actorRef: 'cat:boss',
    grant: { parentToolScope: 'read_only', policyToolScope: 'read_only' },
    execute: executors[WORK_PROJECT_CREATE_TOOL],
  });

  assert.equal(result.status, 'rejected');
  assert.equal(result.error.code, 'E_TOOL_SCOPE_DENIED');
  assert.equal((await coreStore.readCore()).projects.length, 0);
});
