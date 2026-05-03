import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  resolveCodeWorkspace,
} from '../build/server/products/code/state/workspaceResolution.js';

test('resolveCodeWorkspace resolves an explicit path that exists', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'code-ws-'));
  try {
    const result = await resolveCodeWorkspace({ explicitPath: dir });
    assert.equal(result.resolved, true);
    assert.equal(result.workspace.workspacePath, dir);
    assert.equal(result.workspace.workspaceKind, 'user_selected');
    assert.equal(result.error, null);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('resolveCodeWorkspace rejects a nonexistent explicit path', async () => {
  const result = await resolveCodeWorkspace({
    explicitPath: '/nonexistent/path/that/does/not/exist',
  });
  assert.equal(result.resolved, false);
  assert.equal(result.workspace, null);
  assert.ok(result.error);
  assert.equal(result.errorCode, 'selected_path_invalid');
  assert.equal(result.errorPath, '/nonexistent/path/that/does/not/exist');
  assert.match(result.error, /does not exist/u);
});

test('resolveCodeWorkspace falls back to conversationRepoPath', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'code-ws-'));
  try {
    const result = await resolveCodeWorkspace({ conversationRepoPath: dir });
    assert.equal(result.resolved, true);
    assert.equal(result.workspace.workspacePath, dir);
    assert.equal(result.workspace.workspaceKind, 'conversation_repo');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('resolveCodeWorkspace falls back to roomWorkspacePath', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'code-ws-'));
  try {
    const result = await resolveCodeWorkspace({ roomWorkspacePath: dir });
    assert.equal(result.resolved, true);
    assert.equal(result.workspace.workspacePath, dir);
    assert.equal(result.workspace.workspaceKind, 'managed_room');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('resolveCodeWorkspace returns error when no paths are valid', async () => {
  const result = await resolveCodeWorkspace({});
  assert.equal(result.resolved, false);
  assert.equal(result.workspace, null);
  assert.ok(result.error);
  assert.equal(result.errorCode, 'no_valid_workspace_path');
  assert.equal(result.errorPath, null);
});

test('resolveCodeWorkspace prefers explicit path over fallbacks', async () => {
  const dir1 = await mkdtemp(path.join(tmpdir(), 'code-ws-'));
  const dir2 = await mkdtemp(path.join(tmpdir(), 'code-ws-'));
  try {
    const result = await resolveCodeWorkspace({
      explicitPath: dir1,
      conversationRepoPath: dir2,
    });
    assert.equal(result.resolved, true);
    assert.equal(result.workspace.workspacePath, dir1);
    assert.equal(result.workspace.workspaceKind, 'user_selected');
  } finally {
    await rm(dir1, { recursive: true });
    await rm(dir2, { recursive: true });
  }
});

test('resolveCodeWorkspace trims whitespace from paths', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'code-ws-'));
  try {
    const result = await resolveCodeWorkspace({ explicitPath: `  ${dir}  ` });
    assert.equal(result.resolved, true);
    assert.equal(result.workspace.workspacePath, dir);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('resolveCodeWorkspace treats empty strings as absent', async () => {
  const result = await resolveCodeWorkspace({
    explicitPath: '  ',
    conversationRepoPath: '',
    roomWorkspacePath: null,
  });
  assert.equal(result.resolved, false);
});
