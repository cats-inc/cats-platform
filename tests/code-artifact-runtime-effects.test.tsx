import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';

import type { RuntimeMessageSegment } from '../src/platform/runtime/client.ts';
import {
  applyRuntimeInvocationAssistantEffects,
  clearRuntimeInvocationEnrichers,
  hasRuntimeInvocationAssistantEffects,
} from '../src/platform/runtime/invocationEnrichment.ts';
import { createDefaultCoreState } from '../src/core/model/index.ts';
import { upsertCoreRun } from '../src/core/model/executionRecords.ts';
import { upsertCoreTask } from '../src/core/model/taskControls.ts';
import { upsertCoreConversation } from '../src/core/model/structuralRecords.ts';
import { CODE_ARTIFACT_RUNTIME_ENRICHER_ID } from '../src/products/code/state/runtimeArtifactTooling.ts';
import {
  registerCodeArtifactRuntimeAssistantEffectProcessor,
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
    metadata: {
      sessionId: 'runtime-session-1',
    },
  }).core;
  return core;
}

function createPreviewToolUse(): RuntimeMessageSegment {
  return {
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
    },
  };
}

beforeEach(() => {
  clearRuntimeInvocationEnrichers();
});

afterEach(() => {
  clearRuntimeInvocationEnrichers();
});

test('runtime assistant effects materialize Code declare_artifact tool calls', () => {
  registerCodeArtifactRuntimeAssistantEffectProcessor();
  const result = applyRuntimeInvocationAssistantEffects(
    {
      originSurface: 'code',
      id: 'channel-code',
      chatCwd: 'C:/repo/cats-platform',
    },
    {
      core: createAnchoredCodeCore(),
      segments: [createPreviewToolUse()],
    },
    {
      actorId: 'actor-code-agent',
      runtimeSessionId: 'runtime-session-1',
      runtimeContext: {
        metadata: {
          conversationId: 'conversation-code-1',
        },
      },
      now: new Date('2026-04-30T10:00:00.000Z'),
    },
  );

  assert.equal(result.core.artifacts.length, 1);
  assert.equal(result.core.activities.length, 1);
  assert.equal(result.core.artifacts[0].taskId, 'task-code-1');
  assert.equal(result.core.artifacts[0].runId, 'run-code-1');
  assert.equal(result.core.artifacts[0].path, 'http://127.0.0.1:5173/');
  assert.deepEqual(result.metadata, {
    [CODE_ARTIFACT_RUNTIME_ENRICHER_ID]: {
      codeArtifactToolResults: [
        {
          toolId: 'tool-1',
          declarationId: 'preview-localhost:preview_url',
          result: {
            status: 'accepted',
            declarationId: 'preview-localhost:preview_url',
            disposition: 'record',
            artifactId: result.core.artifacts[0].id,
            artifactStatus: 'ready',
          },
        },
      ],
    },
  });
  assert.equal(result.segments.length, 2);
  assert.equal(result.segments[0]?.kind, 'tool_use');
  assert.equal(result.segments[1]?.kind, 'tool_result');
  assert.equal(result.segments[1]?.toolName, 'declare_artifact');
  assert.equal(result.segments[1]?.toolId, 'tool-1');
  assert.deepEqual(JSON.parse(result.segments[1]?.text ?? '{}'), {
    status: 'accepted',
    declarationId: 'preview-localhost:preview_url',
    disposition: 'record',
    artifactId: result.core.artifacts[0].id,
    artifactStatus: 'ready',
  });
});

test('runtime assistant effects skip non-Code channels', () => {
  registerCodeArtifactRuntimeAssistantEffectProcessor();
  const core = createAnchoredCodeCore();
  const result = applyRuntimeInvocationAssistantEffects(
    { originSurface: 'chat', id: 'channel-chat' },
    {
      core,
      segments: [createPreviewToolUse()],
    },
    {
      actorId: 'actor-code-agent',
      runtimeSessionId: 'runtime-session-1',
      now: new Date('2026-04-30T10:00:00.000Z'),
    },
  );

  assert.equal(result.core, core);
  assert.deepEqual(result.metadata, {});
});

test('runtime assistant effect predicate only matches Code artifact tool calls', () => {
  registerCodeArtifactRuntimeAssistantEffectProcessor();
  const textOnlySegment: RuntimeMessageSegment = {
    kind: 'text',
    text: 'No artifacts here.',
    toolName: null,
    toolId: null,
  };

  assert.equal(
    hasRuntimeInvocationAssistantEffects(
      { originSurface: 'code', id: 'channel-code' },
      [textOnlySegment],
    ),
    false,
  );
  assert.equal(
    hasRuntimeInvocationAssistantEffects(
      { originSurface: 'chat', id: 'channel-chat' },
      [createPreviewToolUse()],
    ),
    false,
  );
  assert.equal(
    hasRuntimeInvocationAssistantEffects(
      { originSurface: 'code', id: 'channel-code' },
      [createPreviewToolUse()],
    ),
    true,
  );
});
