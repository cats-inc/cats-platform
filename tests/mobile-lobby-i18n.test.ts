import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
