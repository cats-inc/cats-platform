import assert from 'node:assert/strict';
import test from 'node:test';

import type { RuntimeMessageSegment } from '../src/platform/runtime/client.ts';
import { createDefaultCoreState } from '../src/core/model/index.ts';
import { upsertCoreRun } from '../src/core/model/executionRecords.ts';
import { upsertCoreTask } from '../src/core/model/taskControls.ts';
import { upsertCoreConversation } from '../src/core/model/structuralRecords.ts';
import {
  executeCodeArtifactRuntimeDeclarations,
  projectCodeArtifactToolResultsIntoSegments,
} from '../src/products/code/state/runtimeArtifactExecution.ts';

function createAnchoredCodeCore() {
  let core = createDefaultCoreState();
  core = upsertCoreConversation(core, {
    id: 'conversation-code-1',
    title: 'Code conversation',
    kind: 'code_thread',
    status: 'active',
  }).core;
  core = upsertCoreTask(core, {
    id: 'task-code-1',
    title: 'Implement preview',
    status: 'in_progress',
    conversationId: 'conversation-code-1',
  }).core;
  core = upsertCoreRun(core, {
    id: 'run-code-1',
    title: 'Code run',
    status: 'running',
    conversationId: 'conversation-code-1',
    taskId: 'task-code-1',
  }).core;
  return core;
}

function createExecutionContext() {
  return {
    producer: {
      kind: 'agent' as const,
      actorId: 'actor-code-agent',
      runtimeSessionId: 'runtime-session-1',
    },
    anchors: {
      conversationId: 'conversation-code-1',
      taskId: 'task-code-1',
      runId: 'run-code-1',
      workspacePath: 'C:/repo/cats-platform',
    },
  };
}

test('Code runtime declaration execution materializes valid declare_artifact calls', () => {
  const core = createAnchoredCodeCore();
  const segments: RuntimeMessageSegment[] = [
    {
      kind: 'text',
      text: 'Preview is ready.',
      toolName: null,
      toolId: null,
    },
    {
      kind: 'tool_use',
      toolName: 'declare_artifact',
      toolId: 'tool-1',
      text: '',
      toolArgs: {
        declarationId: 'preview-localhost:preview_url',
        label: 'preview_url',
        title: 'Local preview',
        location: {
          kind: 'url',
          value: 'http://127.0.0.1:5173',
        },
        summary: 'Preview is available.',
        metadata: {
          producerDetails: {
            port: 5173,
          },
        },
      },
    },
  ];

  const result = executeCodeArtifactRuntimeDeclarations({
    core,
    channel: {
      originSurface: 'code',
      id: 'channel-code',
      chatCwd: 'C:/repo/cats-platform',
    },
    segments,
    context: createExecutionContext(),
    now: new Date('2026-04-30T10:00:00.000Z'),
  });

  assert.equal(result.declarations.length, 1);
  assert.equal(result.declarations[0].toolId, 'tool-1');
  assert.equal(result.declarations[0].declarationId, 'preview-localhost:preview_url');
  assert.deepEqual(result.declarations[0].result, {
    status: 'accepted',
    declarationId: 'preview-localhost:preview_url',
    disposition: 'record',
    artifactId: result.core.artifacts[0].id,
    artifactStatus: 'ready',
  });

  assert.equal(result.core.artifacts.length, 1);
  assert.equal(result.core.activities.length, 1);
  assert.equal(result.core.artifacts[0].title, 'Local preview');
  assert.equal(result.core.artifacts[0].kind, 'preview');
  assert.equal(result.core.artifacts[0].status, 'ready');
  assert.equal(result.core.artifacts[0].path, 'http://127.0.0.1:5173/');
  assert.equal(result.core.artifacts[0].conversationId, 'conversation-code-1');
  assert.equal(result.core.artifacts[0].taskId, 'task-code-1');
  assert.equal(result.core.artifacts[0].runId, 'run-code-1');
  assert.equal(result.core.activities[0].artifactId, result.core.artifacts[0].id);

  const declarationMetadata = result.core.artifacts[0].metadata
    .codeArtifactDeclaration as Record<string, unknown>;
  assert.equal(declarationMetadata.declarationId, 'preview-localhost:preview_url');
  assert.equal(declarationMetadata.producerKind, 'agent');
  assert.equal(declarationMetadata.producerIdentity, 'actor:actor-code-agent');
  assert.equal(declarationMetadata.producerLabel, 'preview_url');
});

