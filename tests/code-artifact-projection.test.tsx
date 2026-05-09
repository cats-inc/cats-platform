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

function createMixedArtifactCore() {
  let core = createArtifactCore();
  core = upsertCoreArtifact(core, {
    id: 'artifact-preview-ready',
    title: 'Local preview',
    kind: 'preview',
    status: 'ready',
    conversationId: 'conversation-1',
    taskId: 'task-1',
    runId: 'run-1',
    path: 'http://127.0.0.1:5173/',
    metadata: {
      codeArtifactDeclaration: {
        producerLabel: 'preview_url',
        disposition: 'record',
        anchors: { workspacePath: 'C:/repo/cats-platform' },
      },
    },
  }).core;
  core = upsertCoreArtifact(core, {
    id: 'artifact-build-failed',
    title: 'Build attempt',
    kind: 'build',
    status: 'failed',
    conversationId: 'conversation-1',
    taskId: 'task-1',
    runId: 'run-2',
    metadata: {
      codeArtifactDeclaration: {
        producerLabel: 'build_output',
        disposition: 'record',
        anchors: { workspacePath: 'C:/repo/cats-platform' },
      },
    },
  }).core;
  core = upsertCoreArtifact(core, {
    id: 'artifact-report-draft',
    title: 'Test report',
    kind: 'report',
    status: 'draft',
    conversationId: 'conversation-1',
    taskId: 'task-1',
    runId: 'run-1',
    metadata: {
      codeArtifactDeclaration: {
        producerLabel: 'test_report',
        disposition: 'candidate',
        anchors: { workspacePath: 'C:/repo/other-repo' },
      },
    },
  }).core;
  return core;
}

test('buildCodeArtifactListProjection filters by producer label', () => {
  const core = createMixedArtifactCore();
  const projection = buildCodeArtifactListProjection(core, { producerLabel: 'preview_url' });
  assert.deepEqual(projection.artifacts.map((entry) => entry.id), ['artifact-preview-ready']);
  assert.equal(projection.filters.producerLabel, 'preview_url');
});

test('buildCodeArtifactListProjection filters by status', () => {
  const core = createMixedArtifactCore();
  const projection = buildCodeArtifactListProjection(core, { status: 'failed' });
  assert.deepEqual(projection.artifacts.map((entry) => entry.id), ['artifact-build-failed']);
});

test('buildCodeArtifactListProjection filters by run id', () => {
  const core = createMixedArtifactCore();
  const projection = buildCodeArtifactListProjection(core, { runId: 'run-1' });
  assert.deepEqual(
    projection.artifacts.map((entry) => entry.id).sort(),
    ['artifact-preview-ready', 'artifact-report-draft'],
  );
});

test('buildCodeArtifactListProjection filters by workspace path', () => {
  const core = createMixedArtifactCore();
  const projection = buildCodeArtifactListProjection(core, {
    workspacePath: 'C:/repo/other-repo',
  });
  assert.deepEqual(projection.artifacts.map((entry) => entry.id), ['artifact-report-draft']);
});

test('buildCodeArtifactListProjection accepts legacy string filter for backward compatibility', () => {
  const core = createMixedArtifactCore();
  const projection = buildCodeArtifactListProjection(core, 'preview');
  assert.deepEqual(projection.artifacts.map((entry) => entry.id), ['artifact-preview-ready']);
  assert.equal(projection.filter, 'preview');
});

test('buildCodeArtifactListProjection hides undeclared local-path artifacts when excludeUndeclaredSourceEdits is set', () => {
  let core = createArtifactCore();
  core = upsertCoreArtifact(core, {
    id: 'artifact-source-edit',
    title: 'Edited file',
    kind: 'document',
    status: 'ready',
    conversationId: 'conversation-1',
    taskId: 'task-1',
    path: 'src/products/code/foo.ts',
  }).core;
  core = upsertCoreArtifact(core, {
    id: 'artifact-declared-patch',
    title: 'Declared patch bundle',
    kind: 'patch',
    status: 'ready',
    conversationId: 'conversation-1',
    taskId: 'task-1',
    path: 'src/products/code/foo.patch',
    metadata: {
      codeArtifactDeclaration: {
        producerLabel: 'patch_bundle',
        disposition: 'record',
      },
    },
  }).core;
  core = upsertCoreArtifact(core, {
    id: 'artifact-undeclared-url',
    title: 'Externally-referenced URL artifact',
    kind: 'document',
    status: 'ready',
    conversationId: 'conversation-1',
    taskId: 'task-1',
    path: 'https://example.com/page',
  }).core;

  const filtered = buildCodeArtifactListProjection(core, {
    excludeUndeclaredSourceEdits: true,
  });
  const ids = filtered.artifacts.map((entry) => entry.id).sort();
  assert.deepEqual(
    ids,
    ['artifact-declared-patch', 'artifact-undeclared-url'],
    'undeclared local-path artifact should be filtered out, but URL paths and declared artifacts kept',
  );

  const unfiltered = buildCodeArtifactListProjection(core, {});
  assert.ok(
    unfiltered.artifacts.some((entry) => entry.id === 'artifact-source-edit'),
    'undeclared source edit should still appear when filter is off',
  );
});
