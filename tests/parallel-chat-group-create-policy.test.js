import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import { createParallelChatGroup } from '../build/server/products/chat/state/model/index.js';

function createdGroupChannels(state) {
  const group = state.parallelChatGroups[0];
  assert.ok(group);
  return group.memberChannelIds.map((channelId) => {
    const channel = state.channels.find((candidate) => candidate.id === channelId);
    assert.ok(channel);
    return channel;
  });
}

function summarizeRuntimePolicy(channel) {
  return {
    repoPath: channel.repoPath,
    workspaceKind: channel.runtimeWorkspaceKind,
    workspaceAccess: channel.runtimeWorkspaceAccess,
    permissionMode: channel.runtimePermissionMode,
  };
}

test('parallel group create propagates group-level runtime policy to every child channel', () => {
  const state = createParallelChatGroup(createDefaultChatState(), {
    title: 'Policy fanout',
    originSurface: 'code',
    repoPath: 'C:/repo/main',
    runtimeSessionPolicy: {
      workspaceKind: 'worktree',
      workspaceAccess: 'read_only',
      permissionMode: 'default',
    },
    targets: [
      { provider: 'claude', instance: null, model: 'claude-opus-4-6' },
      { provider: 'codex', instance: null, model: 'gpt-5.4' },
    ],
  });

  assert.deepEqual(
    createdGroupChannels(state).map(summarizeRuntimePolicy),
    [
      {
        repoPath: 'C:/repo/main',
        workspaceKind: 'worktree',
        workspaceAccess: 'read_only',
        permissionMode: 'default',
      },
      {
        repoPath: 'C:/repo/main',
        workspaceKind: 'worktree',
        workspaceAccess: 'read_only',
        permissionMode: 'default',
      },
    ],
  );
});

test('parallel group create applies per-target cwd and runtime policy overrides', () => {
  const state = createParallelChatGroup(createDefaultChatState(), {
    title: 'Policy fanout',
    originSurface: 'code',
    repoPath: 'C:/repo/main',
    runtimeSessionPolicy: {
      workspaceKind: 'worktree',
      workspaceAccess: 'read_only',
      permissionMode: 'default',
    },
    targets: [
      {
        provider: 'claude',
        instance: null,
        model: 'claude-opus-4-6',
        cwd: 'C:/repo/worktrees/left',
        runtimeSessionPolicy: {
          workspaceKind: 'source',
          workspaceAccess: 'read_write',
          permissionMode: 'skip',
        },
      },
      {
        provider: 'codex',
        instance: null,
        model: 'gpt-5.4',
        cwd: 'C:/repo/worktrees/right',
      },
    ],
  });

  assert.deepEqual(
    createdGroupChannels(state).map(summarizeRuntimePolicy),
    [
      {
        repoPath: 'C:/repo/worktrees/left',
        workspaceKind: 'source',
        workspaceAccess: 'read_write',
        permissionMode: 'skip',
      },
      {
        repoPath: 'C:/repo/worktrees/right',
        workspaceKind: 'worktree',
        workspaceAccess: 'read_only',
        permissionMode: 'default',
      },
    ],
  );
});

test('parallel group create falls back to per-target server defaults when no policy is set', () => {
  const state = createParallelChatGroup(createDefaultChatState(), {
    title: 'Policy fanout',
    originSurface: 'code',
    targets: [
      {
        provider: 'claude',
        instance: null,
        model: 'claude-opus-4-6',
        cwd: 'C:/repo/worktrees/left',
      },
      { provider: 'codex', instance: null, model: 'gpt-5.4' },
    ],
  });

  assert.deepEqual(
    createdGroupChannels(state).map(summarizeRuntimePolicy),
    [
      {
        repoPath: 'C:/repo/worktrees/left',
        workspaceKind: 'source',
        workspaceAccess: 'read_write',
        permissionMode: 'skip',
      },
      {
        repoPath: null,
        workspaceKind: 'sandbox',
        workspaceAccess: 'read_write',
        permissionMode: 'skip',
      },
    ],
  );
});

test('parallel group create annotates invalid per-target runtime policy errors', () => {
  assert.throws(
    () => createParallelChatGroup(createDefaultChatState(), {
      title: 'Policy fanout',
      originSurface: 'code',
      runtimeSessionPolicy: {
        workspaceKind: 'worktree',
        workspaceAccess: 'read_only',
        permissionMode: 'default',
      },
      targets: [
        { provider: 'claude', instance: null, model: 'claude-opus-4-6' },
        {
          provider: 'codex',
          instance: null,
          model: 'gpt-5.4',
          runtimeSessionPolicy: {
            workspaceKind: 'source',
            workspaceAccess: 'read_write',
            permissionMode: 'default',
          },
        },
      ],
    }),
    (error) => {
      assert.match(
        error instanceof Error ? error.message : '',
        /Parallel chat target 2's session policy:/u,
      );
      assert.equal(error.issue?.details?.targetIndex, 1);
      return true;
    },
  );
});
