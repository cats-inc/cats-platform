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
