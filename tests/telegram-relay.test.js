import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
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
  const defaultBotBinding = {
    id: 'bot-binding-telegram-global',
    platform: 'telegram',
    botName: 'smelly_bot',
    orchestratorActorId: 'actor-orchestrator-global',
    catActorId: 'actor-cat-cat-smelly',
    bossCatActorId: 'actor-cat-cat-smelly',
    roomMode: 'boss_chat',
    status: 'active',
    createdAt: '2026-03-19T00:00:00.000Z',
    updatedAt: '2026-03-19T00:00:00.000Z',
  };

  return {
    bossCatId: 'cat-smelly',
    bossCatName: 'Smelly',
    bossCatActorId: 'actor-cat-cat-smelly',
    botBindings: [defaultBotBinding],
    defaultBotBinding,
    selectedBotBinding: null,
    ...overrides,
  };
}

test('telegram conversation mapper keeps a durable placeholder room-routing seam', () => {
  const store = new InMemoryTelegramRelayStore();
  const mapper = createTelegramConversationMapper(store);

  const mapping = mapper.resolveChatConversation({
    chatId: '12345',
    acceptedAt: '2026-03-19T00:00:00.000Z',
    chatType: 'private',
    chatTitle: null,
    chatUsername: null,
    messageId: null,
    messageSummary: null,
  });

  assert.equal(mapping.created, true);
  assert.equal(mapping.binding.conversationId, 'telegram:12345');
  assert.equal(mapping.binding.transportConversationMode, 'transport_inbox');
  assert.equal(mapping.binding.roomRoutingStatus, 'placeholder');
  assert.equal(mapping.binding.linkedRoomId, null);
  assert.equal(mapping.binding.telegramChatType, 'private');
  assert.equal(mapping.binding.lastInboundMessageId, null);
  assert.deepEqual(mapping.binding.lastInboundAttachmentKinds, []);
  assert.equal(mapping.roomRouting.transportConversationMode, 'transport_inbox');
  assert.equal(mapping.roomRouting.roomRoutingStatus, 'placeholder');
  assert.equal(mapping.roomRouting.note, TELEGRAM_ROOM_ROUTING_PLACEHOLDER_NOTE);
});

