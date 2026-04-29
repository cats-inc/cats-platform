import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CODE_ARTIFACT_DECLARATION_TOOL,
  CODE_ARTIFACT_DECLARATION_TOOL_NAME,
  CODE_ARTIFACT_LABEL_MAPPINGS,
  CODE_ARTIFACT_PRODUCER_LABELS,
  CodeArtifactDeclarationError,
  resolveCodeArtifactLabelMapping,
  type CodeArtifactProducerLabel,
} from '../src/products/code/shared/artifactDeclaration.ts';

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
    location: { kind: 'url', value: 'http://127.0.0.1:5173/' },
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
      location: { kind: 'url', value: 'http://127.0.0.1:5173/' },
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

test('declare_artifact validates required fields before disallowed server fields', () => {
  assert.throws(
    () =>
      CODE_ARTIFACT_DECLARATION_TOOL.normalizeInput({
        declarationId: 'bad:preview_url',
        label: 'preview_url',
        title: '   ',
        location: { kind: 'url', value: 'http://127.0.0.1:5173' },
        kind: 'preview',
      }),
    (error) =>
      error instanceof CodeArtifactDeclarationError &&
      error.code === 'artifact_required_field_empty',
  );
});

test('declare_artifact validates location rules that do not need server context', () => {
  assert.throws(
    () =>
      CODE_ARTIFACT_DECLARATION_TOOL.normalizeInput({
        declarationId: 'bad-url:preview_url',
        label: 'preview_url',
        title: 'Bad URL',
        location: { kind: 'url', value: 'https://user:pass@example.com/preview' },
      }),
    (error) =>
      error instanceof CodeArtifactDeclarationError &&
      error.code === 'artifact_url_credentials_not_allowed',
  );

  assert.throws(
    () =>
      CODE_ARTIFACT_DECLARATION_TOOL.normalizeInput({
        declarationId: 'bad-inline:implementation_summary',
        label: 'implementation_summary',
        title: 'Oversized summary',
        location: { kind: 'inline_summary', value: 'x'.repeat((8 * 1024) + 1) },
      }),
    (error) =>
      error instanceof CodeArtifactDeclarationError &&
      error.code === 'artifact_inline_summary_too_large',
  );

  assert.throws(
    () =>
      CODE_ARTIFACT_DECLARATION_TOOL.normalizeInput({
        declarationId: 'bad-ref:dataset_file',
        label: 'dataset_file',
        title: 'Bad ref',
        location: { kind: 'external_ref', value: 'unknown:123' },
      }),
    (error) =>
      error instanceof CodeArtifactDeclarationError &&
      error.code === 'artifact_external_ref_kind_not_allowed',
  );

  assert.deepEqual(
    CODE_ARTIFACT_DECLARATION_TOOL.normalizeInput({
      declarationId: 'inline:implementation_summary',
      label: 'implementation_summary',
      title: 'Inline summary',
      location: { kind: 'inline_summary', value: 'Delivered summary' },
    }),
    {
      declarationId: 'inline:implementation_summary',
      label: 'implementation_summary',
      title: 'Inline summary',
      location: { kind: 'inline_summary', value: 'Delivered summary' },
      summary: 'Delivered summary',
    },
  );
});

test('declare_artifact validates metadata bounds and reserved keys', () => {
  assert.throws(
    () =>
      CODE_ARTIFACT_DECLARATION_TOOL.normalizeInput({
        declarationId: 'bad-metadata:test_report',
        label: 'test_report',
        title: 'Bad metadata',
        location: { kind: 'none' },
        summary: 'Report',
        metadata: { title: 'reserved' },
      }),
    (error) =>
      error instanceof CodeArtifactDeclarationError &&
      error.code === 'artifact_metadata_reserved_key',
  );

  assert.throws(
    () =>
      CODE_ARTIFACT_DECLARATION_TOOL.normalizeInput({
        declarationId: 'big-metadata:test_report',
        label: 'test_report',
        title: 'Big metadata',
        location: { kind: 'none' },
        summary: 'Report',
        metadata: { producerDetails: 'x'.repeat(16 * 1024) },
      }),
    (error) =>
      error instanceof CodeArtifactDeclarationError &&
      error.code === 'artifact_metadata_too_large',
  );
});

test('declare_artifact shape result does not claim server acceptance', () => {
  const input = CODE_ARTIFACT_DECLARATION_TOOL.normalizeInput({
    declarationId: 'shape-only:test_report',
    label: 'test_report',
    title: 'Shape only',
    location: { kind: 'none' },
    summary: 'Report',
  });

  assert.deepEqual(CODE_ARTIFACT_DECLARATION_TOOL.shapeOk(input), {
    status: 'shape_ok',
    declarationId: 'shape-only:test_report',
    input,
  });
});

test('declare_artifact label mapping includes transcript and dataset labels', () => {
  const mappedLabels = new Set(CODE_ARTIFACT_LABEL_MAPPINGS.map((mapping) => mapping.label));
  const declaredLabels: readonly CodeArtifactProducerLabel[] = CODE_ARTIFACT_PRODUCER_LABELS;

  assert.deepEqual(mappedLabels, new Set(declaredLabels));
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
