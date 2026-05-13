import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTelegramCatProductIntentProposalCallbackData,
  buildTelegramCatProductIntentProposalChoiceResponse,
  buildTelegramCatProductIntentProposalReplyMarkup,
  buildTelegramImplicitProductIntentCallbackData,
  buildTelegramImplicitProductIntentChoiceResponse,
  buildTelegramImplicitProductIntentReplyMarkup,
  buildTelegramProductIntentReplyMarkup,
  buildTelegramWorkIntakeProposalCallbackData,
  buildTelegramWorkIntakeProposalChoiceResponse,
  buildTelegramWorkIntakeProposalReplyMarkup,
  parseTelegramCatProductIntentProposalCallbackData,
  parseTelegramImplicitProductIntentCallbackData,
  parseTelegramWorkIntakeProposalCallbackData,
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

function createCatProposalMessage() {
  return {
    id: 'proposal-message',
    senderKind: 'system',
    senderName: 'Cats',
    body: 'Plan onboarding requirements',
    choices: [
      {
        question: '要把這則訊息轉成 Work intake 嗎？',
        options: [
          {
            id: 'confirm_work',
            label: '轉成 Work',
          },
          {
            id: 'decline',
            label: '保留為 chat',
          },
        ],
      },
    ],
    metadata: {
      catProductIntentProposal: {
        version: 2,
        proposalId: `cat-product-intent:v2:${SOURCE_MESSAGE_ID}:cat-strong:work`,
        event: 'proposed',
        source: {
          messageId: SOURCE_MESSAGE_ID,
          channelId: 'channel-1',
          conversationId: 'conversation-1',
          transport: 'telegram',
        },
        proposedBy: {
          catId: 'cat-strong',
          actorId: 'actor-cat-strong',
          capabilityProfileKind: 'strong_agent',
        },
        proposal: {
          targetProduct: 'work',
          summary: 'Plan onboarding requirements',
          rationale: 'The owner is asking for planning.',
        },
        createdAt: '2026-05-06T08:00:00.000Z',
        expiresAt: '2026-05-06T08:15:00.000Z',
      },
    },
  };
}

function createWorkIntakeProposalMessage() {
  return {
    id: 'work-intake-message',
    senderKind: 'system',
    senderName: 'Cats Work',
    body: 'Proposed Work Items:\n1. Draft onboarding checklist',
    choices: [
      {
        question: 'Capture these Work Items?',
        options: [
          {
            id: 'capture_work_items',
            label: 'Capture Work Items',
          },
          {
            id: 'decline',
            label: 'Ignore',
          },
        ],
      },
    ],
    metadata: {
      event: 'work_intake_proposal_created',
      sourceMessageId: SOURCE_MESSAGE_ID,
      workIntakeProposal: {
        schemaVersion: 1,
        phase: 'intake',
        toolName: 'work.item.propose_split',
        proposalId: `work-intake-proposal:${SOURCE_MESSAGE_ID}:decision-1`,
        decisionId: 'decision-1',
        sourceMessageId: SOURCE_MESSAGE_ID,
        source: {
          surface: 'telegram',
          transportBindingId: 'telegram-binding-1',
        },
        contextRefs: [],
        candidates: [
          {
            tempId: 'item-1',
            title: 'Draft onboarding checklist',
            summary: 'Prepare onboarding todos.',
            kind: 'todo',
            priority: 'normal',
            confidence: 'high',
            suggestedProjectTitle: null,
            openQuestions: [],
          },
        ],
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

test('Telegram Cat product intent proposal reply markup uses v2 callback data', () => {
  const markup = buildTelegramCatProductIntentProposalReplyMarkup(createCatProposalMessage());

  assert.deepEqual(markup, {
    inline_keyboard: [
      [
        {
          text: '轉成 Work',
          callback_data: 'cpi:v2:proposal-message:w:confirm',
        },
        {
          text: '保留為 chat',
          callback_data: 'cpi:v2:proposal-message:w:decline',
        },
      ],
    ],
  });
  assert.deepEqual(buildTelegramProductIntentReplyMarkup(createCatProposalMessage()), markup);
  assert.ok((markup?.inline_keyboard[0]?.[0]?.callback_data.length ?? 0) <= 64);
  assert.equal(
    parseTelegramCatProductIntentProposalCallbackData(
      buildTelegramCatProductIntentProposalCallbackData({
        sourceMessageId: 'proposal-message',
        targetProduct: 'work',
        action: 'confirm',
      }),
    )?.sourceMessageId,
    'proposal-message',
  );
  assert.equal(
    parseTelegramCatProductIntentProposalCallbackData('/work nope'),
    null,
  );
});

test('Telegram Work intake proposal reply markup uses proposal-message callback data', () => {
  const markup = buildTelegramWorkIntakeProposalReplyMarkup(createWorkIntakeProposalMessage());

  assert.deepEqual(markup, {
    inline_keyboard: [
      [
        {
          text: 'Capture Work Items',
          callback_data: 'wip:v1:work-intake-message:capture',
        },
        {
          text: 'Ignore',
          callback_data: 'wip:v1:work-intake-message:decline',
        },
      ],
    ],
  });
  assert.deepEqual(buildTelegramProductIntentReplyMarkup(createWorkIntakeProposalMessage()), markup);
  assert.ok((markup?.inline_keyboard[0]?.[0]?.callback_data.length ?? 0) <= 64);
  assert.equal(
    parseTelegramWorkIntakeProposalCallbackData(
      buildTelegramWorkIntakeProposalCallbackData({
        sourceMessageId: 'work-intake-message',
        action: 'capture',
      }),
    )?.sourceMessageId,
    'work-intake-message',
  );
  assert.equal(
    parseTelegramWorkIntakeProposalCallbackData(
      buildTelegramWorkIntakeProposalCallbackData({
        sourceMessageId: 'work-intake-message',
        action: 'capture',
      }),
    )?.action,
    'capture',
  );
  assert.equal(
    parseTelegramWorkIntakeProposalCallbackData('/work nope'),
    null,
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

test('Telegram Cat product intent proposal choice response keeps proposal source message id', () => {
  const response = buildTelegramCatProductIntentProposalChoiceResponse({
    message: createCatProposalMessage(),
    action: 'confirm',
    submittedAt: '2026-05-06T08:03:00.000Z',
  });

  assert.equal(response?.body, '轉成 Work');
  assert.equal(response?.choiceResponse.sourceMessageId, 'proposal-message');
  assert.equal(response?.choiceResponse.answers[0]?.question, '要把這則訊息轉成 Work intake 嗎？');
  assert.deepEqual(response?.choiceResponse.answers[0]?.selectedOptionIds, ['confirm_work']);
});

test('Telegram Work intake proposal choice response submits capture option', () => {
  const response = buildTelegramWorkIntakeProposalChoiceResponse({
    message: createWorkIntakeProposalMessage(),
    action: 'capture',
    submittedAt: '2026-05-06T08:03:00.000Z',
  });

  assert.equal(response?.body, 'Capture Work Items');
  assert.equal(response?.choiceResponse.sourceMessageId, 'work-intake-message');
  assert.equal(response?.choiceResponse.answers[0]?.question, 'Capture these Work Items?');
  assert.deepEqual(response?.choiceResponse.answers[0]?.selectedOptionIds, [
    'capture_work_items',
  ]);
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
