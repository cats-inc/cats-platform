import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getMobileApiCopy,
  getMobileChatCopy,
  getMobileChannelTitle,
  getMobileLobbyCopy,
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

test('selectMobileLobby projects chat cats into the mobile sidebar shape (PLAN-091 phase 5)', () => {
  // Locale resolution still routes zh-Hant-TW → zh-TW for the rest of
  // the mobile copy surfaces; assert that pre-existing contract here
  // even though selectMobileLobby itself no longer takes a locale.
  assert.equal(resolveMobileLocale('zh-Hant-TW'), 'zh-TW');

  const data = selectMobileLobby(createPayload());

  assert.deepEqual(data.cats, [
    {
      id: 'cat-1',
      name: 'Catlas',
      avatarUrl: null,
      avatarColor: null,
      isBoss: false,
    },
  ]);
  assert.deepEqual(data.clowders, []);
  assert.deepEqual(data.catteries, []);
});

test('mobile lobby copy ships sidebar section labels and entity-detail strings (PLAN-091 phase 5)', () => {
  const en = getMobileLobbyCopy('en');
  const zh = getMobileLobbyCopy('zh-TW');

  assert.equal(en.sectionMyCats, 'My Cats');
  assert.equal(en.sectionMyClowders, 'My Clowders');
  assert.equal(en.sectionMyCatteries, 'My Catteries');
  assert.equal(en.newCat, '+ New Cat');
  assert.equal(en.expandSectionLabel('My Cats'), 'Expand My Cats');
  assert.equal(en.collapseSectionLabel('My Cats'), 'Collapse My Cats');

  assert.equal(zh.sectionMyCats, '我的貓咪');
  assert.equal(zh.sectionMyClowders, '我的貓群');
  assert.equal(zh.sectionMyCatteries, '我的貓窩');
  assert.equal(zh.newCat, '+ 新增貓咪');
  assert.equal(zh.expandSectionLabel('我的貓咪'), '展開 我的貓咪');

  // Entity detail (Stack screens that drill into a single Cat /
  // Clowder / Cattery from the Lobby tab)
  assert.equal(en.entityDetailEyebrow, 'Coming soon');
  assert.equal(en.entityDetailTitleCat, 'Cat home');
  assert.equal(en.entityDetailTitleClowder, 'Clowder home');
  assert.equal(en.entityDetailTitleCattery, 'Cattery home');
  assert.equal(en.entityDetailIdLabel, 'ID');
  assert.equal(en.entityDetailBackToLobbyLabel, 'Back to Lobby');
  assert.match(en.entityDetailBody, /This entity page is being built/u);

  assert.equal(zh.entityDetailEyebrow, '開發中');
  assert.equal(zh.entityDetailTitleCat, '貓的主頁');
  assert.equal(zh.entityDetailTitleClowder, '貓群主頁');
  assert.equal(zh.entityDetailTitleCattery, '貓窩主頁');
  assert.equal(zh.entityDetailBackToLobbyLabel, '返回大廳');
});

test('selectMobileLobby honors catsLimit when slicing the projection', () => {
  const data = selectMobileLobby(
    {
      ...createPayload(),
      chat: {
        cats: [
          { id: 'a', name: 'A', avatarColor: null, status: 'active', products: ['chat'] },
          { id: 'b', name: 'B', avatarColor: null, status: 'active', products: ['chat'] },
          { id: 'c', name: 'C', avatarColor: null, status: 'active', products: ['chat'] },
        ],
        channels: [],
      },
    },
    { catsLimit: 2 },
  );

  assert.deepEqual(
    data.cats.map((cat) => cat.id),
    ['a', 'b'],
  );
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

test('mobile api copy exposes localized deterministic errors', () => {
  const zh = getMobileApiCopy('zh-TW');
  const en = getMobileApiCopy('en');

  assert.equal(
    zh.configureBaseUrlBeforeCreatingChannel,
    '建立頻道前，請先在設定中填入桌面版基底網址。',
  );
  assert.equal(zh.configureBaseUrlBeforeSending, '送出前，請先在設定中填入桌面版基底網址。');
  assert.equal(zh.createChannelFailed, '無法建立頻道。');
  assert.equal(zh.sendFailed, '無法送出。');
  assert.equal(en.unknownError, 'Unknown error.');
});
