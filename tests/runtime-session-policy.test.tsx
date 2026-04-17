import assert from 'node:assert/strict';
import test from 'node:test';

import {
  completeRuntimeSessionPolicy,
  createDefaultRuntimeSessionPolicy,
  resolveCreateRuntimeSessionPolicy,
  validateRuntimeSessionPolicyInput,
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

test('completeRuntimeSessionPolicy returns a fresh copy even when policy is null', () => {
  const completed = completeRuntimeSessionPolicy(null);
  completed.workspaceKind = 'worktree';

  assert.equal(createDefaultRuntimeSessionPolicy().workspaceKind, 'sandbox');
  assert.equal(completeRuntimeSessionPolicy(null).workspaceKind, 'sandbox');
});

test('resolveCreateRuntimeSessionPolicy honors explicit overrides over repo-backed defaults', () => {
  const completed = resolveCreateRuntimeSessionPolicy({
    repoPath: 'C:/repo/cats-platform',
    policy: {
      workspaceKind: 'sandbox',
      workspaceAccess: 'read_write',
      permissionMode: 'whitelist',
    },
  });

  assert.equal(completed.workspaceKind, 'sandbox');
  assert.equal(completed.workspaceAccess, 'read_write');
  assert.equal(completed.permissionMode, 'whitelist');
});

test('resolveCreateRuntimeSessionPolicy forces read-only sessions onto the default permission gate', () => {
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

test('validateRuntimeSessionPolicyInput rejects permission modes without a matching access mode', () => {
  assert.deepEqual(
    validateRuntimeSessionPolicyInput({
      workspaceAccess: 'read_write',
      permissionMode: 'default',
    }),
    {
      code: 'invalid_runtime_policy_combination',
      message: 'read_write sessions may only use skip or whitelist permission modes.',
      details: {
        workspaceAccess: 'read_write',
        permissionMode: 'default',
      },
    },
  );

  assert.deepEqual(
    validateRuntimeSessionPolicyInput({
      permissionMode: 'whitelist',
    }),
    {
      code: 'invalid_runtime_policy_combination',
      message: 'runtimePermissionMode requires runtimeWorkspaceAccess.',
      details: {
        permissionMode: 'whitelist',
      },
    },
  );
});
