import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTelegramCommandRouter,
  type TelegramCommandContext,
} from '../src/platform/transports/telegram/commandRouter.ts';
import {
  createDefaultCommands,
  createTelegramBotCommandCatalog,
  createTelegramBotCommandCatalogVariants,
} from '../src/platform/transports/telegram/commands/index.ts';

function createContext(
  overrides: Partial<Omit<TelegramCommandContext, 'args'>> = {},
): Omit<TelegramCommandContext, 'args'> {
  return {
    chatId: '123',
    senderName: 'Ken',
    botName: 'CatsBot',
    catName: 'Milo',
    catId: 'cat-milo',
    currentMode: 'companion',
    inboundMode: 'webhook',
    locale: 'zh-TW',
    ...overrides,
  };
}

test('Telegram command catalog exposes English fallback and zh command descriptions', () => {
  const english = createTelegramBotCommandCatalog('en');
  const zh = createTelegramBotCommandCatalog('zh-TW');

  assert.equal(
    english.find((command) => command.command === 'start')?.description,
    'Start a conversation',
  );
  assert.equal(
    zh.find((command) => command.command === 'start')?.description,
    '開始對話',
  );
  assert.equal(
    zh.find((command) => command.command === 'mode')?.description,
    '查看或切換陪伴與代理模式',
  );

  assert.deepEqual(
    createTelegramBotCommandCatalogVariants().map((catalog) => catalog.languageCode),
    [null, 'zh'],
  );
});

test('Telegram slash command replies localize from the sender language code', async () => {
  const router = createTelegramCommandRouter();
  router.registerAll(createDefaultCommands());

  const help = await router.dispatch('/help', createContext());
  assert.match(help?.replyText ?? '', /可用指令：/u);
  assert.match(help?.replyText ?? '', /\/mode companion - 切換到陪伴行為/u);

  const start = await router.dispatch('/start', createContext());
  assert.match(start?.replyText ?? '', /你好！我是 Milo/u);
  assert.match(start?.replyText ?? '', /目前模式：陪伴/u);

  const status = await router.dispatch('/status', createContext());
  assert.match(status?.replyText ?? '', /Bot：CatsBot/u);
  assert.match(status?.replyText ?? '', /已綁定貓咪：Milo/u);
  assert.match(status?.replyText ?? '', /狀態：已連線/u);

  const unknown = await router.dispatch('/missing', createContext());
  assert.equal(
    unknown?.replyText,
    '未知指令：/missing\n輸入 /help 查看可用指令。',
  );
});

test('Telegram mode command localizes switch outcomes and preserves English fallback', async () => {
  const router = createTelegramCommandRouter();
  router.registerAll(createDefaultCommands());

  const switched = await router.dispatch('/mode agent', createContext({
    setMode: async () => 'agent',
  }));
  assert.equal(
    switched?.replyText,
    '已將 Milo 切換為代理模式。\n之後此聊天中的一般訊息會使用該模式。',
  );

  const english = await router.dispatch('/mode weird', createContext({
    locale: 'en',
  }));
  assert.equal(
    english?.replyText,
    'Unknown mode: weird\nUse /mode companion or /mode agent.',
  );
});
