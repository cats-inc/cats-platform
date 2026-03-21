import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createTelegramRelay } from '../dist-server/transports/telegram/relay.js';
import {
  FileBackedTelegramRelayStore,
  InMemoryTelegramRelayStore,
} from '../dist-server/transports/telegram/store.js';

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

test('telegram relay reports unbound when the bot binding does not front the current Boss Cat', () => {
  const relay = createTelegramRelay();

  const status = relay.getStatus(createContext({
    bossCatActorId: 'actor-pal-cat-other',
  }));

  assert.equal(status.status, 'unbound');
  assert.equal(status.botBinding, null);
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
  assert.equal(store.getBinding('12345')?.conversationId, 'telegram:12345');
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

test('telegram relay accepts older unseen update ids while keeping the highest processed marker', () => {
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
    createdAt: '2026-03-19T00:00:00.000Z',
    updatedAt: '2026-03-19T00:00:00.000Z',
  });
  firstStore.markProcessedUpdate(101);

  const secondStore = new FileBackedTelegramRelayStore(statePath, 4);
  assert.equal(secondStore.getBinding('12345')?.conversationId, 'telegram:12345');
  assert.equal(secondStore.getBindingByConversationId('telegram:12345')?.telegramChatId, '12345');
  assert.equal(secondStore.hasProcessedUpdate(101), true);
  assert.equal(secondStore.getLastProcessedUpdateId(), 101);
  assert.deepEqual(readdirSync(stateDir), ['telegram-relay.json']);
});
