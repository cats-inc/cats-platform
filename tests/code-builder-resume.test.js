import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  normalizeCodeBuilderTaskId,
  resolveCodeBuilderExecutionTaskId,
} from '../build/server/products/code/shared/builderExecution.js';
import { readCodeTaskBuilderDetail } from '../build/server/products/code/shared/taskDetailSummary.js';

test('normalizeCodeBuilderTaskId trims usable task ids', () => {
  assert.equal(normalizeCodeBuilderTaskId('  task-123  '), 'task-123');
  assert.equal(normalizeCodeBuilderTaskId('   '), null);
  assert.equal(normalizeCodeBuilderTaskId(null), null);
});

test('resolveCodeBuilderExecutionTaskId prefers an existing task over resume input', () => {
  assert.equal(
    resolveCodeBuilderExecutionTaskId('task-existing', 'task-resume'),
    'task-existing',
  );
  assert.equal(
    resolveCodeBuilderExecutionTaskId(null, ' task-resume '),
    'task-resume',
  );
  assert.equal(resolveCodeBuilderExecutionTaskId(null, '   '), null);
});

test('readCodeTaskBuilderDetail normalizes shared control state for the code builder', () => {
  const result = readCodeTaskBuilderDetail({
    task: {
      id: 'task-code-builder',
      title: 'Resume blocked code task',
      summary: 'Continue the reviewer handoff.',
      status: 'blocked',
    },
    effectiveStrategy: 'reflexion',
    workspace: {
      workspacePath: 'C:/repo/cats-platform',
      workspaceKind: 'conversation_repo',
      ownershipState: 'conversation_bound',
    },
    linkedArtifacts: [{ id: 'artifact-preview' }],
    controlPlane: {
      runtimeDeliveryIntent: {
        mode: 'commit_only',
        requiresOwnerDecision: true,
        approvalPending: true,
      },
      workflowContinuation: {
        blockedReason: 'max_dispatches',
        targetNames: ['Code Reviewer'],
        stageId: 'continuation_handoff',
      },
    },
  });

  assert.equal(result.taskId, 'task-code-builder');
  assert.equal(result.title, 'Resume blocked code task');
  assert.equal(result.summary, 'Continue the reviewer handoff.');
  assert.equal(result.taskStatus, 'blocked');
  assert.equal(result.effectiveStrategy, 'reflexion');
  assert.deepEqual(result.workspace, {
    workspacePath: 'C:/repo/cats-platform',
    workspaceKind: 'conversation_repo',
    ownershipState: 'conversation_bound',
  });
  assert.deepEqual(result.linkedArtifacts, [{ id: 'artifact-preview' }]);
  assert.deepEqual(result.runtimeDeliveryIntent, {
    mode: 'commit_only',
    requiresOwnerDecision: true,
    approvalPending: true,
  });
  assert.deepEqual(result.workflowContinuation, {
    blockedReason: 'max_dispatches',
    targetNames: ['Code Reviewer'],
    stageId: 'continuation_handoff',
  });
});

test('CodeBuilderView exposes resume, workspace binding, and execution summary seams', () => {
  const source = readFileSync(
    new URL('../src/products/code/renderer/components/CodeBuilderView.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /messageKeys\.codeBuilderResumePrompt/u);
  assert.match(source, /resolveCodeBuilderExecutionTaskId\(state\.taskId, resumeTaskId\)/u);
  assert.match(source, /resolveWorkspaceBinding/u);
  assert.match(source, /conversationRepoPath: fallbackConversationRepoPath/u);
  assert.match(source, /roomWorkspacePath: fallbackRoomWorkspacePath/u);
  assert.match(source, /messageKeys\.codeBuilderFeedbackResumeTask/u);
  assert.match(source, /CodeExecutionSummaryPanel/u);
  assert.match(source, /continuationBlockedReason=\{continuationBlockedReason\}/u);
  assert.match(source, /deliveryMode=\{deliveryMode\}/u);
  assert.match(source, /setSessionStatus\('running'\)/u);
});

test('code task renderer api normalizes detail responses and unwraps plan envelopes', () => {
  const source = readFileSync(
    new URL('../src/products/code/renderer/api/codeTask.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /task: readCodeTaskBuilderDetail\(response\.task\)/u);
  assert.match(source, /return response\.plan \?\? null;/u);
});

test('DeliveryPanel consumes typed delivery results without inline unknown casts', () => {
  const source = readFileSync(
    new URL('../src/products/code/renderer/components/DeliveryPanel.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /onPreviewCommit: \(message: string\) => Promise<CodeDeliveryResult>/u);
  assert.doesNotMatch(source, /\)\s+as DeliveryPreview/u);
});

test('ArtifactDetailView consumes typed artifact detail responses without local casts', () => {
  const apiSource = readFileSync(
    new URL('../src/products/code/renderer/api/codeTask.ts', import.meta.url),
    'utf8',
  );
  const viewSource = readFileSync(
    new URL('../src/products/code/renderer/components/ArtifactDetailView.tsx', import.meta.url),
    'utf8',
  );

  assert.match(apiSource, /Promise<CodeArtifactDetailResponse>/u);
  assert.match(viewSource, /type CodeArtifactDetailResponse/u);
  assert.doesNotMatch(viewSource, /as ArtifactDetailPayload/u);
});
