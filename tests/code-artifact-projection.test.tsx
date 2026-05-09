import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState } from '../src/core/model/index.ts';
import { upsertCoreConversation } from '../src/core/model/structuralRecords.ts';
import { upsertCoreTask } from '../src/core/model/taskControls.ts';
import { upsertCoreArtifact } from '../src/core/model/planningRecords.ts';
import {
  buildCodeArtifactListProjection,
} from '../src/products/code/api/projection.ts';

function createArtifactCore() {
  let core = createDefaultCoreState();
  core = upsertCoreConversation(core, {
    id: 'conversation-1',
    title: 'Code conversation',
    kind: 'code_thread',
    status: 'active',
  }).core;
  core = upsertCoreTask(core, {
    id: 'task-1',
    title: 'Implement preview',
    status: 'in_progress',
    conversationId: 'conversation-1',
    metadata: {
      codeWorkspace: {
        workspacePath: 'C:/repo/cats-platform',
        workspaceKind: 'user_selected',
      },
    },
  }).core;
  return core;
}

test('CodeArtifactListItem exposes producer label, workspace, conversation and disposition for declared artifacts', () => {
  const baseCore = createArtifactCore();
  const upsert = upsertCoreArtifact(baseCore, {
    id: 'artifact-declared',
    title: 'Declared preview',
    kind: 'preview',
    status: 'ready',
    conversationId: 'conversation-1',
    taskId: 'task-1',
    summary: 'Local dev preview',
    path: 'http://127.0.0.1:5173/',
    metadata: {
      codeArtifactDeclaration: {
        schemaVersion: '1.0',
        declarationId: 'decl-1',
        producerKind: 'agent',
        producerIdentity: 'actor:actor-code-agent',
        producerLabel: 'preview_url',
        disposition: 'record',
        anchors: {
          conversationId: 'conversation-1',
          taskId: 'task-1',
          workspacePath: 'C:/repo/cats-platform',
        },
      },
    },
  });

  const projection = buildCodeArtifactListProjection(upsert.core);
  const item = projection.artifacts.find((entry) => entry.id === 'artifact-declared');
  assert.ok(item, 'declared artifact missing from projection');
  assert.equal(item.producerLabel, 'preview_url');
  assert.equal(item.disposition, 'record');
  assert.equal(item.conversationId, 'conversation-1');
  assert.equal(item.workspacePath, 'C:/repo/cats-platform');
  assert.equal(item.taskId, 'task-1');
});

test('CodeArtifactListItem leaves declaration fields null for undeclared artifacts but still resolves workspace from task anchor', () => {
  const baseCore = createArtifactCore();
  const upsert = upsertCoreArtifact(baseCore, {
    id: 'artifact-undeclared',
    title: 'System-only artifact',
    kind: 'document',
    status: 'draft',
    conversationId: 'conversation-1',
    taskId: 'task-1',
    summary: null,
    path: null,
  });

  const projection = buildCodeArtifactListProjection(upsert.core);
  const item = projection.artifacts.find((entry) => entry.id === 'artifact-undeclared');
  assert.ok(item, 'undeclared artifact missing from projection');
  assert.equal(item.producerLabel, null);
  assert.equal(item.disposition, null);
  assert.equal(item.conversationId, 'conversation-1');
  assert.equal(item.workspacePath, 'C:/repo/cats-platform');
});
