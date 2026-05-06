import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTelegramImplicitProductIntentCallbackData,
  buildTelegramImplicitProductIntentChoiceResponse,
  buildTelegramImplicitProductIntentReplyMarkup,
  parseTelegramImplicitProductIntentCallbackData,
} from '../src/platform/transports/telegram/bridge.ts';
import {
  createTelegramBotApiDeliveryClient,
} from '../src/platform/transports/telegram/delivery.ts';
import type { TelegramFetch } from '../src/platform/transports/telegram/http.ts';
import { pickTelegramMessage } from '../src/platform/transports/telegram/utils.ts';

const SOURCE_MESSAGE_ID = '72d884b7-cea8-4945-a405-e55cd1f6d1c3';

function createImplicitCandidateMessage() {
  return {
    id: 'candidate-message',
    senderKind: 'system',
    senderName: 'Cats',
    body: '這看起來像 Code。',
    choices: [
      {
        question: '要把這則訊息轉成 Code intake 嗎？',
        options: [
          {
            id: 'confirm_code',
            label: '轉成 Code',
          },
          {
            id: 'decline',
            label: '保留為 chat',
          },
        ],
      },
    ],
    metadata: {
      implicitProductIntentCandidate: {
        version: 1,
        candidateId: `implicit-product-intent:v1:${SOURCE_MESSAGE_ID}:code`,
        event: 'suggested',
        source: {
          messageId: SOURCE_MESSAGE_ID,
          channelId: 'channel-1',
          conversationId: 'conversation-1',
          transport: 'telegram',
        },
        candidate: {
          targetProduct: 'code',
          confidence: 'high',
          reasonCode: 'code_high_action_product_cue',
        },
        expiresAt: '2026-05-06T08:15:00.000Z',
      },
    },
  };
}

test('Telegram implicit product intent reply markup uses compact callback data', () => {
  const markup = buildTelegramImplicitProductIntentReplyMarkup(createImplicitCandidateMessage());

  assert.deepEqual(markup, {
    inline_keyboard: [
      [
        {
          text: '轉成 Code',
          callback_data: `ipi:v1:${SOURCE_MESSAGE_ID}:c:confirm`,
        },
        {
          text: '保留為 chat',
          callback_data: `ipi:v1:${SOURCE_MESSAGE_ID}:c:decline`,
        },
      ],
    ],
  });
  assert.ok((markup?.inline_keyboard[0]?.[0]?.callback_data.length ?? 0) <= 64);
  assert.equal(
    parseTelegramImplicitProductIntentCallbackData(
      buildTelegramImplicitProductIntentCallbackData({
        sourceMessageId: SOURCE_MESSAGE_ID,
        targetProduct: 'work',
        action: 'confirm',
      }),
    )?.targetProduct,
    'work',
  );
  assert.equal(
    parseTelegramImplicitProductIntentCallbackData(
      buildTelegramImplicitProductIntentCallbackData({
        sourceMessageId: SOURCE_MESSAGE_ID,
        targetProduct: 'work',
        action: 'confirm',
      }),
    )?.action,
    'confirm',
  );
  assert.equal(
    parseTelegramImplicitProductIntentCallbackData(
      buildTelegramImplicitProductIntentCallbackData({
        sourceMessageId: SOURCE_MESSAGE_ID,
        targetProduct: 'work',
        action: 'confirm',
      }),
    )?.sourceMessageId,
    SOURCE_MESSAGE_ID,
  );
  assert.equal(
    parseTelegramImplicitProductIntentCallbackData('/work nope'),
    null,
  );
  assert.equal(
    buildTelegramImplicitProductIntentCallbackData({
      sourceMessageId: SOURCE_MESSAGE_ID,
      targetProduct: 'work',
      action: 'confirm',
    }),
    `ipi:v1:${SOURCE_MESSAGE_ID}:w:confirm`,
  );
});

test('Telegram implicit product intent choice response keeps transcript body locale-neutral', () => {
  const response = buildTelegramImplicitProductIntentChoiceResponse({
    message: createImplicitCandidateMessage(),
    action: 'confirm',
    submittedAt: '2026-05-06T08:03:00.000Z',
  });

  assert.equal(response?.body, '轉成 Code');
  assert.equal(response?.choiceResponse.answers[0]?.question, '要把這則訊息轉成 Code intake 嗎？');
  assert.deepEqual(response?.choiceResponse.answers[0]?.selectedOptionIds, ['confirm_code']);
});

test('Telegram delivery client serializes inline reply markup', async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchImpl: TelegramFetch = async (url, options) => {
    requests.push({
      url,
      body: JSON.parse(String(options?.body ?? '{}')) as Record<string, unknown>,
    });
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          ok: true,
          result: {
            message_id: 42,
            chat: {
              id: 4242,
            },
          },
        };
      },
      async text() {
        return 'ok';
      },
    };
  };
  const client = createTelegramBotApiDeliveryClient({
    botToken: '123:token',
    fetchImpl,
    apiBaseUrl: 'https://telegram.test',
  });

  const result = await client.deliver({
    operation: 'send',
    chatId: '4242',
    text: 'This looks like Work.',
    replyMarkup: {
      inline_keyboard: [
        [
          {
            text: 'Turn into Work',
            callback_data: `ipi:v1:${SOURCE_MESSAGE_ID}:w:confirm`,
          },
        ],
      ],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(requests[0]?.url, 'https://telegram.test/bot123:token/sendMessage');
  assert.deepEqual(requests[0]?.body.reply_markup, {
    inline_keyboard: [
      [
        {
          text: 'Turn into Work',
          callback_data: `ipi:v1:${SOURCE_MESSAGE_ID}:w:confirm`,
        },
      ],
    ],
  });
});

test('Telegram delivery client answers implicit intent callback queries', async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchImpl: TelegramFetch = async (url, options) => {
    requests.push({
      url,
      body: JSON.parse(String(options?.body ?? '{}')) as Record<string, unknown>,
    });
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          ok: true,
          result: true,
        };
      },
      async text() {
        return 'ok';
      },
    };
  };
  const client = createTelegramBotApiDeliveryClient({
    botToken: '123:token',
    fetchImpl,
    apiBaseUrl: 'https://telegram.test',
  });

  const result = await client.deliver({
    operation: 'answer_callback',
    chatId: '4242',
    callbackQueryId: 'callback-1',
  });

  assert.equal(result.ok, true);
  assert.equal(requests[0]?.url, 'https://telegram.test/bot123:token/answerCallbackQuery');
  assert.deepEqual(requests[0]?.body, {
    callback_query_id: 'callback-1',
    show_alert: false,
  });
});

test('Telegram callback query picking uses the callback sender, not the bot message sender', () => {
  const picked = pickTelegramMessage({
    update_id: 99,
    callback_query: {
      id: 'callback-1',
      data: `ipi:v1:${SOURCE_MESSAGE_ID}:w:confirm`,
      from: {
        id: 123,
        is_bot: false,
        first_name: 'Kenneth',
        language_code: 'zh-Hant',
      },
      message: {
        message_id: 42,
        text: 'This looks like Work.',
        chat: {
          id: 4242,
          type: 'private',
        },
        from: {
          id: 777,
          is_bot: true,
          first_name: 'CatsBot',
        },
      },
    },
  });

  assert.equal(picked.isCallbackQuery, true);
  assert.equal(picked.message?.message_id, 42);
  assert.equal(picked.sender?.first_name, 'Kenneth');
  assert.equal(picked.sender?.is_bot, false);
});