test('Code runtime declaration execution returns rejected results without mutating core', () => {
  const core = createAnchoredCodeCore();
  const result = executeCodeArtifactRuntimeDeclarations({
    core,
    channel: { originSurface: 'code', id: 'channel-code' },
    segments: [
      {
        kind: 'tool_use',
        toolName: 'declare_artifact',
        toolId: 'tool-bad',
        text: JSON.stringify({
          declarationId: 'bad-preview',
          label: 'preview_url',
          title: '',
          location: {
            kind: 'url',
            value: 'http://127.0.0.1:5173',
          },
        }),
      },
    ],
    context: createExecutionContext(),
    now: new Date('2026-04-30T10:00:00.000Z'),
  });

  assert.equal(result.core, core);
  assert.equal(result.core.artifacts.length, 0);
  assert.equal(result.core.activities.length, 0);
  assert.deepEqual(result.declarations, [
    {
      toolId: 'tool-bad',
      declarationId: 'bad-preview',
      result: {
        status: 'rejected',
        error: {
          code: 'artifact_required_field_empty',
          message: 'declare_artifact title is required.',
        },
      },
    },
  ]);
});

test('Code runtime tool-result projection pairs declarations by tool id', () => {
  const segments: RuntimeMessageSegment[] = [
    {
      kind: 'tool_use',
      toolName: 'declare_artifact',
      toolId: 'tool-a',
      text: JSON.stringify({
        declarationId: 'preview-a',
        label: 'preview_url',
        title: 'Preview A',
        location: { kind: 'url', value: 'http://127.0.0.1:5173' },
      }),
    },
    {
      kind: 'tool_use',
      toolName: 'declare_artifact',
      toolId: 'tool-b',
      text: JSON.stringify({
        declarationId: 'preview-b',
        label: 'preview_url',
        title: 'Preview B',
        location: { kind: 'url', value: 'http://127.0.0.1:5174' },
      }),
    },
  ];

  const projected = projectCodeArtifactToolResultsIntoSegments(segments, [
    {
      toolId: 'tool-b',
      declarationId: 'preview-b',
      result: {
        status: 'accepted',
        declarationId: 'preview-b',
        disposition: 'record',
        artifactId: 'artifact-b',
        artifactStatus: 'ready',
      },
    },
    {
      toolId: 'tool-a',
      declarationId: 'preview-a',
      result: {
        status: 'accepted',
        declarationId: 'preview-a',
        disposition: 'record',
        artifactId: 'artifact-a',
        artifactStatus: 'ready',
      },
    },
  ]);

  assert.equal(projected.length, 4);
  assert.equal(projected[1]?.kind, 'tool_result');
  assert.equal(projected[1]?.toolId, 'tool-a');
  assert.equal(JSON.parse(projected[1]?.text ?? '{}').artifactId, 'artifact-a');
  assert.equal(projected[3]?.kind, 'tool_result');
  assert.equal(projected[3]?.toolId, 'tool-b');
  assert.equal(JSON.parse(projected[3]?.text ?? '{}').artifactId, 'artifact-b');
});

test('Code runtime declaration execution is no-op outside Code-origin channels', () => {
  const core = createAnchoredCodeCore();
  const result = executeCodeArtifactRuntimeDeclarations({
    core,
    channel: { originSurface: 'chat', id: 'channel-chat' },
    segments: [
      {
        kind: 'tool_use',
        toolName: 'declare_artifact',
        toolId: 'tool-ignored',
        text: JSON.stringify({
          declarationId: 'ignored-preview',
          label: 'preview_url',
          title: 'Ignored preview',
          location: {
            kind: 'url',
            value: 'http://127.0.0.1:5173',
          },
        }),
      },
    ],
    context: createExecutionContext(),
    now: new Date('2026-04-30T10:00:00.000Z'),
  });

  assert.equal(result.core, core);
  assert.deepEqual(result.declarations, []);
});
