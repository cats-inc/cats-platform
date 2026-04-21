import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDraftParallelTargets,
  mergeDraftParallelTargetBranchFields,
  setDraftParallelTargetCwd,
  setDraftParallelTargetPromptOverride,
  setDraftParallelTargetRuntimeSessionPolicy,
  updateDraftParallelTargetAt,
} from '../src/products/shared/renderer/draftParallelTargets.ts';

test('createDraftParallelTargets seeds every target with deduped audience keys and one workflow shape', () => {
  const targets = [
    { provider: 'claude', model: 'opus' },
    { provider: 'codex', model: 'gpt-5.4' },
  ];

  const parallelTargets = createDraftParallelTargets(targets, {
    seedAudienceKeys: ['cat-1', 'cat-2', 'cat-1', '', 'cat-2'],
    seedWorkflowShape: 'concurrent',
  });

  assert.deepEqual(parallelTargets, [
    {
      ...targets[0],
      audienceKeys: ['cat-1', 'cat-2'],
      workflowShape: 'concurrent',
    },
    {
      ...targets[1],
      audienceKeys: ['cat-1', 'cat-2'],
      workflowShape: 'concurrent',
    },
  ]);
  assert.notEqual(parallelTargets[0]?.audienceKeys, parallelTargets[1]?.audienceKeys);
});

test('createDraftParallelTargets falls back to empty audience and sequential workflow', () => {
  const targets = createDraftParallelTargets([{ id: 'target-1' }]);

  assert.deepEqual(targets, [
    { id: 'target-1', audienceKeys: [], workflowShape: 'sequential' },
  ]);
});

test('updateDraftParallelTargetAt only replaces the requested target', () => {
  const targets = createDraftParallelTargets(
    [{ id: 'target-1' }, { id: 'target-2' }, { id: 'target-3' }],
    { seedAudienceKeys: ['cat-1'] },
  );

  const next = updateDraftParallelTargetAt(targets, 1, (target) => ({
    ...target,
    workflowShape: 'concurrent',
    audienceKeys: [...(target.audienceKeys ?? []), 'cat-2'],
  }));

  assert.notEqual(next, targets);
  assert.equal(next[0], targets[0]);
  assert.notEqual(next[1], targets[1]);
  assert.equal(next[2], targets[2]);
  assert.deepEqual(next[1], {
    id: 'target-2',
    audienceKeys: ['cat-1', 'cat-2'],
    workflowShape: 'concurrent',
  });
});

test('mergeDraftParallelTargetBranchFields preserves branch-scoped controls on target edits', () => {
  const target = {
    provider: 'codex',
    model: 'gpt-5.4',
    instance: 'codex-local',
    modelSelection: null,
  };

  assert.deepEqual(
    mergeDraftParallelTargetBranchFields(target, {
      audienceKeys: ['cat-1', 'cat-1', ''],
      workflowShape: 'concurrent',
      cwd: 'C:/repo/worktree-a',
      runtimeSessionPolicy: {
        workspaceKind: 'worktree',
        workspaceAccess: 'read_write',
        permissionMode: 'skip',
      },
      promptOverride: 'Branch-specific prompt',
      attachmentsOverride: [{ relativePath: 'src/app.ts' }],
    }),
    {
      ...target,
      audienceKeys: ['cat-1'],
      workflowShape: 'concurrent',
      cwd: 'C:/repo/worktree-a',
      runtimeSessionPolicy: {
        workspaceKind: 'worktree',
        workspaceAccess: 'read_write',
        permissionMode: 'skip',
      },
      promptOverride: 'Branch-specific prompt',
      attachmentsOverride: [{ relativePath: 'src/app.ts' }],
    },
  );
});

test('setDraftParallelTargetCwd writes and re-links one branch without touching siblings', () => {
  const targets = createDraftParallelTargets(
    [{ id: 'lead' }, { id: 'right' }, { id: 'third' }],
    { seedAudienceKeys: ['cat-1'] },
  );
  const detached = setDraftParallelTargetCwd(targets, 1, 'C:/repo/worktrees/right');

  assert.notEqual(detached, targets);
  assert.equal(detached[0], targets[0]);
  assert.equal(detached[2], targets[2]);
  assert.equal(detached[1]?.cwd, 'C:/repo/worktrees/right');

  const relinked = setDraftParallelTargetCwd(detached, 1, null);

  assert.equal(relinked[0], detached[0]);
  assert.equal(relinked[2], detached[2]);
  assert.equal(relinked[1]?.cwd, null);
});

test('setDraftParallelTargetRuntimeSessionPolicy writes and re-links one branch', () => {
  const targets = createDraftParallelTargets([{ id: 'lead' }, { id: 'right' }]);
  const policy = {
    workspaceKind: 'worktree',
    workspaceAccess: 'read_only',
    permissionMode: 'default',
  } as const;
  const detached = setDraftParallelTargetRuntimeSessionPolicy(targets, 1, policy);

  assert.notEqual(detached, targets);
  assert.equal(detached[0], targets[0]);
  assert.deepEqual(detached[1]?.runtimeSessionPolicy, policy);

  const relinked = setDraftParallelTargetRuntimeSessionPolicy(detached, 1, null);

  assert.equal(relinked[0], detached[0]);
  assert.equal(relinked[1]?.runtimeSessionPolicy, null);
});

test('setDraftParallelTargetPromptOverride writes and re-links one branch', () => {
  const targets = createDraftParallelTargets([{ id: 'lead' }, { id: 'right' }]);
  const detached = setDraftParallelTargetPromptOverride(targets, 1, 'Branch prompt');

  assert.notEqual(detached, targets);
  assert.equal(detached[0], targets[0]);
  assert.equal(detached[1]?.promptOverride, 'Branch prompt');

  const relinked = setDraftParallelTargetPromptOverride(detached, 1, null);

  assert.equal(relinked[0], detached[0]);
  assert.equal(relinked[1]?.promptOverride, null);
});
