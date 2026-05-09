import assert from 'node:assert/strict';
import test from 'node:test';

import type { RuntimeMessageSegment } from '../src/platform/runtime/client.ts';
import { createDefaultCoreState } from '../src/core/model/index.ts';
import { upsertCoreRun } from '../src/core/model/executionRecords.ts';
import { upsertCoreTask } from '../src/core/model/taskControls.ts';
import { upsertCoreConversation } from '../src/core/model/structuralRecords.ts';
import {
  executeCodeArtifactRuntimeCanvasIntents,
  executeCodeArtifactRuntimeDeclarations,
  projectCodeArtifactToolResultsIntoSegments,
} from '../src/products/code/state/runtimeArtifactExecution.ts';
import {
  ARTIFACT_CANVAS_SHOW_TOOL_NAME,
} from '../src/products/shared/artifactCanvas/contracts.ts';
import {
  ArtifactCanvasRenderIntentHub,
} from '../src/products/shared/artifactCanvas/renderIntent.ts';

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

test('Code runtime canvas execution shows same-turn declared artifacts', () => {
  const hub = new ArtifactCanvasRenderIntentHub();
  const deliveries: unknown[] = [];
  const unsubscribe = hub.subscribe({
    surface: { kind: 'code_task', surfaceId: 'task-code-1' },
    sessionId: 'anonymous',
    send: (intent) => deliveries.push(intent),
    now: new Date('2026-05-09T07:00:00.000Z'),
  });

  try {
    const segments: RuntimeMessageSegment[] = [
      {
        kind: 'tool_use',
        toolName: 'declare_artifact',
        toolId: 'tool-declare',
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
        },
      },
      {
        kind: 'tool_use',
        toolName: ARTIFACT_CANVAS_SHOW_TOOL_NAME,
        toolId: 'tool-canvas',
        text: '',
        toolArgs: {
          declarationId: 'preview-localhost:preview_url',
          presentation: 'iframe',
        },
      },
    ];
    const declarations = executeCodeArtifactRuntimeDeclarations({
      core: createAnchoredCodeCore(),
      channel: {
        originSurface: 'code',
        id: 'channel-code',
        chatCwd: 'C:/repo/cats-platform',
      },
      segments,
      context: createExecutionContext(),
      now: new Date('2026-05-09T07:00:00.000Z'),
    });
    const canvas = executeCodeArtifactRuntimeCanvasIntents({
      core: declarations.core,
      channel: {
        originSurface: 'code',
        id: 'channel-code',
        chatCwd: 'C:/repo/cats-platform',
      },
      segments,
      declarations: declarations.declarations,
      context: {
        actorId: 'actor-code-agent',
        anchors: createExecutionContext().anchors,
        surface: { kind: 'code_task', surfaceId: 'task-code-1' },
        renderIntentHub: hub,
      },
      now: new Date('2026-05-09T07:00:01.000Z'),
    });

    assert.equal(canvas.canvas.length, 1);
    assert.equal(canvas.canvas[0].result.status, 'accepted');
    assert.equal(canvas.core.activities.length, 2);
    assert.equal(canvas.core.activities[1].kind, 'artifact_canvas_show_intent');
    assert.equal(canvas.core.activities[1].artifactId, declarations.core.artifacts[0].id);
    assert.equal(deliveries.length, 1);
    assert.doesNotMatch(JSON.stringify(canvas.canvas[0].result), /intentId/u);
  } finally {
    unsubscribe();
  }
});

