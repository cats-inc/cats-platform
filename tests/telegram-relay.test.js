import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createTelegramConversationMapper,
  TELEGRAM_ROOM_ROUTING_PLACEHOLDER_NOTE,
} from '../dist-server/platform/transports/telegram/mapping.js';
import { createTelegramRelay } from '../dist-server/platform/transports/telegram/relay.js';
import {
  FileBackedTelegramRelayStore,
  InMemoryTelegramRelayStore,
} from '../dist-server/platform/transports/telegram/store.js';

function createContext(overrides = {}) {
  return {
    bossCatId: 'cat-smelly',
    bossCatName: 'Smelly',
    bossCatActorId: 'actor-pal-cat-smelly',
    botBinding: {
      id: 'bot-binding-telegram-global',
      platform: 'telegram',
      botName: 'smelly_bot',
      orchestratorActorId: 'actor-orchestrator-global',
      bossCatActorId: 'actor-pal-cat-smelly',
      status: 'active',
      createdAt: '2026-03-19T00:00:00.000Z',
      updatedAt: '2026-03-19T00:00:00.000Z',
    },
    ...overrides,
  };
}

test('telegram conversation mapper keeps a durable placeholder room-routing seam', () => {
  const store = new InMemoryTelegramRelayStore();
  const mapper = createTelegramConversationMapper(store);

  const mapping = mapper.resolveChatConversation({
    chatId: '12345',
    acceptedAt: '2026-03-19T00:00:00.000Z',
  });

  assert.equal(mapping.created, true);
  assert.equal(mapping.binding.conversationId, 'telegram:12345');
  assert.equal(mapping.binding.transportConversationMode, 'transport_inbox');
  assert.equal(mapping.binding.roomRoutingStatus, 'placeholder');
  assert.equal(mapping.binding.linkedRoomId, null);
  assert.equal(mapping.roomRouting.transportConversationMode, 'transport_inbox');
  assert.equal(mapping.roomRouting.roomRoutingStatus, 'placeholder');
  assert.equal(mapping.roomRouting.note, TELEGRAM_ROOM_ROUTING_PLACEHOLDER_NOTE);
});

test('telegram relay reports unbound when binding does not front the current Boss Cat', () => {
  const relay = createTelegramRelay();

  const status = relay.getStatus(createContext({
    bossCatActorId: 'actor-pal-cat-other',
  }));

  assert.equal(status.status, 'unbound');
  assert.equal(status.botBinding, null);
  assert.equal(status.roomRouting.roomRoutingStatus, 'placeholder');
});

test('telegram relay dedupes exact update ids and keeps the chat-to-conversation seam', () => {
  const store = new InMemoryTelegramRelayStore();
  const relay = createTelegramRelay({
    store,
    now: () => new Date('2026-03-19T00:00:00.000Z'),
  });

  const accepted = relay.receiveUpdate({
    update: {
      update_id: 101,
      message: {
        message_id: 88,
        text: 'hello from telegram',
        chat: { id: 12345, type: 'private' },
      },
    },
    context: createContext(),
  });

  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.mappedConversationId, 'telegram:12345');
  assert.equal(accepted.roomRouting.roomRoutingStatus, 'placeholder');
  assert.equal(store.getBinding('12345')?.conversationId, 'telegram:12345');
  assert.equal(store.getBinding('12345')?.linkedRoomId, null);
  assert.equal(
    store.getBindingByConversationId('telegram:12345')?.telegramChatId,
    '12345',
  );

  const duplicate = relay.receiveUpdate({
    update: {
      update_id: 101,
      message: {
        message_id: 89,
        text: 'duplicate',
        chat: { id: 12345, type: 'private' },
      },
    },
    context: createContext(),
  });

  assert.equal(duplicate.status, 'ignored');
  assert.equal(duplicate.reason, 'duplicate_update');
  assert.equal(duplicate.mappedConversationId, 'telegram:12345');
});

test('telegram relay ignores unsupported updates without polluting dedupe or mappings', () => {
  const store = new InMemoryTelegramRelayStore();
  const relay = createTelegramRelay({
    store,
    now: () => new Date('2026-03-19T00:00:00.000Z'),
  });

  const receipt = relay.receiveUpdate({
    update: {
      update_id: 101,
    },
    context: createContext(),
  });

  assert.equal(receipt.status, 'ignored');
  assert.equal(receipt.reason, 'unsupported_update');
  assert.equal(store.getLastProcessedUpdateId(), null);
  assert.equal(store.listBindings().length, 0);
});

