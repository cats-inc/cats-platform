import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChannelPath as buildCodeChannelPath,
  buildMyCatPath as buildCodeMyCatPath,
  buildNewChatPath as buildCodeNewChatPath,
  resolveVisibleChatPath as resolveCodeVisibleChatPath,
} from '../src/products/code/shared/channelPaths.ts';
import {
  buildChannelPath as buildWorkChannelPath,
  buildMyCatPath as buildWorkMyCatPath,
  buildNewChatPath as buildWorkNewChatPath,
  resolveVisibleChatPath as resolveWorkVisibleChatPath,
} from '../src/products/work/shared/channelPaths.ts';

test('workspace channel paths keep product prefixes while sharing visible-chat semantics', () => {
  const channels = [
    { id: 'direct-1', roomMode: 'direct_cat_chat' as const },
    { id: 'boss-1', roomMode: 'boss_chat' as const },
  ];

  assert.equal(buildWorkNewChatPath('cat-1'), '/work/new?cat=cat-1');
  assert.equal(buildCodeNewChatPath('cat-1'), '/code/new?cat=cat-1');
  assert.equal(buildWorkMyCatPath('companion-cat'), '/work/my-cats/companion-cat');
  assert.equal(buildCodeMyCatPath('companion-cat'), '/code/my-cats/companion-cat');
  assert.equal(buildWorkChannelPath('boss-1'), '/work/chats/boss-1');
  assert.equal(buildCodeChannelPath('boss-1'), '/code/chats/boss-1');
  assert.equal(resolveWorkVisibleChatPath(channels, 'direct-1'), '/work/chats/boss-1');
  assert.equal(resolveCodeVisibleChatPath(channels, 'direct-1'), '/code/chats/boss-1');
});
