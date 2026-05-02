import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildConversationSidebarViewModel,
} from '../src/app/renderer/productShell/conversationSidebarViewModel.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

test('shared sidebar view model filters grouped recents by active product surface', () => {
  const workChannel = {
    id: 'work-1',
    title: 'Work recent',
    originSurface: 'work' as const,
  };
  const workPeerChannel = {
    id: 'work-2',
    title: 'Work compare peer',
    originSurface: 'work' as const,
  };
  const chatChannel = {
    id: 'chat-1',
    title: 'Chat recent',
    originSurface: 'chat' as const,
  };
  const chatPeerChannel = {
    id: 'chat-2',
    title: 'Chat compare peer',
    originSurface: 'chat' as const,
  };

  const viewModel = buildConversationSidebarViewModel({
    payload: {
      runtime: {
        baseUrl: 'http://localhost:8484',
        reachable: true,
        status: 'ok',
      },
      chat: {
        cats: [],
        channels: [workChannel, workPeerChannel, chatChannel, chatPeerChannel],
        botBindings: [],
      },
    },
    helpers: {
      isVisibleCat: () => true,
      isDirectLaneSummary: () => false,
    },
    recentEntries: [
      {
        kind: 'group',
        key: 'work-group',
        title: 'Work compare',
        originSurface: 'work',
        channels: [
          { channel: workChannel },
          { channel: workPeerChannel },
        ],
        onSelect: () => {},
      },
      {
        kind: 'group',
        key: 'chat-group',
        title: 'Chat compare',
        originSurface: 'chat',
        channels: [
          { channel: chatChannel },
          { channel: chatPeerChannel },
        ],
        onSelect: () => {},
      },
    ],
    shellSurface: 'work',
    currentPath: '/work',
  });

  assert.deepEqual(
    viewModel.resolvedRecentEntries.map((entry) =>
      entry.kind === 'group' ? entry.title : entry.channel.title),
    ['Work compare'],
  );
});

test('shared sidebar view model localizes runtime footer copy when given a translator', () => {
  const viewModel = buildConversationSidebarViewModel({
    payload: {
      runtime: {
        baseUrl: 'http://localhost:8484',
        reachable: true,
        status: 'degraded',
      },
      chat: {
        cats: [],
        channels: [],
        botBindings: [],
      },
    },
    helpers: {
      isVisibleCat: () => true,
      isDirectLaneSummary: () => false,
    },
    shellSurface: 'chat',
    currentPath: '/chat',
    t: createTranslator('zh-TW'),
  });

  assert.equal(viewModel.runtimeFooterLabel, 'Cats 執行階段正在啟動');
});
