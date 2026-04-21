import assert from 'node:assert/strict';
import test from 'node:test';

import type { RuntimeSessionPolicy } from '../src/shared/runtimeSessionPolicy.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import { createParallelChatGroup } from '../src/products/chat/state/model/index.ts';

test('createParallelChatGroup materializes group defaults and per-target runtime overrides', () => {
  const state = createDefaultChatState();

  const nextState = createParallelChatGroup(
    state,
    {
      title: 'Compare runtime policies',
      originSurface: 'code',
      repoPath: 'C:/repo/main',
      runtimeSessionPolicy: {
        workspaceKind: 'source',
        workspaceAccess: 'read_only',
        permissionMode: 'default',
      },
      targets: [
        {
          provider: 'claude',
          instance: null,
          model: 'claude-opus-4-6',
          modelSelection: null,
        },
        {
          provider: 'codex',
          instance: null,
          model: 'gpt-5.4',
          modelSelection: null,
          cwd: 'C:/repo/worktrees/review',
          runtimeSessionPolicy: {
            workspaceKind: 'worktree',
            workspaceAccess: 'read_write',
            permissionMode: 'skip',
          },
        },
      ],
    },
    new Date('2026-04-21T00:00:00.000Z'),
  );

  const group = nextState.parallelChatGroups[0];
  assert.ok(group);
  const memberChannels = group.memberChannelIds.map((channelId) => {
    const channel = nextState.channels.find((candidate) => candidate.id === channelId);
    assert.ok(channel);
    return channel;
  });

  assert.equal(memberChannels[0]?.repoPath, 'C:/repo/main');
  assert.equal(memberChannels[0]?.runtimeWorkspaceKind, 'source');
  assert.equal(memberChannels[0]?.runtimeWorkspaceAccess, 'read_only');
  assert.equal(memberChannels[0]?.runtimePermissionMode, 'default');

  assert.equal(memberChannels[1]?.repoPath, 'C:/repo/worktrees/review');
  assert.equal(memberChannels[1]?.runtimeWorkspaceKind, 'worktree');
  assert.equal(memberChannels[1]?.runtimeWorkspaceAccess, 'read_write');
  assert.equal(memberChannels[1]?.runtimePermissionMode, 'skip');
});

test('createParallelChatGroup reports invalid per-target runtime policy with target index', () => {
  assert.throws(
    () => createParallelChatGroup(
      createDefaultChatState(),
      {
        title: 'Invalid target policy',
        originSurface: 'code',
        targets: [
          {
            provider: 'claude',
            instance: null,
            model: 'claude-opus-4-6',
            modelSelection: null,
          },
          {
            provider: 'codex',
            instance: null,
            model: 'gpt-5.4',
            modelSelection: null,
            runtimeSessionPolicy: {
              workspaceKind: 'source',
              workspaceAccess: 'read_only',
              permissionMode: 'skip',
            } as unknown as RuntimeSessionPolicy,
          },
        ],
      },
      new Date('2026-04-21T00:00:00.000Z'),
    ),
    /Parallel chat target 2's session policy: read_only sessions may only use the default permission gate\./u,
  );
});