test('telegram relay stays bound when a non-Boss Cat binding is the current ingress default', () => {
  const relay = createTelegramRelay();

  const status = relay.getStatus(createContext({
    bossCatActorId: 'actor-cat-cat-other',
  }));

  assert.equal(status.status, 'bound');
  assert.equal(status.botBinding?.botName, 'smelly_bot');
  assert.equal(status.availableBindings.length, 1);
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
  assert.equal(accepted.messageSummary?.textPreview, 'hello from telegram');
  assert.equal(accepted.messageSummary?.attachmentCount, 0);
  assert.equal(store.getBinding('12345')?.conversationId, 'telegram:12345');
  assert.equal(store.getBinding('12345')?.linkedRoomId, null);
  assert.equal(store.getBinding('12345')?.lastInboundMessageId, '88');
  assert.equal(store.getBinding('12345')?.lastInboundTextPreview, 'hello from telegram');
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

test('telegram relay can persist a linked room for the active transport inbox', () => {
  const store = new InMemoryTelegramRelayStore();
  const relay = createTelegramRelay({
    store,
    now: () => new Date('2026-03-19T00:00:00.000Z'),
  });
  const context = createContext();

  relay.receiveUpdate({
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

  const binding = relay.linkRoom({
    conversationId: 'telegram:12345',
    roomId: 'room-123',
  });

  assert.equal(binding?.linkedRoomId, 'room-123');
  assert.equal(binding?.roomRoutingStatus, 'linked_room');

  const status = relay.getStatus(context);
  assert.equal(status.roomRouting.roomRoutingStatus, 'linked_room');
  assert.equal(status.roomRouting.linkedRoomId, 'room-123');

  const diagnostics = relay.getDiagnostics(context);
  assert.equal(diagnostics.bindings[0].linkedRoomId, 'room-123');
});

test('telegram relay scopes conversation ids by the selected non-default binding', () => {
  const store = new InMemoryTelegramRelayStore();
  const relay = createTelegramRelay({
    store,
    now: () => new Date('2026-03-19T00:00:00.000Z'),
  });
  const companionBinding = {
    id: 'bot-binding-companion',
    platform: 'telegram',
    botName: 'companion_bot',
    orchestratorActorId: 'actor-orchestrator-global',
    catActorId: 'actor-cat-cat-companion',
    bossCatActorId: null,
    botToken: 'token-companion',
    webhookSecret: 'secret-companion',
    roomMode: 'direct_cat_chat',
    status: 'active',
    createdAt: '2026-03-19T00:00:00.000Z',
    updatedAt: '2026-03-19T00:00:00.000Z',
  };
  const context = createContext({
    botBindings: [createContext().defaultBotBinding, companionBinding],
    selectedBotBinding: companionBinding,
  });

  const receipt = relay.receiveUpdate({
    update: {
      update_id: 101,
      message: {
        message_id: 88,
        text: 'hello companion bot',
        chat: { id: 12345, type: 'private' },
      },
    },
    context,
  });

  assert.equal(receipt.status, 'accepted');
  assert.equal(receipt.bindingId, 'bot-binding-companion');
  assert.equal(receipt.mappedConversationId, 'telegram:bot-binding-companion:12345');
  assert.equal(
    store.getBinding('12345', 'bot-binding-companion')?.conversationId,
    'telegram:bot-binding-companion:12345',
  );
  assert.equal(store.getBinding('12345'), null);
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

test('telegram relay ignores bot-authored messages to preserve the single Boss Cat public identity', () => {
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
        text: 'echo from bot',
        chat: { id: 12345, type: 'private' },
        from: { id: 999, is_bot: true, username: 'smelly_bot' },
      },
    },
    context: createContext(),
  });

  assert.equal(receipt.status, 'ignored');
  assert.equal(receipt.reason, 'message_from_bot');
  assert.equal(store.listBindings().length, 0);
  assert.equal(store.getIngressStats().ignoredCount, 1);
});

test('telegram relay normalizes attachment-rich inbound messages into transport summaries', () => {
  const store = new InMemoryTelegramRelayStore();
  const relay = createTelegramRelay({
    store,
    now: () => new Date('2026-03-19T00:00:00.000Z'),
  });

  const receipt = relay.receiveUpdate({
    update: {
      update_id: 101,
      edited_message: {
        message_id: 88,
        caption: 'photo update',
        chat: { id: 12345, type: 'private', username: 'boss_inbox' },
        from: { id: 1, first_name: 'Boss', username: 'boss' },
        reply_to_message: { message_id: 55 },
        photo: [
          { file_id: 'small-photo', width: 90, height: 90 },
          { file_id: 'large-photo', width: 1080, height: 1080 },
        ],
        document: {
          file_id: 'doc-1',
          file_name: 'brief.pdf',
          mime_type: 'application/pdf',
        },
      },
    },
    context: createContext(),
  });

  assert.equal(receipt.status, 'accepted');
  assert.equal(receipt.messageSummary?.isEdited, true);
  assert.equal(receipt.messageSummary?.textPreview, 'photo update');
  assert.equal(receipt.messageSummary?.attachmentCount, 2);
  assert.deepEqual(receipt.messageSummary?.attachmentKinds, ['photo', 'document']);
  assert.equal(receipt.messageSummary?.replyToMessageId, '55');

  const binding = store.getBinding('12345');
  assert.equal(binding?.telegramChatUsername, 'boss_inbox');
  assert.equal(binding?.lastInboundTextPreview, 'photo update');
  assert.deepEqual(binding?.lastInboundAttachmentKinds, ['photo', 'document']);
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

test('file-backed telegram relay store ignores incomplete persisted relay state', () => {
  const stateDir = mkdtempSync(path.join(tmpdir(), 'cats-telegram-store-invalid-'));
  const statePath = path.join(stateDir, 'telegram-relay.json');

  writeFileSync(statePath, JSON.stringify({
    version: 1,
    bindings: [
      {
        telegramChatId: '12345',
        conversationId: 'telegram:12345',
        createdAt: '2026-03-19T00:00:00.000Z',
        updatedAt: '2026-03-19T00:00:00.000Z',
      },
    ],
    processedUpdateIds: [101],
    lastProcessedUpdateId: 101,
  }, null, 2));

  const store = new FileBackedTelegramRelayStore(statePath, 4);
  assert.equal(store.getBinding('12345'), null);
  assert.equal(store.getLastProcessedUpdateId(), 101);
});

test('telegram relay exposes outbound delivery diagnostics and updates bindings after successful sends', async () => {
  const store = new InMemoryTelegramRelayStore();
  const calls = [];
  const relay = createTelegramRelay({
    store,
    now: () => new Date('2026-03-19T00:00:00.000Z'),
    deliveryClient: {
      async deliver(request) {
        calls.push(request);
        return {
          ok: true,
          chatId: request.chatId,
          messageId: request.operation === 'delete'
            ? request.messageId ?? null
            : request.operation === 'edit'
              ? request.messageId ?? null
              : request.operation === 'reply'
                ? '5002'
                : '5001',
        };
      },
    },
  });
  const context = createContext();

  const sendReceipt = await relay.deliver({
    request: {
      operation: 'send',
      chatId: '12345',
      text: 'Boss Cat says hello',
    },
    context,
  });
  const replyReceipt = await relay.deliver({
    request: {
      operation: 'reply',
      conversationId: 'telegram:12345',
      replyToMessageId: '88',
      text: 'reply from Boss Cat',
    },
    context,
  });
  const editReceipt = await relay.deliver({
    request: {
      operation: 'edit',
      conversationId: 'telegram:12345',
      messageId: '5002',
      text: 'edited reply from Boss Cat',
    },
    context,
  });
  const deleteReceipt = await relay.deliver({
    request: {
      operation: 'delete',
      conversationId: 'telegram:12345',
      messageId: '5002',
    },
    context,
  });

  assert.equal(sendReceipt.status, 'sent');
  assert.equal(replyReceipt.status, 'sent');
  assert.equal(editReceipt.status, 'edited');
  assert.equal(deleteReceipt.status, 'deleted');
  assert.equal(store.getBinding('12345')?.lastOutboundMessageId, '5002');
  assert.equal(calls.length, 4);
  assert.equal(calls[1].chatId, '12345');

  const diagnostics = relay.getDiagnostics(context);
  assert.equal(diagnostics.delivery.status, 'configured');
  assert.equal(diagnostics.delivery.sentCount, 1);
  assert.equal(diagnostics.delivery.repliedCount, 1);
  assert.equal(diagnostics.delivery.editedCount, 1);
  assert.equal(diagnostics.delivery.deletedCount, 1);
  assert.equal(diagnostics.delivery.failedCount, 0);
  assert.equal(diagnostics.bindings[0].conversationId, 'telegram:12345');
});

test('telegram relay selects delivery clients per active binding when scoped bindings are used', async () => {
  const store = new InMemoryTelegramRelayStore();
  const calls = [];
  const companionBinding = {
    id: 'bot-binding-companion',
    platform: 'telegram',
    botName: 'companion_bot',
    orchestratorActorId: 'actor-orchestrator-global',
    catActorId: 'actor-cat-cat-companion',
    bossCatActorId: null,
    botToken: 'token-companion',
    webhookSecret: 'secret-companion',
    roomMode: 'direct_cat_chat',
    status: 'active',
    createdAt: '2026-03-19T00:00:00.000Z',
    updatedAt: '2026-03-19T00:00:00.000Z',
  };
  const relay = createTelegramRelay({
    store,
    now: () => new Date('2026-03-19T00:00:00.000Z'),
    resolveDeliveryClient(binding) {
      if (!binding) {
        return null;
      }
      return {
        async deliver(request) {
          calls.push({ bindingId: binding.id, request });
          return {
            ok: true,
            chatId: request.chatId,
            messageId: '5001',
          };
        },
      };
    },
  });
  const context = createContext({
    botBindings: [createContext().defaultBotBinding, companionBinding],
    selectedBotBinding: companionBinding,
  });

  const receipt = await relay.deliver({
    request: {
      operation: 'send',
      chatId: '12345',
      text: 'hello from companion bot',
    },
    context,
  });

  assert.equal(receipt.status, 'sent');
  assert.equal(receipt.bindingId, 'bot-binding-companion');
  assert.equal(receipt.conversationId, 'telegram:bot-binding-companion:12345');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].bindingId, 'bot-binding-companion');
});

test('file-backed telegram relay store restores ingress and delivery diagnostics after restart', () => {
  const stateDir = mkdtempSync(path.join(tmpdir(), 'cats-telegram-store-diagnostics-'));
  const statePath = path.join(stateDir, 'telegram-relay.json');
  const store = new FileBackedTelegramRelayStore(statePath, 4);

  store.recordIngressReceipt({
    platform: 'telegram',
    status: 'accepted',
    acceptedAt: '2026-03-19T00:00:00.000Z',
    updateId: 101,
    chatId: '12345',
    messageId: '88',
    bossCatId: 'cat-smelly',
    bossCatName: 'Smelly',
    mappedConversationId: 'telegram:12345',
    messageSummary: {
      isEdited: false,
      senderId: '1',
      senderDisplayName: 'Boss',
      senderUsername: 'boss',
      textPreview: 'hello',
      attachmentCount: 0,
      attachmentKinds: [],
      replyToMessageId: null,
    },
    roomRouting: {
      transportConversationMode: 'transport_inbox',
      roomRoutingStatus: 'placeholder',
      linkedRoomId: null,
      note: TELEGRAM_ROOM_ROUTING_PLACEHOLDER_NOTE,
    },
  });
  store.recordDeliveryReceipt({
    platform: 'telegram',
    operation: 'send',
    status: 'sent',
    deliveredAt: '2026-03-19T00:00:01.000Z',
    deliveryId: 'delivery-1',
    chatId: '12345',
    conversationId: 'telegram:12345',
    messageId: '89',
    replyToMessageId: null,
    bossCatId: 'cat-smelly',
    bossCatName: 'Smelly',
    textPreview: 'hello back',
    errorMessage: null,
  });

  const restored = new FileBackedTelegramRelayStore(statePath, 4);
  assert.equal(restored.getIngressStats().acceptedCount, 1);
  assert.equal(restored.getIngressStats().lastReceipt?.messageSummary?.textPreview, 'hello');
  assert.equal(restored.getDeliveryStats().sentCount, 1);
  assert.equal(restored.getDeliveryStats().lastReceipt?.messageId, '89');
});
