import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CODE_ARTIFACT_DECLARATION_TOOL,
  CODE_ARTIFACT_DECLARATION_TOOL_NAME,
  CodeArtifactDeclarationError,
  resolveCodeArtifactLabelMapping,
} from '../build/server/products/code/shared/artifactDeclaration.js';

test('declare_artifact tool exposes only agent-visible fields', () => {
  const definition = CODE_ARTIFACT_DECLARATION_TOOL.definition;

  assert.equal(definition.name, CODE_ARTIFACT_DECLARATION_TOOL_NAME);
  assert.equal(definition.inputSchema.additionalProperties, false);
  assert.deepEqual(definition.inputSchema.required, [
    'declarationId',
    'label',
    'title',
    'location',
  ]);
  assert.deepEqual(Object.keys(definition.inputSchema.properties).sort(), [
    'declarationId',
    'label',
    'location',
    'metadata',
    'summary',
    'title',
  ]);
  assert.equal('kind' in definition.inputSchema.properties, false);
  assert.equal('producer' in definition.inputSchema.properties, false);
  assert.equal('anchors' in definition.inputSchema.properties, false);
});

test('declare_artifact normalizes label-based input and rejects server fields', () => {
  const input = CODE_ARTIFACT_DECLARATION_TOOL.normalizeInput({
    declarationId: '  preview-localhost:preview_url  ',
    label: ' preview_url ',
    title: ' Local preview ',
    location: { kind: 'url', value: ' http://127.0.0.1:5173 ' },
    summary: ' Preview URL ',
    metadata: { producerDetails: { port: 5173 } },
  });

  assert.deepEqual(input, {
    declarationId: 'preview-localhost:preview_url',
    label: 'preview_url',
    title: 'Local preview',
    location: { kind: 'url', value: 'http://127.0.0.1:5173' },
    summary: 'Preview URL',
    metadata: { producerDetails: { port: 5173 } },
  });

  assert.deepEqual(
    CODE_ARTIFACT_DECLARATION_TOOL.normalizeInput({
      declarationId: 'preview-null-fields:preview_url',
      label: 'preview_url',
      title: 'Preview with forced fields',
      location: { kind: 'url', value: 'http://127.0.0.1:5173' },
      kind: null,
      producer: undefined,
    }),
    {
      declarationId: 'preview-null-fields:preview_url',
      label: 'preview_url',
      title: 'Preview with forced fields',
      location: { kind: 'url', value: 'http://127.0.0.1:5173' },
    },
  );

  assert.throws(
    () =>
      CODE_ARTIFACT_DECLARATION_TOOL.normalizeInput({
        declarationId: 'bad:preview_url',
        label: 'preview_url',
        title: 'Bad preview',
        location: { kind: 'url', value: 'http://127.0.0.1:5173' },
        kind: 'preview',
        producer: { kind: 'agent' },
      }),
    (error) =>
      error instanceof CodeArtifactDeclarationError &&
      error.code === 'artifact_producer_field_not_allowed',
  );
});

test('declare_artifact label mapping includes transcript and dataset labels', () => {
  assert.deepEqual(resolveCodeArtifactLabelMapping('transcript_export'), {
    label: 'transcript_export',
    coreKind: 'transcript_export',
    defaultStatus: 'ready',
    defaultDisposition: 'record',
  });
  assert.deepEqual(resolveCodeArtifactLabelMapping('dataset_file'), {
    label: 'dataset_file',
    coreKind: 'dataset',
    defaultStatus: 'ready',
    defaultDisposition: 'record',
  });
  assert.deepEqual(resolveCodeArtifactLabelMapping('future_label'), {
    label: 'future_label',
    coreKind: 'report',
    defaultStatus: 'draft',
    defaultDisposition: 'candidate',
  });
});

test('declare_artifact tool builds declarations without materializing artifacts', () => {
  const input = CODE_ARTIFACT_DECLARATION_TOOL.normalizeInput({
    declarationId: 'spec-092:spec_document',
    label: 'spec_document',
    title: 'SPEC-092 update',
    location: { kind: 'local_path', value: 'docs/specs/SPEC-092.md' },
  });

  const declaration = CODE_ARTIFACT_DECLARATION_TOOL.createDeclaration(
    input,
    { kind: 'agent', actorId: 'agent-code', runtimeSessionId: 'session-1' },
    { conversationId: 'conversation-1', taskId: 'task-1' },
  );

  assert.equal(declaration.artifact.coreKind, 'document');
  assert.equal(declaration.artifact.label, 'spec_document');
  assert.equal(declaration.location?.kind, 'local_path');
  assert.deepEqual(declaration.anchors, {
    conversationId: 'conversation-1',
    taskId: 'task-1',
  });
});
