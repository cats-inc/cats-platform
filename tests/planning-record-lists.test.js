import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreArtifact,
  upsertCoreProject,
  upsertCoreWorkItem,
} from '../build/server/core/model/index.js';
import {
  listArtifacts,
  listProjects,
  listWorkItems,
} from '../build/server/core/planningRecordLists.js';

test('planning record lists filter projects, work items, and artifacts by canonical fields', () => {
  let core = createDefaultCoreState();

  core = upsertCoreProject(
    core,
    {
      id: 'project-1',
      title: 'Project one',
      status: 'active',
      ownerActorId: 'actor-owner',
      primaryConversationId: 'conversation-1',
      repoPath: 'C:/repo-one',
      createdAt: '2026-04-15T04:30:00.000Z',
    },
    new Date('2026-04-15T04:30:00.000Z'),
  ).core;

  core = upsertCoreWorkItem(
    core,
    {
      id: 'work-item-1',
      title: 'Work item one',
      status: 'in_progress',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      taskId: 'task-1',
      ownerActorId: 'actor-owner',
      assignedActorIds: ['actor-1'],
      createdAt: '2026-04-15T04:31:00.000Z',
    },
    new Date('2026-04-15T04:31:00.000Z'),
  ).core;

  core = upsertCoreArtifact(
    core,
    {
      id: 'artifact-1',
      title: 'Artifact one',
      kind: 'document',
      status: 'ready',
      projectId: 'project-1',
      workItemId: 'work-item-1',
      conversationId: 'conversation-1',
      taskId: 'task-1',
      runId: 'run-1',
      mimeType: 'text/markdown',
      createdAt: '2026-04-15T04:32:00.000Z',
    },
    new Date('2026-04-15T04:32:00.000Z'),
  ).core;

  const projects = listProjects(core, {
    statuses: ['active'],
    ownerActorIds: ['actor-owner'],
    primaryConversationIds: ['conversation-1'],
    repoPaths: ['C:/repo-one'],
  });
  assert.equal(projects.length, 1);
  assert.equal(projects[0].id, 'project-1');

  const workItems = listWorkItems(core, {
    statuses: ['in_progress'],
    projectIds: ['project-1'],
    conversationIds: ['conversation-1'],
    taskIds: ['task-1'],
    ownerActorIds: ['actor-owner'],
    assignedActorIds: ['actor-1'],
  });
  assert.equal(workItems.length, 1);
  assert.equal(workItems[0].id, 'work-item-1');

  const artifacts = listArtifacts(core, {
    kinds: ['document'],
    statuses: ['ready'],
    projectIds: ['project-1'],
    workItemIds: ['work-item-1'],
    conversationIds: ['conversation-1'],
    taskIds: ['task-1'],
    runIds: ['run-1'],
    mimeTypes: ['text/markdown'],
  });
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].id, 'artifact-1');
});
