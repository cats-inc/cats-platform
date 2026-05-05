import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState } from '../build/server/core/model/index.js';
import { createCatActorId } from '../build/server/core/actors.js';
import { buildTelegramBotTransportBindingId } from '../build/server/shared/chatCoreIds.js';
import { createChatEventHub } from '../build/server/products/chat/api/chatEventHub.js';
import { buildRoomMessageMutationDetail } from '../build/server/products/chat/api/transportEventPublisher.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import {
  appendMessage,
  createCat,
  createChannel,
} from '../build/server/products/chat/state/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { startTransportFanout } from '../build/server/platform/transports/fanout/subscriber.js';
import { createTelegramRelay } from '../build/server/platform/transports/telegram/relay/index.js';

function createDeliveryClient(deliveries) {
  return {
    async deliver(request) {
      deliveries.push(request);
      return {
        ok: true,
        chatId: request.chatId,
        messageId: `telegram-message-${deliveries.length}`,
      };
    },
    async setMyCommands() {
      return { ok: true };
    },
    async deleteMyCommands() {
      return { ok: true };
    },
    async setChatMenuButton() {
      return { ok: true };
    },
  };
}

function createBinding(catId, overrides = {}) {
  return {
    id: 'bot-binding-cat',
    platform: 'telegram',
    botName: 'cat_bot',
    orchestratorActorId: 'actor-orchestrator-global',
    catActorId: createCatActorId(catId),
    bossCatActorId: null,
    botToken: 'bot-token',
    webhookSecret: null,
    inboundMode: 'polling',
    roomMode: 'direct_message',
    status: 'active',
    outboundFanoutEnabled: true,
    createdAt: '2026-04-22T00:00:00.000Z',
    updatedAt: '2026-04-22T00:00:00.000Z',
    ...overrides,
  };
}

async function createFanoutFixture(bindingOverrides = {}, options = {}) {
  const now = new Date('2026-04-22T00:00:00.000Z');
  let chat = createDefaultChatState();
  chat = createCat(
    chat,
    {
      name: 'Companion Cat',
      provider: 'claude',
      roles: ['companion'],
    },
    now,
  );
  const catId = chat.cats[0].id;
  chat = createChannel(
    chat,
    {
      title: 'Companion Cat',
      topic: 'Direct Telegram lane',
      originSurface: 'chat',
      roomMode: 'direct_message',
      defaultRecipientId: catId,
      participantCatIds: [catId],
      skipBossCatGreeting: true,
    },
    now,
  );
  const channelId = chat.selectedChannelId;
  const binding = createBinding(catId, bindingOverrides);
  const core = {
    ...createDefaultCoreState(now),
    botBindings: [binding],
  };
  const chatStore = new MemoryChatStore();
  await chatStore.writeSnapshot(chat, core);

  const deliveries = [];
  const relay = createTelegramRelay({
    now: () => now,
    deliveryClient: createDeliveryClient(deliveries),
  });
  const context = {
    bossCatId: null,
    bossCatName: null,
    bossCatActorId: null,
    botBindings: [binding],
    defaultBotBinding: binding,
    selectedBotBinding: binding,
  };
  const receipt = relay.receiveUpdate({
    update: {
      update_id: 101,
      message: {
        message_id: 88,
        text: 'hello from telegram',
        chat: { id: 12345, type: 'private' },
      },
    },
    context,
  });
  if (options.linkRoom !== false) {
    relay.linkRoom({
      conversationId: receipt.mappedConversationId,
      chatId: receipt.chatId,
      bindingId: binding.id,
      roomId: channelId,
      linkedAt: now.toISOString(),
    });
  }

  const eventHub = createChatEventHub();
  const stop = startTransportFanout({
    eventHub,
    chatStore,
    telegramRelay: relay,
    now: () => now,
  });

  return { binding, channelId, chatStore, deliveries, eventHub, relay, stop };
}

async function flushFanout() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

