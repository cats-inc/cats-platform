import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDraftParallelBranches,
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
      target: targets[0],
      audienceKeys: ['cat-1', 'cat-2'],
      workflowShape: 'concurrent',
    },
    {
      target: targets[1],
      audienceKeys: ['cat-1', 'cat-2'],
      workflowShape: 'concurrent',
    },
  ]);
  assert.notEqual(branches[0]?.audienceKeys, branches[1]?.audienceKeys);
});

test('createDraftParallelBranches falls back to empty audience and sequential workflow', () => {
  const branches = createDraftParallelBranches([{ id: 'target-1' }]);

  assert.deepEqual(branches, [
    {
      target: { id: 'target-1' },
      audienceKeys: [],
      workflowShape: 'sequential',
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
    workflowShape: 'concurrent',
    audienceKeys: [...branch.audienceKeys, 'cat-2'],
  }));

  assert.notEqual(next, branches);
  assert.equal(next[0], branches[0]);
  assert.notEqual(next[1], branches[1]);
  assert.equal(next[2], branches[2]);
  assert.deepEqual(next[1], {
    target: { id: 'target-2' },
    audienceKeys: ['cat-1', 'cat-2'],
    workflowShape: 'concurrent',
  });
});
