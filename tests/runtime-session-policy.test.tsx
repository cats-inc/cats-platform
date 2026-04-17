import assert from 'node:assert/strict';
import test from 'node:test';

import {
  completeRuntimeSessionPolicy,
  createDefaultRuntimeSessionPolicy,
  resolveCreateRuntimeSessionPolicy,
} from '../src/shared/runtimeSessionPolicy.ts';

test('completeRuntimeSessionPolicy clones defaults and ignores undefined overrides', () => {
  const defaults = createDefaultRuntimeSessionPolicy();
  const completed = completeRuntimeSessionPolicy({
    workspaceKind: undefined,
    workspaceAccess: undefined,
    permissionMode: undefined,
  });

  assert.notStrictEqual(completed, defaults);
  assert.deepEqual(completed, defaults);
});

test('resolveCreateRuntimeSessionPolicy honors explicit overrides over repo-backed defaults', () => {
  const completed = resolveCreateRuntimeSessionPolicy({
    repoPath: 'C:/repo/cats-platform',
    policy: {
      workspaceKind: 'sandbox',
      workspaceAccess: 'read_only',
      permissionMode: 'whitelist',
    },
  });

  assert.equal(completed.workspaceKind, 'sandbox');
  assert.equal(completed.workspaceAccess, 'read_only');
  assert.equal(completed.permissionMode, 'default');
});
