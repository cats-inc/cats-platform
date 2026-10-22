import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChannelPath as buildCodeChannelPath,
  buildNewGroupChatPath as buildCodeNewGroupChatPath,
  buildNewChatPath as buildCodeNewChatPath,
  buildNewParallelChatPath as buildCodeNewParallelChatPath,
  readNewChatPreset as readCodeNewChatPreset,
  resolveAppEntryPath as resolveCodeAppEntryPath,
  resolveVisibleChatPath as resolveCodeVisibleChatPath,
} from '../src/products/code/shared/channelPaths.ts';
import { SETUP_PATH, resolveWorkspaceVisibleChatPath } from '../src/products/shared/channelPaths.ts';
import {
  buildChannelPath as buildWorkChannelPath,
  buildNewGroupChatPath as buildWorkNewGroupChatPath,
  buildNewChatPath as buildWorkNewChatPath,
  buildNewParallelChatPath as buildWorkNewParallelChatPath,
  readNewChatPreset as readWorkNewChatPreset,
  resolveAppEntryPath as resolveWorkAppEntryPath,
  resolveVisibleChatPath as resolveWorkVisibleChatPath,
} from '../src/products/work/shared/channelPaths.ts';

// The owner keeps +New Work as the Work landing; Overview stays a sidebar
// destination (2026-10-22, after #286 had made it the default).
test('workspace products land on their new-conversation draft once setup is complete', () => {
  assert.equal(resolveWorkAppEntryPath('2026-10-22T00:00:00.000Z'), '/work/new');
  assert.equal(resolveCodeAppEntryPath('2026-10-22T00:00:00.000Z'), '/code/new');
  assert.equal(resolveWorkAppEntryPath(null), SETUP_PATH);
  assert.equal(resolveCodeAppEntryPath(undefined), SETUP_PATH);
});

test('workspace channel paths keep product prefixes while sharing visible-chat semantics', () => {
  const workChannels = [
    { id: 'direct-1', originSurface: 'work' as const, roomMode: 'direct_message' as const },
    { id: 'boss-1', originSurface: 'work' as const, roomMode: 'chat_channel' as const },
  ];
  const codeChannels = [
    { id: 'direct-1', originSurface: 'code' as const, roomMode: 'direct_message' as const },
    { id: 'boss-1', originSurface: 'code' as const, roomMode: 'chat_channel' as const },
  ];

  assert.equal(buildWorkNewChatPath('cat-1'), '/work/new?cat=cat-1');
  assert.equal(buildCodeNewChatPath('cat-1'), '/code/new?cat=cat-1');
  assert.equal(buildWorkNewGroupChatPath(), '/work/new?preset=group');
  assert.equal(buildCodeNewGroupChatPath(), '/code/new?preset=group');
  assert.equal(buildWorkNewParallelChatPath(), '/work/new?preset=parallel');
  assert.equal(buildCodeNewParallelChatPath(), '/code/new?preset=parallel');
  assert.equal(buildWorkChannelPath('boss-1'), '/work/chats/boss-1');
  assert.equal(buildCodeChannelPath('boss-1'), '/code/chats/boss-1');
  assert.equal(readWorkNewChatPreset('?preset=group'), 'group');
  assert.equal(readCodeNewChatPreset('?preset=parallel'), 'parallel');
  assert.equal(readWorkNewChatPreset('?preset=unknown'), 'default');
  assert.equal(readCodeNewChatPreset(''), 'default');
  assert.equal(resolveWorkVisibleChatPath(workChannels, 'direct-1'), '/work/chats/boss-1');
  assert.equal(resolveCodeVisibleChatPath(codeChannels, 'direct-1'), '/code/chats/boss-1');

  const crossSurfaceChannels = [
    { id: 'code-1', originSurface: 'code' as const, roomMode: 'chat_channel' as const },
    { id: 'chat-1', originSurface: 'chat' as const, roomMode: 'chat_channel' as const },
  ];

  assert.equal(
    resolveWorkspaceVisibleChatPath('/code', crossSurfaceChannels, 'chat-1', 'code'),
    '/code/chats/code-1',
  );
  assert.equal(resolveCodeVisibleChatPath(crossSurfaceChannels, 'chat-1'), '/code/chats/code-1');
  assert.equal(resolveWorkVisibleChatPath(crossSurfaceChannels, 'chat-1'), '/work/new');
  assert.equal(
    resolveWorkspaceVisibleChatPath(
      '/code',
      [{ id: 'legacy-1', roomMode: 'chat_channel' as const }],
      'legacy-1',
      'code',
    ),
    '/code/new',
  );
  assert.equal(
    resolveCodeVisibleChatPath(
      [{ id: 'chat-1', originSurface: 'chat' as const, roomMode: 'chat_channel' as const }],
      'chat-1',
    ),
    '/code/new',
  );
});