test('Code runtime canvas execution rejects when no Code surface is active', () => {
  const result = executeCodeArtifactRuntimeCanvasIntents({
    core: createAnchoredCodeCore(),
    channel: { originSurface: 'code', id: 'channel-code' },
    segments: [
      {
        kind: 'tool_use',
        toolName: ARTIFACT_CANVAS_SHOW_TOOL_NAME,
        toolId: 'tool-canvas',
        text: '',
        toolArgs: { artifactId: 'artifact-missing' },
      },
    ],
    declarations: [],
    context: {
      actorId: 'actor-code-agent',
      anchors: {},
      surface: null,
    },
  });

  assert.equal(result.core.activities.length, 0);
  assert.equal(result.canvas.length, 1);
  assert.deepEqual(result.canvas[0].result, {
    status: 'rejected',
    error: {
      code: 'artifact_canvas_no_active_surface',
      message: 'Artifact Canvas tools require an active product surface.',
    },
  });
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

test('Code runtime tool-result projection appends orphan declaration results', () => {
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
  ];

  const projected = projectCodeArtifactToolResultsIntoSegments(segments, [
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
    {
      toolId: 'tool-extra',
      declarationId: 'preview-extra',
      result: {
        status: 'accepted',
        declarationId: 'preview-extra',
        disposition: 'record',
        artifactId: 'artifact-extra',
        artifactStatus: 'ready',
      },
    },
  ]);

  assert.equal(projected.length, 3);
  assert.equal(projected[1]?.kind, 'tool_result');
  assert.equal(projected[1]?.toolId, 'tool-a');
  assert.equal(projected[2]?.kind, 'tool_result');
  assert.equal(projected[2]?.toolId, 'tool-extra');
});

test('Code runtime tool-result projection does not attach mismatched tool ids', () => {
  const projected = projectCodeArtifactToolResultsIntoSegments(
    [
      {
        kind: 'tool_use',
        toolName: 'declare_artifact',
        toolId: 'tool-requested',
        text: JSON.stringify({
          declarationId: 'preview-requested',
          label: 'preview_url',
          title: 'Preview requested',
          location: { kind: 'url', value: 'http://127.0.0.1:5173' },
        }),
      },
    ],
    [
      {
        toolId: 'tool-other',
        declarationId: 'preview-other',
        result: {
          status: 'accepted',
          declarationId: 'preview-other',
          disposition: 'record',
          artifactId: 'artifact-other',
          artifactStatus: 'ready',
        },
      },
    ],
  );

  assert.equal(projected.length, 2);
  assert.equal(projected[0]?.kind, 'tool_use');
  assert.equal(projected[1]?.kind, 'tool_result');
  assert.equal(projected[1]?.toolId, 'tool-other');
});

test('Code runtime tool-result projection avoids ambiguous null identity pairing', () => {
  const projected = projectCodeArtifactToolResultsIntoSegments(
    [
      {
        kind: 'tool_use',
        toolName: 'declare_artifact',
        toolId: null,
        text: JSON.stringify({
          label: 'preview_url',
          title: 'Preview without ids',
          location: { kind: 'url', value: 'http://127.0.0.1:5173' },
        }),
      },
    ],
    [
      {
        toolId: null,
        declarationId: null,
        result: {
          status: 'rejected',
          error: { code: 'artifact_metadata_invalid', message: 'First failed.' },
        },
      },
      {
        toolId: null,
        declarationId: null,
        result: {
          status: 'rejected',
          error: { code: 'artifact_metadata_invalid', message: 'Second failed.' },
        },
      },
    ],
  );

  assert.equal(projected.length, 3);
  assert.equal(projected[0]?.kind, 'tool_use');
  assert.equal(projected[1]?.kind, 'tool_result');
  assert.equal(JSON.parse(projected[1]?.text ?? '{}').error.message, 'First failed.');
  assert.equal(projected[2]?.kind, 'tool_result');
  assert.equal(JSON.parse(projected[2]?.text ?? '{}').error.message, 'Second failed.');
});

test('Code runtime tool-result projection pairs the unique null-identity declaration', () => {
  const projected = projectCodeArtifactToolResultsIntoSegments(
    [
      {
        kind: 'tool_use',
        toolName: 'declare_artifact',
        toolId: null,
        text: JSON.stringify({
          label: 'preview_url',
          title: 'Preview without ids',
          location: { kind: 'url', value: 'http://127.0.0.1:5173' },
        }),
      },
    ],
    [
      {
        toolId: null,
        declarationId: null,
        result: {
          status: 'rejected',
          error: { code: 'artifact_metadata_invalid', message: 'Only failure.' },
        },
      },
    ],
  );

  assert.equal(projected.length, 2);
  assert.equal(projected[0]?.kind, 'tool_use');
  assert.equal(projected[1]?.kind, 'tool_result');
  assert.equal(JSON.parse(projected[1]?.text ?? '{}').error.message, 'Only failure.');
});

test('Code runtime tool-result projection pairs by declarationId when tool ids are absent', () => {
  const projected = projectCodeArtifactToolResultsIntoSegments(
    [
      {
        kind: 'tool_use',
        toolName: 'declare_artifact',
        toolId: null,
        text: JSON.stringify({
          declarationId: 'preview-by-name',
          label: 'preview_url',
          title: 'Preview',
          location: { kind: 'url', value: 'http://127.0.0.1:5173' },
        }),
      },
    ],
    [
      {
        toolId: null,
        declarationId: 'preview-by-name',
        result: {
          status: 'accepted',
          declarationId: 'preview-by-name',
          disposition: 'record',
          artifactId: 'artifact-by-name',
          artifactStatus: 'ready',
        },
      },
    ],
  );

  assert.equal(projected.length, 2);
  assert.equal(projected[0]?.kind, 'tool_use');
  assert.equal(projected[1]?.kind, 'tool_result');
  assert.equal(JSON.parse(projected[1]?.text ?? '{}').artifactId, 'artifact-by-name');
});

test('Code runtime tool-result projection refuses cross-pairing tool ids and declaration ids', () => {
  // segment carries a toolId, declaration only carries a matching declarationId.
  // findMatchingDeclarationResult must not fall back to declarationId when the
  // segment toolId is non-null but no declaration toolId matches.
  const projected = projectCodeArtifactToolResultsIntoSegments(
    [
      {
        kind: 'tool_use',
        toolName: 'declare_artifact',
        toolId: 'tool-1',
        text: JSON.stringify({
          declarationId: 'preview-shared',
          label: 'preview_url',
          title: 'Preview',
          location: { kind: 'url', value: 'http://127.0.0.1:5173' },
        }),
      },
    ],
    [
      {
        toolId: null,
        declarationId: 'preview-shared',
        result: {
          status: 'accepted',
          declarationId: 'preview-shared',
          disposition: 'record',
          artifactId: 'artifact-shared',
          artifactStatus: 'ready',
        },
      },
    ],
  );

  // Segment is unmatched, declaration is appended as orphan.
  assert.equal(projected.length, 2);
  assert.equal(projected[0]?.kind, 'tool_use');
  assert.equal(projected[0]?.toolId, 'tool-1');
  assert.equal(projected[1]?.kind, 'tool_result');
  assert.equal(projected[1]?.toolId, null);
  assert.equal(JSON.parse(projected[1]?.text ?? '{}').artifactId, 'artifact-shared');
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
