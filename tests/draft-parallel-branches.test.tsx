import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDraftParallelBranches,
  mergeDraftParallelTargetBranchFields,
  updateDraftParallelBranchAt,
} from '../src/products/shared/renderer/draftParallelBranches.ts';

test('createDraftParallelBranches seeds every branch with deduped audience keys and one workflow shape', () => {
  const targets = [
    { provider: 'claude', model: 'opus' },
    { provider: 'codex', model: 'gpt-5.4' },
  ];

  const branches = createDraftParallelBranches(targets, {
    seedAudienceKeys: ['cat-1', 'cat-2', 'cat-1', '', 'cat-2'],
    seedWorkflowShape: 'concurrent',
  });

  assert.deepEqual(branches, [
    {
      target: {
        ...targets[0],
        audienceKeys: ['cat-1', 'cat-2'],
        workflowShape: 'concurrent',
      },
    },
    {
      target: {
        ...targets[1],
        audienceKeys: ['cat-1', 'cat-2'],
        workflowShape: 'concurrent',
      },
    },
  ]);
  assert.notEqual(branches[0]?.target.audienceKeys, branches[1]?.target.audienceKeys);
});

test('createDraftParallelBranches falls back to empty audience and sequential workflow', () => {
  const branches = createDraftParallelBranches([{ id: 'target-1' }]);

  assert.deepEqual(branches, [
    {
      target: { id: 'target-1', audienceKeys: [], workflowShape: 'sequential' },
    },
  ]);
});

test('updateDraftParallelBranchAt only replaces the requested branch', () => {
  const branches = createDraftParallelBranches(
    [{ id: 'target-1' }, { id: 'target-2' }, { id: 'target-3' }],
    { seedAudienceKeys: ['cat-1'] },
  );

  const next = updateDraftParallelBranchAt(branches, 1, (branch) => ({
    ...branch,
    target: {
      ...branch.target,
      workflowShape: 'concurrent',
      audienceKeys: [...(branch.target.audienceKeys ?? []), 'cat-2'],
    },
  }));

  assert.notEqual(next, branches);
  assert.equal(next[0], branches[0]);
  assert.notEqual(next[1], branches[1]);
  assert.equal(next[2], branches[2]);
  assert.deepEqual(next[1], {
    target: {
      id: 'target-2',
      audienceKeys: ['cat-1', 'cat-2'],
      workflowShape: 'concurrent',
    },
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
      attachmentsOverride: [{ relativePath: 'src/app.ts' }],
    },
  );
});
