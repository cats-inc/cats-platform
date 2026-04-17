import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeChannel } from '../src/products/chat/state/chat-snapshot/entities.ts';

test('normalizeChannel back-fills legacy repo-backed runtime policy defaults', () => {
  const channel = normalizeChannel(
    {
      id: 'channel-legacy',
      title: 'Legacy repo room',
      topic: 'Loaded from an older snapshot without runtime policy fields.',
      repoPath: 'C:/repo/cats-platform',
      createdAt: '2026-04-18T00:00:00.000Z',
      updatedAt: '2026-04-18T00:00:00.000Z',
      messages: [],
    },
    new Map(),
  );

  assert.ok(channel);
  assert.equal(channel.runtimeWorkspaceKind, 'source');
  assert.equal(channel.runtimeWorkspaceAccess, 'read_write');
  assert.equal(channel.runtimePermissionMode, 'skip');
});
