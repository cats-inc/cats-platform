import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState } from '../src/core/model/index.ts';
import { upsertCoreRun } from '../src/core/model/executionRecords.ts';
import { upsertCoreTask } from '../src/core/model/taskControls.ts';
import { upsertCoreConversation } from '../src/core/model/structuralRecords.ts';
import {
  CodeArtifactDeclarationError,
  type CodeArtifactDeclaration,
} from '../src/products/code/shared/artifactDeclaration.ts';
import { materializeCodeArtifactDeclaration } from '../src/products/code/state/artifactMaterialization.ts';

function createAnchoredCodeCore() {
  let core = createDefaultCoreState();
  core = upsertCoreConversation(core, {
    id: 'conversation-code-1',
    title: 'Code conversation',
    kind: 'code_thread',
    status: 'active',
  }).core;
  const taskResult = upsertCoreTask(core, {
    id: 'task-code-1',
    title: 'Implement preview',
    status: 'in_progress',
    conversationId: 'conversation-code-1',
  });
  core = taskResult.core;
  const runResult = upsertCoreRun(core, {
    id: 'run-code-1',
    title: 'Code run',
    status: 'running',
    conversationId: 'conversation-code-1',
    taskId: 'task-code-1',
  });
  core = runResult.core;
  return core;
}

function createPreviewDeclaration(
  overrides: Partial<CodeArtifactDeclaration> = {},
): CodeArtifactDeclaration {
  return {
    declarationId: 'preview-localhost:preview_url',
    producer: {
      kind: 'agent',
      actorId: 'actor-code-agent',
      runtimeSessionId: 'runtime-session-1',
    },
    artifact: {
      title: 'Local preview',
      label: 'preview_url',
      summary: 'Preview is available.',
    },
    location: {
      kind: 'url',
      value: 'http://127.0.0.1:5173/',
    },
    anchors: {
      conversationId: 'conversation-code-1',
      taskId: 'task-code-1',
      runId: 'run-code-1',
      workspacePath: 'C:/repo/cats-platform',
    },
    metadata: {
      producerDetails: {
        port: 5173,
      },
    },
    ...overrides,
  };
}

test('Code artifact materialization writes accepted declarations as Core artifacts', () => {
  const core = createAnchoredCodeCore();
  const result = materializeCodeArtifactDeclaration(
    core,
    createPreviewDeclaration(),
    new Date('2026-04-30T10:00:00.000Z'),
  );

  assert.equal(result.created, true);
  assert.equal(result.disposition, 'record');
  assert.equal(result.artifact.kind, 'preview');
  assert.equal(result.artifact.status, 'ready');
  assert.equal(result.artifact.path, 'http://127.0.0.1:5173/');
  assert.equal(result.artifact.conversationId, 'conversation-code-1');
  assert.equal(result.artifact.taskId, 'task-code-1');
  assert.equal(result.artifact.runId, 'run-code-1');
  assert.equal(result.toolResult.status, 'accepted');
  assert.equal(result.toolResult.artifactId, result.artifact.id);

  const declarationMetadata = result.artifact.metadata.codeArtifactDeclaration as
    | Record<string, unknown>
    | undefined;
  assert.equal(declarationMetadata?.schemaVersion, '1.0');
  assert.equal(declarationMetadata?.declarationId, 'preview-localhost:preview_url');
  assert.equal(declarationMetadata?.producerKind, 'agent');
  assert.equal(declarationMetadata?.producerIdentity, 'actor:actor-code-agent');
  assert.equal(declarationMetadata?.producerLabel, 'preview_url');
  assert.equal(declarationMetadata?.disposition, 'record');
  assert.equal(declarationMetadata?.candidate, false);
  assert.deepEqual(result.artifact.metadata.producerDetails, { port: 5173 });

  const idempotency = declarationMetadata?.idempotency as Record<string, unknown>;
  assert.equal(idempotency.scopeKind, 'run');
  assert.equal(idempotency.scopeId, 'run-code-1');
  assert.equal(idempotency.declarationId, 'preview-localhost:preview_url');
  assert.match(String(idempotency.key), /^code-artifact-declaration:v1:/u);
});

test('Code artifact materialization is idempotent for the same canonical key', () => {
  const core = createAnchoredCodeCore();
  const first = materializeCodeArtifactDeclaration(
    core,
    createPreviewDeclaration(),
    new Date('2026-04-30T10:00:00.000Z'),
  );
  const second = materializeCodeArtifactDeclaration(
    first.core,
    createPreviewDeclaration({
      artifact: {
        title: 'Local preview',
        label: 'preview_url',
        summary: 'Preview URL was refreshed.',
      },
    }),
    new Date('2026-04-30T10:05:00.000Z'),
  );

  assert.equal(second.created, false);
  assert.equal(second.artifact.id, first.artifact.id);
  assert.equal(second.artifact.summary, 'Preview URL was refreshed.');
  assert.equal(second.core.artifacts.length, 1);
});

test('Code artifact materialization stores candidate declarations as draft artifacts', () => {
  const core = createAnchoredCodeCore();
  const result = materializeCodeArtifactDeclaration(
    core,
    createPreviewDeclaration({
      declarationId: 'changed-files:changed_files_summary',
      producer: { kind: 'system', toolName: 'code-bridge' },
      artifact: {
        title: 'Changed files',
        label: 'changed_files_summary',
        summary: 'src/app.ts changed.',
      },
      location: { kind: 'inline_summary', value: 'src/app.ts changed.' },
    }),
    new Date('2026-04-30T10:00:00.000Z'),
  );

  assert.equal(result.disposition, 'candidate');
  assert.equal(result.artifact.kind, 'report');
  assert.equal(result.artifact.status, 'draft');
  assert.equal(result.artifact.path, null);
  assert.equal(result.toolResult.status, 'accepted');
  assert.equal(result.toolResult.disposition, 'candidate');
  assert.equal(
    (result.artifact.metadata.codeArtifactDeclaration as Record<string, unknown>).candidate,
    true,
  );
});

test('Code artifact materialization resolves local paths inside workspace anchors', () => {
  const core = createAnchoredCodeCore();
  const result = materializeCodeArtifactDeclaration(
    core,
    createPreviewDeclaration({
      declarationId: 'report:test_report',
      artifact: {
        title: 'Test report',
        label: 'test_report',
        summary: 'All tests passed.',
      },
      location: {
        kind: 'local_path',
        value: 'reports/test-output.json',
      },
    }),
    new Date('2026-04-30T10:00:00.000Z'),
  );

  assert.equal(result.artifact.kind, 'report');
  assert.equal(result.artifact.path, 'C:/repo/cats-platform/reports/test-output.json');
});

test('Code artifact materialization rejects unpublishable and unanchored declarations', () => {
  const core = createAnchoredCodeCore();

  assert.throws(
    () => materializeCodeArtifactDeclaration(
      core,
      createPreviewDeclaration({ requestedStatus: 'published' }),
    ),
    (error) =>
      error instanceof CodeArtifactDeclarationError &&
      error.code === 'artifact_publish_requires_action',
  );

  assert.throws(
    () => materializeCodeArtifactDeclaration(
      core,
      createPreviewDeclaration({
        producer: { kind: 'agent', actorId: 'actor-code-agent' },
        anchors: {},
      }),
    ),
    (error) =>
      error instanceof CodeArtifactDeclarationError &&
      error.code === 'artifact_anchor_required',
  );
});
