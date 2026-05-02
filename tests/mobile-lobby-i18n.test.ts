import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getMobileChatCopy,
  getMobileChannelTitle,
  getMobileSettingsCopy,
  getMobileTabsCopy,
  type MobileAppShellPayload,
  resolveMobileLocale,
  selectMobileLobby,
} from '../src/mobile/index.ts';

function createPayload(): MobileAppShellPayload {
  return {
    ownerDisplayName: 'Ken',
    ownerAvatarUrl: null,
    ownerAvatarColor: null,
    chat: {
      cats: [
        {
          id: 'cat-1',
          name: 'Catlas',
          avatarColor: null,
          status: 'active',
          products: ['chat'],
        },
      ],
      channels: [
        {
          id: 'chat-1',
          title: 'Planning',
          topic: '',
          status: 'active',
          unreadCount: 2,
          lastMessageAt: '2026-05-03T12:00:00.000Z',
          lastActivatedAt: null,
          originSurface: 'chat',
        },
      ],
    },
  };
}

test('selectMobileLobby localizes zh-TW lobby chrome', () => {
  const data = selectMobileLobby(createPayload(), {
    now: new Date('2026-05-03T12:00:00.000Z'),
    locale: 'zh-Hant-TW',
  });

  assert.equal(resolveMobileLocale('zh-Hant-TW'), 'zh-TW');
  assert.equal(data.todayLabel, '今天 · 星期日 · 2026-05-03');
  assert.deepEqual(
    data.stats.map((stat) => [stat.id, stat.label, stat.value, stat.hint ?? null]),
    [
      ['active-channels', '進行中對話', '1', null],
      ['cats', '貓咪', '1', null],
      ['channels-with-unread', '未讀', '1', '共 2 則訊息'],
    ],
  );
  assert.equal(data.recentActivity[0]?.hint, '剛剛');
});

test('selectMobileLobby keeps English lobby chrome by default locale family', () => {
  const data = selectMobileLobby(createPayload(), {
    now: new Date('2026-05-03T12:00:00.000Z'),
    locale: 'en-US',
  });

  assert.equal(data.todayLabel, 'Today · Sunday · 2026-05-03');
  assert.deepEqual(
    data.stats.map((stat) => [stat.id, stat.label, stat.value, stat.hint ?? null]),
    [
      ['active-channels', 'Active conversations', '1', null],
      ['cats', 'Cats', '1', null],
      ['channels-with-unread', 'Unread', '1', '2 messages total'],
    ],
  );
  assert.equal(data.recentActivity[0]?.hint, 'just now');
});

test('mobile chat copy exposes localized fixed controls', () => {
  const zh = getMobileChatCopy('zh-TW');
  const en = getMobileChatCopy('en-US');

  assert.equal(zh.sendAction, '送出');
  assert.equal(zh.retryAction, '重試');
  assert.equal(zh.composerPlaceholder.code, '描述程式碼任務…');
  assert.equal(zh.productLabel.work, '工作');
  assert.equal(en.sendAction, 'Send');
  assert.equal(en.productLabel.code, 'CODE');
});

test('mobile settings copy exposes localized fixed controls', () => {
  const zh = getMobileSettingsCopy('zh-TW');
  const en = getMobileSettingsCopy('en');

  assert.equal(zh.settingsTitle, '設定');
  assert.equal(zh.desktopUrlLabel, '桌面版網址');
  assert.equal(
    zh.openWebDashboardDisabledDescription,
    '先在上方設定桌面版網址，才能啟用這個連結。',
  );
  assert.equal(
    zh.openWebDashboardDescription('http://192.168.1.2:8181'),
    '開啟 http://192.168.1.2:8181',
  );
  assert.equal(en.settingsTitle, 'Settings');
  assert.equal(en.openWebDashboardLabel, 'Open web dashboard');
});

test('mobile tabs copy exposes localized fixed controls', () => {
  const zh = getMobileTabsCopy('zh-TW');
  const en = getMobileTabsCopy('en');

  assert.equal(zh.tabTitle.settings, '設定');
  assert.equal(zh.creatingChannelLabel, '建立頻道中…');
  assert.equal(zh.dismissAction, '關閉');
  assert.equal(zh.createChannelError('offline'), '無法建立頻道：offline');
  assert.equal(getMobileChannelTitle(zh, 'code', 'peer'), '新同儕程式碼');
  assert.equal(getMobileChannelTitle(zh, 'work', 'unknown'), '新工作');
  assert.equal(zh.directCatDesktopOnlyTitle, '直接聊天僅限桌面版');
  assert.equal(en.parallelChatDesktopOnlyTitle, 'Parallel chat — desktop only');
});
