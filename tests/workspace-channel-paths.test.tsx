import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChannelPath as buildCodeChannelPath,
  buildNewGroupChatPath as buildCodeNewGroupChatPath,
  buildMyCatPath as buildCodeMyCatPath,
  buildNewChatPath as buildCodeNewChatPath,
  buildNewParallelChatPath as buildCodeNewParallelChatPath,
  readNewChatPreset as readCodeNewChatPreset,
  resolveVisibleChatPath as resolveCodeVisibleChatPath,
} from '../src/products/code/shared/channelPaths.ts';
import { resolveWorkspaceVisibleChatPath } from '../src/products/shared/channelPaths.ts';
import {
  buildChannelPath as buildWorkChannelPath,
  buildNewGroupChatPath as buildWorkNewGroupChatPath,
  buildMyCatPath as buildWorkMyCatPath,
  buildNewChatPath as buildWorkNewChatPath,
  buildNewParallelChatPath as buildWorkNewParallelChatPath,
  readNewChatPreset as readWorkNewChatPreset,
  resolveVisibleChatPath as resolveWorkVisibleChatPath,
} from '../src/products/work/shared/channelPaths.ts';

test('workspace channel paths keep product prefixes while sharing visible-chat semantics', () => {
  const workChannels = [
    { id: 'direct-1', originSurface: 'work' as const, roomMode: 'direct_cat_chat' as const },
    { id: 'boss-1', originSurface: 'work' as const, roomMode: 'boss_chat' as const },
  ];
  const codeChannels = [
    { id: 'direct-1', originSurface: 'code' as const, roomMode: 'direct_cat_chat' as const },
    { id: 'boss-1', originSurface: 'code' as const, roomMode: 'boss_chat' as const },
  ];

  assert.equal(buildWorkNewChatPath('cat-1'), '/work/new?cat=cat-1');
  assert.equal(buildCodeNewChatPath('cat-1'), '/code/new?cat=cat-1');
  assert.equal(buildWorkNewGroupChatPath(), '/work/new?preset=group');
  assert.equal(buildCodeNewGroupChatPath(), '/code/new?preset=group');
  assert.equal(buildWorkNewParallelChatPath(), '/work/new?preset=parallel');
  assert.equal(buildCodeNewParallelChatPath(), '/code/new?preset=parallel');
  assert.equal(buildWorkMyCatPath('companion-cat'), '/work/my-cats/companion-cat');
  assert.equal(buildCodeMyCatPath('companion-cat'), '/code/my-cats/companion-cat');
  assert.equal(buildWorkChannelPath('boss-1'), '/work/chats/boss-1');
  assert.equal(buildCodeChannelPath('boss-1'), '/code/chats/boss-1');
  assert.equal(readWorkNewChatPreset('?preset=group'), 'group');
  assert.equal(readCodeNewChatPreset('?preset=parallel'), 'parallel');
  assert.equal(readWorkNewChatPreset('?preset=unknown'), 'default');
  assert.equal(readCodeNewChatPreset(''), 'default');
  assert.equal(resolveWorkVisibleChatPath(workChannels, 'direct-1'), '/work/chats/boss-1');
  assert.equal(resolveCodeVisibleChatPath(codeChannels, 'direct-1'), '/code/chats/boss-1');

  const crossSurfaceChannels = [
    { id: 'code-1', originSurface: 'code' as const, roomMode: 'boss_chat' as const },
    { id: 'chat-1', originSurface: 'chat' as const, roomMode: 'boss_chat' as const },
  ];

  assert.equal(
    resolveWorkspaceVisibleChatPath('/code', crossSurfaceChannels, 'chat-1', 'code'),
    '/code/chats/code-1',
  );
  assert.equal(resolveCodeVisibleChatPath(crossSurfaceChannels, 'chat-1'), '/code/chats/code-1');
  assert.equal(resolveWorkVisibleChatPath(crossSurfaceChannels, 'chat-1'), '/work/new');
  assert.equal(
    resolveCodeVisibleChatPath(
      [{ id: 'chat-1', originSurface: 'chat' as const, roomMode: 'boss_chat' as const }],
      'chat-1',
    ),
    '/code/new',
  );
});