test('telegram relay ignores non-private chats and keeps Boss Cat public-only', () => {
  const store = new InMemoryTelegramRelayStore();
  const relay = createTelegramRelay({
    store,
    now: () => new Date('2026-03-19T00:00:00.000Z'),
  });

  const receipt = relay.receiveUpdate({
    update: {
      update_id: 101,
      message: {
        message_id: 88,
        text: 'hello from a group',
        chat: { id: 12345, type: 'group' },
      },
    },
    context: createContext(),
  });

  assert.equal(receipt.status, 'ignored');
  assert.equal(receipt.reason, 'unsupported_chat_type');
  assert.equal(store.getLastProcessedUpdateId(), null);
  assert.equal(store.listBindings().length, 0);
});

test('telegram relay accepts older unseen update ids and keeps the high-water marker', () => {
  const relay = createTelegramRelay({
    now: () => new Date('2026-03-19T00:00:00.000Z'),
  });
  const context = createContext();

  relay.receiveUpdate({
    update: {
      update_id: 101,
      message: {
        message_id: 88,
        chat: { id: 12345, type: 'private' },
      },
    },
    context,
  });

  const olderButUnseen = relay.receiveUpdate({
    update: {
      update_id: 99,
      message: {
        message_id: 77,
        chat: { id: 67890, type: 'private' },
      },
    },
    context,
  });

  assert.equal(olderButUnseen.status, 'accepted');

  const status = relay.getStatus(context);
  assert.equal(status.lastProcessedUpdateId, 101);
  assert.equal(status.mappedConversationCount, 2);
});

test('telegram relay bounds retained update ids while keeping a high-water status marker', () => {
  const store = new InMemoryTelegramRelayStore(2);
  const relay = createTelegramRelay({
    store,
    now: () => new Date('2026-03-19T00:00:00.000Z'),
  });
  const context = createContext();

  relay.receiveUpdate({
    update: {
      update_id: 101,
      message: {
        message_id: 1,
        chat: { id: 1, type: 'private' },
      },
    },
    context,
  });
  relay.receiveUpdate({
    update: {
      update_id: 102,
      message: {
        message_id: 2,
        chat: { id: 2, type: 'private' },
      },
    },
    context,
  });
  relay.receiveUpdate({
    update: {
      update_id: 103,
      message: {
        message_id: 3,
        chat: { id: 3, type: 'private' },
      },
    },
    context,
  });

  assert.equal(store.hasProcessedUpdate(101), false);
  assert.equal(store.hasProcessedUpdate(102), true);
  assert.equal(store.hasProcessedUpdate(103), true);

  const status = relay.getStatus(context);
  assert.equal(status.lastProcessedUpdateId, 103);
});

test('file-backed telegram relay store restores bindings and dedupe markers after restart', () => {
  const stateDir = mkdtempSync(path.join(tmpdir(), 'cats-telegram-store-'));
  const statePath = path.join(stateDir, 'telegram-relay.json');
  const firstStore = new FileBackedTelegramRelayStore(statePath, 4);

  firstStore.upsertBinding({
    telegramChatId: '12345',
    conversationId: 'telegram:12345',
    transportConversationMode: 'transport_inbox',
    roomRoutingStatus: 'placeholder',
    linkedRoomId: null,
    createdAt: '2026-03-19T00:00:00.000Z',
    updatedAt: '2026-03-19T00:00:00.000Z',
  });
  firstStore.markProcessedUpdate(101);

  const secondStore = new FileBackedTelegramRelayStore(statePath, 4);
  assert.equal(secondStore.getBinding('12345')?.conversationId, 'telegram:12345');
  assert.equal(secondStore.getBinding('12345')?.roomRoutingStatus, 'placeholder');
  assert.equal(
    secondStore.getBindingByConversationId('telegram:12345')?.telegramChatId,
    '12345',
  );
  assert.equal(secondStore.hasProcessedUpdate(101), true);
  assert.equal(secondStore.getLastProcessedUpdateId(), 101);
  assert.deepEqual(readdirSync(stateDir), ['telegram-relay.json']);
});
