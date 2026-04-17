import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RuntimeSessionPolicyError,
  completeRuntimeSessionPolicy,
  createRuntimeSessionContractInput,
  createDefaultRuntimeSessionPolicy,
  parseRuntimeSessionPolicyCreateInput,
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

test('createRuntimeSessionContractInput converts a read-only policy into create-boundary fields', () => {
  assert.deepEqual(
    createRuntimeSessionContractInput({
      workspaceKind: 'worktree',
      workspaceAccess: 'read_only',
      permissionMode: 'default',
    }),
    {
      runtimeWorkspaceKind: 'worktree',
      runtimeWorkspaceAccess: 'read_only',
      runtimePermissionMode: 'default',
    },
  );
});

test('createRuntimeSessionContractInput carries read-write skip policies onto the create-boundary shape', () => {
  assert.deepEqual(
    createRuntimeSessionContractInput({
      workspaceKind: 'source',
      workspaceAccess: 'read_write',
      permissionMode: 'skip',
    }),
    {
      runtimeWorkspaceKind: 'source',
      runtimeWorkspaceAccess: 'read_write',
      runtimePermissionMode: 'skip',
    },
  );
});

test('createRuntimeSessionContractInput preserves an explicit whitelist opt-in', () => {
  assert.deepEqual(
    createRuntimeSessionContractInput({
      workspaceKind: 'sandbox',
      workspaceAccess: 'read_write',
      permissionMode: 'whitelist',
    }),
    {
      runtimeWorkspaceKind: 'sandbox',
      runtimeWorkspaceAccess: 'read_write',
      runtimePermissionMode: 'whitelist',
    },
  );
});

test('validateRuntimeSessionPolicyInput accepts valid combinations', () => {
  assert.equal(
    validateRuntimeSessionPolicyInput({
      workspaceKind: 'sandbox',
      workspaceAccess: 'read_write',
      permissionMode: 'skip',
    }),
    null,
  );

  assert.equal(
    validateRuntimeSessionPolicyInput({
      workspaceKind: 'worktree',
      workspaceAccess: 'read_only',
      permissionMode: 'default',
    }),
    null,
  );

  assert.equal(
    validateRuntimeSessionPolicyInput({
      workspaceKind: 'source',
      workspaceAccess: 'read_write',
      permissionMode: 'whitelist',
    }),
    null,
  );
});

test('validateRuntimeSessionPolicyInput accepts empty input and lets callers fall back to defaults', () => {
  assert.equal(validateRuntimeSessionPolicyInput({}), null);
  assert.equal(
    validateRuntimeSessionPolicyInput({
      workspaceKind: 'worktree',
    }),
    null,
  );
});

test('validateRuntimeSessionPolicyInput rejects invalid workspace kinds and access literals', () => {
  assert.deepEqual(
    validateRuntimeSessionPolicyInput({
      workspaceKind: 'bogus',
    }),
    {
      code: 'invalid_runtime_workspace_kind',
      message: 'runtimeWorkspaceKind must be one of: source, sandbox, worktree.',
      details: {
        received: 'bogus',
      },
    },
  );

  assert.deepEqual(
    validateRuntimeSessionPolicyInput({
      workspaceAccess: 'bogus',
    }),
    {
      code: 'invalid_runtime_workspace_access',
      message: 'runtimeWorkspaceAccess must be one of: read_write, read_only.',
      details: {
        received: 'bogus',
      },
    },
  );
});

test('validateRuntimeSessionPolicyInput rejects invalid permission literals', () => {
  assert.deepEqual(
    validateRuntimeSessionPolicyInput({
      workspaceAccess: 'read_write',
      permissionMode: 'bogus',
    }),
    {
      code: 'invalid_runtime_permission_mode',
      message: 'runtimePermissionMode must be one of: skip, default, whitelist.',
      details: {
        received: 'bogus',
      },
    },
  );
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
});

test('validateRuntimeSessionPolicyInput rejects read-only sessions with non-default permission modes', () => {
  assert.deepEqual(
    validateRuntimeSessionPolicyInput({
      workspaceAccess: 'read_only',
      permissionMode: 'whitelist',
    }),
    {
      code: 'invalid_runtime_policy_combination',
      message: 'read_only sessions may only use the default permission gate.',
      details: {
        workspaceAccess: 'read_only',
        permissionMode: 'whitelist',
      },
    },
  );
});

test('parseRuntimeSessionPolicyCreateInput resolves valid raw input into a repo-aware narrow policy', () => {
  const result = parseRuntimeSessionPolicyCreateInput({
    repoPath: 'C:/repo/cats-platform',
    policy: {
      workspaceAccess: 'read_only',
      permissionMode: 'default',
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.policy, {
    workspaceKind: 'source',
    workspaceAccess: 'read_only',
    permissionMode: 'default',
  });
});

test('parseRuntimeSessionPolicyCreateInput returns the first validation issue for invalid combinations', () => {
  const result = parseRuntimeSessionPolicyCreateInput({
    repoPath: 'C:/repo/cats-platform',
    policy: {
      workspaceAccess: 'read_write',
      permissionMode: 'default',
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issue.code, 'invalid_runtime_policy_combination');
  assert.deepEqual(result.issue.details, {
    workspaceAccess: 'read_write',
    permissionMode: 'default',
  });
});

test('parseRuntimeSessionPolicyCreateInput falls back to sandbox defaults when no repoPath is supplied', () => {
  const result = parseRuntimeSessionPolicyCreateInput({
    policy: {},
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.policy, {
    workspaceKind: 'sandbox',
    workspaceAccess: 'read_write',
    permissionMode: 'skip',
  });
});

test('RuntimeSessionPolicyError preserves the issue code in its Error.message so plain logs keep the signal', () => {
  const error = new RuntimeSessionPolicyError({
    code: 'invalid_runtime_policy_combination',
    message: 'read_write sessions may only use the skip or whitelist permission modes.',
    details: {
      workspaceAccess: 'read_write',
      permissionMode: 'default',
    },
  });

  assert.ok(error instanceof Error);
  assert.ok(error instanceof RuntimeSessionPolicyError);
  assert.equal(error.name, 'RuntimeSessionPolicyError');
  assert.match(error.message, /^\[invalid_runtime_policy_combination\] /);
  assert.equal(error.issue.code, 'invalid_runtime_policy_combination');
  assert.deepEqual(error.issue.details, {
    workspaceAccess: 'read_write',
    permissionMode: 'default',
  });
});