async function appendAndPublish(fixture, input, options) {
  const current = await fixture.chatStore.read();
  const appended = appendMessage(
    current,
    fixture.channelId,
    input,
    new Date('2026-04-22T00:00:00.000Z'),
    options,
  );
  await fixture.chatStore.write(appended.state);
  fixture.eventHub.emit({
    kind: 'room_updated',
    channelId: fixture.channelId,
    timestamp: '2026-04-22T00:00:00.000Z',
    detail: {
      mutation: 'message_added',
      ...buildRoomMessageMutationDetail(appended.message),
    },
  });
  await flushFanout();
  return appended.message;
}

test('transport fanout mirrors web-originated user messages to linked Telegram bindings', async () => {
  const fixture = await createFanoutFixture();
  try {
    await appendAndPublish(
      fixture,
      {
        senderKind: 'user',
        senderName: 'Kenneth',
        body: 'hello from web',
      },
      { origin: 'web' },
    );

    assert.equal(fixture.deliveries.length, 1);
    assert.equal(fixture.deliveries[0].operation, 'send');
    assert.equal(fixture.deliveries[0].chatId, '12345');
    assert.equal(fixture.deliveries[0].text, '[Kenneth] hello from web');
  } finally {
    fixture.stop();
  }
});

test('transport fanout links a recent unlinked Telegram conversation for first web delivery', async () => {
  const fixture = await createFanoutFixture({}, { linkRoom: false });
  try {
    await appendAndPublish(
      fixture,
      {
        senderKind: 'user',
        senderName: 'Kenneth',
        body: 'hello before telegram room link',
      },
      { origin: 'web' },
    );

    assert.equal(fixture.deliveries.length, 1);
    assert.equal(fixture.deliveries[0].chatId, '12345');
    assert.equal(fixture.deliveries[0].text, '[Kenneth] hello before telegram room link');
    assert.equal(
      fixture.relay.resolveBinding({
        roomId: fixture.channelId,
        bindingId: fixture.binding.id,
      })?.telegramChatId,
      '12345',
    );
  } finally {
    fixture.stop();
  }
});

test('transport fanout skips auto-link when multiple unlinked Telegram conversations are ambiguous', async () => {
  const fixture = await createFanoutFixture({}, { linkRoom: false });
  try {
    const context = {
      bossCatId: null,
      bossCatName: null,
      bossCatActorId: null,
      botBindings: [fixture.binding],
      defaultBotBinding: fixture.binding,
      selectedBotBinding: fixture.binding,
    };
    fixture.relay.receiveUpdate({
      update: {
        update_id: 102,
        message: {
          message_id: 89,
          text: 'hello from stranger',
          chat: { id: 67890, type: 'private' },
        },
      },
      context,
    });

    await appendAndPublish(
      fixture,
      {
        senderKind: 'user',
        senderName: 'Kenneth',
        body: 'should not leak to stranger',
      },
      { origin: 'web' },
    );

    assert.equal(fixture.deliveries.length, 0);
    assert.equal(
      fixture.relay.resolveBinding({
        roomId: fixture.channelId,
        bindingId: fixture.binding.id,
      }),
      null,
    );
  } finally {
    fixture.stop();
  }
});

test('transport fanout skips the Telegram source binding for ingress-originated turns', async () => {
  const fixture = await createFanoutFixture();
  try {
    await appendAndPublish(
      fixture,
      {
        senderKind: 'user',
        senderName: 'Telegram User',
        body: 'hello from telegram',
      },
      {
        origin: 'telegram',
        sourceTransportBindingId: buildTelegramBotTransportBindingId(fixture.binding.id),
      },
    );
    await appendAndPublish(
      fixture,
      {
        senderKind: 'agent',
        senderName: 'Companion Cat',
        body: 'reply to telegram',
      },
      {
        origin: 'runtime',
        sourceTransportBindingId: buildTelegramBotTransportBindingId(fixture.binding.id),
      },
    );

    assert.equal(fixture.deliveries.length, 0);
  } finally {
    fixture.stop();
  }
});

test('transport fanout respects disabled outbound fanout bindings', async () => {
  const fixture = await createFanoutFixture({ outboundFanoutEnabled: false });
  try {
    await appendAndPublish(
      fixture,
      {
        senderKind: 'user',
        senderName: 'Kenneth',
        body: 'this should not fan out',
      },
      { origin: 'web' },
    );

    assert.equal(fixture.deliveries.length, 0);
  } finally {
    fixture.stop();
  }
});
