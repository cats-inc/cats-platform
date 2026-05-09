import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import {
  createChannel,
  requireChannel,
} from '../src/products/chat/state/model/index.ts';
import { beginChannelMessageDispatch } from '../src/products/chat/state/runtime-dispatch/routing.ts';
import { MemoryChatStore } from '../src/products/chat/state/store.ts';
import type { RuntimeClient } from '../src/platform/runtime/client.ts';
import { buildTelegramBotTransportBindingId } from '../src/shared/chatCoreIds.ts';

function runtimeStub(): RuntimeClient {
  return { async closeSession() {} } as RuntimeClient;
}

function createDirectState() {
  const now = new Date('2026-05-06T08:00:00.000Z');
  const state = createChannel(
    createDefaultChatState(),
    {
      title: '',
      topic: 'Direct lane',
      originSurface: 'chat',
      entryKind: 'direct',
      roomMode: 'direct_message',
      cats: [
        {
          name: 'ConciergeCat',
          provider: 'claude',
          instance: 'native',
          model: 'sonnet',
        },
      ],
    },
    now,
  );
  return { state, channelId: state.selectedChannelId };
}

function createGroupState() {
  const now = new Date('2026-05-06T08:00:00.000Z');
  const state = createChannel(
    createDefaultChatState(),
    {
      title: 'Team room',
      topic: 'Group lane',
      originSurface: 'chat',
      entryKind: 'group',
      roomMode: 'chat_channel',
      cats: [
        {
          name: 'ConciergeCat',
          provider: 'claude',
          instance: 'native',
          model: 'sonnet',
        },
      ],
    },
    now,
  );
  return { state, channelId: state.selectedChannelId };
}

test('beginChannelMessageDispatch proceeds normally when direct-lane binding is healthy (Telegram bot binding id passes through unchecked)', async () => {
  // CRITICAL regression: the gate must NOT rely on
  // `options.transportBindingId`. Telegram bridge feeds this with a
  // BOT binding id (bidirectional, conversationId: null,
  // metadata.channelKind absent) — running that through the
  // direct-lane resolver would falsely reject every Telegram inbound
  // message. The gate uses the channel-derived deterministic id
  // instead and ignores the supplied bot binding id.
  const { state, channelId } = createDirectState();
  // The MemoryChatStore constructor projects chat state into core,
  // including a healthy direct-lane TransportBindingRecord
  // (`createDirectLaneTransportBindings` produces it during
  // syncCoreStateWithChatState). No extra seeding required.
  const store = new MemoryChatStore(state);

  const result = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: 'Inbound from Telegram bridge',
      senderName: 'Owner',
    },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      // Telegram bridge passes a bot binding id; this used to falsely
      // trip the resolver (no_conversation_linked) and short-circuit
      // every Telegram inbound message. After the fix, this id is
      // ignored by the gate.
      transportBindingId: buildTelegramBotTransportBindingId('bot-binding-1'),
    },
  );

  assert.equal(result.userMessage.senderKind, 'user');
  assert.equal(result.userMessage.body, 'Inbound from Telegram bridge');

  const channel = requireChannel(result.state, channelId);
  const rejections = channel.messages.filter((message) =>
    message.metadata.event === 'transport_binding_inbound_rejected');
  assert.equal(rejections.length, 0);
});

test('beginChannelMessageDispatch does not gate non-direct-message channels even with a chatStore', async () => {
  // Group / chat_channel rooms have no direct-lane binding to
  // validate. The gate must not fire for them, regardless of any
  // supplied transportBindingId.
  const { state, channelId } = createGroupState();
  const store = new MemoryChatStore(state);

  const result = await beginChannelMessageDispatch(
    state,
    channelId,
    { body: 'Group chat message', senderName: 'Owner' },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      transportBindingId: 'transport-binding-never-seeded',
    },
  );

  assert.equal(result.userMessage.senderKind, 'user');
  assert.equal(result.userMessage.body, 'Group chat message');
});
