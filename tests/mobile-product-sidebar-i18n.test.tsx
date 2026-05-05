import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getChatSidebarConfig,
  getCodeSidebarConfig,
  getWorkSidebarConfig,
} from '../mobile/src/api/fixtures/productSidebar.ts';
import { getMobileProductSidebarCopy } from '../src/mobile/index.ts';

test('mobile product sidebar copy localizes fixed sidebar chrome', () => {
  const zh = getMobileProductSidebarCopy('zh-TW');

  assert.equal(zh.emptyRecentsLabel, '尚未有近期對話。');

  const chat = getChatSidebarConfig('zh-TW');
  assert.equal(chat.productLabel, '聊天');
  assert.deepEqual(
    chat.primaryActions.map((action) => action.label),
    ['+ 新聊天', '+ 群組聊天', '+ 平行聊天'],
  );
  assert.equal(chat.recentsLabel, '近期項目');
});

test('mobile product sidebar config preserves product-specific action shapes', () => {
  assert.deepEqual(
    getCodeSidebarConfig('zh-TW').primaryActions.map((action) => [action.id, action.label]),
    [
      ['new', '+ 新程式碼'],
      ['team', '+ 團隊程式碼'],
      ['peer', '+ 同儕程式碼'],
    ],
  );
  assert.deepEqual(
    getWorkSidebarConfig('zh-TW').primaryActions.map((action) => [action.id, action.label]),
    [
      ['new', '+ 新工作'],
      ['team', '+ 團隊工作'],
      ['parallel', '+ 平行工作'],
    ],
  );
});

test('mobile product sidebar primary actions ship Title Case in en', () => {
  assert.deepEqual(
    getChatSidebarConfig('en').primaryActions.map((action) => action.label),
    ['+ New Chat', '+ Group Chat', '+ Parallel Chat'],
  );
  assert.deepEqual(
    getCodeSidebarConfig('en').primaryActions.map((action) => action.label),
    ['+ New Code', '+ Team Code', '+ Peer Code'],
  );
  assert.deepEqual(
    getWorkSidebarConfig('en').primaryActions.map((action) => action.label),
    ['+ New Work', '+ Team Work', '+ Parallel Work'],
  );
});
