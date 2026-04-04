import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildNewChatPath,
  buildNewGroupChatPath,
  buildMyCatPath,
  buildChannelPath,
  createChannelExportFilename,
  isNewChatPath,
  isOpaqueChannelId,
  NEW_CHAT_PATH,
  readNewChatLeadCatId,
  resolveAppEntryPath,
  resolveDefaultChatPath,
  resolveVisibleChatPath,
  SETUP_PATH,
  slugifyChannelLabel,
} from '../dist-server/products/chat/shared/channelPaths.js';

test('resolveDefaultChatPath falls back to the dedicated new-chat route', () => {
  assert.equal(resolveDefaultChatPath(''), NEW_CHAT_PATH);
  assert.equal(resolveDefaultChatPath(null), NEW_CHAT_PATH);
  assert.equal(resolveDefaultChatPath(undefined), NEW_CHAT_PATH);
});

test('resolveVisibleChatPath skips hidden direct lanes when choosing Chats overview target', () => {
  const channels = [
    { id: 'direct-1', roomMode: 'direct_cat_chat' },
    { id: 'boss-1', roomMode: 'boss_chat' },
  ];

  assert.equal(
    resolveVisibleChatPath(channels, 'direct-1'),
    '/chat/chats/boss-1',
  );
  assert.equal(
    resolveVisibleChatPath(channels, 'boss-1'),
    '/chat/chats/boss-1',
  );
  assert.equal(
    resolveVisibleChatPath([{ id: 'direct-1', roomMode: 'direct_cat_chat' }], 'direct-1'),
    NEW_CHAT_PATH,
  );
});

test('resolveVisibleChatPath trusts channelKind for direct lanes even when roomMode is legacy-mismatched', () => {
  const channels = [
    { id: 'direct-1', channelKind: 'direct_lane', roomMode: 'boss_chat' },
    { id: 'boss-1', channelKind: 'boss_thread', roomMode: 'boss_chat' },
  ];

  assert.equal(
    resolveVisibleChatPath(channels, 'direct-1'),
    '/chat/chats/boss-1',
  );
});

test('resolveAppEntryPath routes setup and initialized chats to the correct entry page', () => {
  assert.equal(resolveAppEntryPath(null), SETUP_PATH);
  assert.equal(resolveAppEntryPath(undefined), SETUP_PATH);
  assert.equal(resolveAppEntryPath('2026-03-19T00:00:00.000Z'), NEW_CHAT_PATH);
});

test('buildChannelPath and id helpers treat persisted channel ids as opaque', () => {
  const channelId = '0d6ee0b3-cd9e-41df-9a4b-5798bb6ec8ae';

  assert.equal(buildChannelPath(channelId), `/chat/chats/${channelId}`);
  assert.equal(isOpaqueChannelId(channelId), true);
  assert.equal(isOpaqueChannelId('ops-radar'), false);
});

test('new-chat route detection and export filenames remain title-based', () => {
  assert.equal(isNewChatPath('/chat/new'), true);
  assert.equal(isNewChatPath('/new'), false);
  assert.equal(isNewChatPath('/chat/chats'), false);
  assert.equal(
    createChannelExportFilename('Ops Radar', '0d6ee0b3-cd9e-41df-9a4b-5798bb6ec8ae'),
    'channel-ops-radar.json',
  );
  assert.equal(
    createChannelExportFilename('日常對話', '0d6ee0b3-cd9e-41df-9a4b-5798bb6ec8ae'),
    'channel-0d6ee0b3-cd9e-41df-9a4b-5798bb6ec8ae.json',
  );
});

test('new-chat route helpers preserve direct-cat draft state without creating a thread', () => {
  const catId = '0d6ee0b3-cd9e-41df-9a4b-5798bb6ec8ae';

  assert.equal(buildNewChatPath(catId), `/chat/new?cat=${catId}`);
  assert.equal(buildNewGroupChatPath(), '/chat/new?mode=group');
  assert.equal(buildMyCatPath(catId), `/chat/my-cats/${catId}`);
  assert.equal(buildNewChatPath('   '), NEW_CHAT_PATH);
  assert.equal(readNewChatLeadCatId(`?cat=${catId}`), catId);
  assert.equal(readNewChatLeadCatId(''), null);
});

test('slugifyChannelLabel falls back to chat for non-Latin input', () => {
  assert.equal(slugifyChannelLabel('日常對話'), 'chat');
  assert.equal(slugifyChannelLabel('   '), 'chat');
  assert.equal(slugifyChannelLabel('Hello World'), 'hello-world');
});
