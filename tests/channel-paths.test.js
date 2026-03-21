import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChannelPath,
  createChannelExportFilename,
  isNewChatPath,
  isOpaqueChannelId,
  NEW_CHAT_PATH,
  resolveAppEntryPath,
  resolveDefaultChatPath,
  SETUP_PATH,
  slugifyChannelLabel,
} from '../dist-server/shared/channelPaths.js';

test('resolveDefaultChatPath falls back to the dedicated new-chat route', () => {
  assert.equal(resolveDefaultChatPath(''), NEW_CHAT_PATH);
  assert.equal(resolveDefaultChatPath(null), NEW_CHAT_PATH);
  assert.equal(resolveDefaultChatPath(undefined), NEW_CHAT_PATH);
});

test('resolveAppEntryPath routes setup and initialized chats to the correct entry page', () => {
  assert.equal(resolveAppEntryPath(null), SETUP_PATH);
  assert.equal(resolveAppEntryPath(undefined), SETUP_PATH);
  assert.equal(resolveAppEntryPath('2026-03-19T00:00:00.000Z'), NEW_CHAT_PATH);
});

test('buildChannelPath and id helpers treat persisted channel ids as opaque', () => {
  const channelId = '0d6ee0b3-cd9e-41df-9a4b-5798bb6ec8ae';

  assert.equal(buildChannelPath(channelId), `/chats/${channelId}`);
  assert.equal(isOpaqueChannelId(channelId), true);
  assert.equal(isOpaqueChannelId('ops-radar'), false);
});

test('new-chat route detection and export filenames remain title-based', () => {
  assert.equal(isNewChatPath('/new'), true);
  assert.equal(isNewChatPath('/chats'), false);
  assert.equal(
    createChannelExportFilename('Ops Radar', '0d6ee0b3-cd9e-41df-9a4b-5798bb6ec8ae'),
    'channel-ops-radar.json',
  );
  assert.equal(
    createChannelExportFilename('日常對話', '0d6ee0b3-cd9e-41df-9a4b-5798bb6ec8ae'),
    'channel-0d6ee0b3-cd9e-41df-9a4b-5798bb6ec8ae.json',
  );
});

test('slugifyChannelLabel falls back to chat for non-Latin input', () => {
  assert.equal(slugifyChannelLabel('日常對話'), 'chat');
  assert.equal(slugifyChannelLabel('   '), 'chat');
  assert.equal(slugifyChannelLabel('Hello World'), 'hello-world');
});

