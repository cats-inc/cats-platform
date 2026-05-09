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

test('beginChannelMessageDispatch short-circuits when supplied transportBindingId does not exist in core', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);

  const result = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: 'Hello from a transport whose binding has not been written',
      senderName: 'Owner',
    },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      transportBindingId: 'transport-binding-never-seeded',
    },
  );

  assert.equal(result.results.length, 0);
  assert.equal(result.preparedTurn, null);
  assert.equal(result.userMessage.senderKind, 'system');
  assert.equal(
    result.userMessage.metadata.event,
    'transport_binding_inbound_rejected',
  );
  assert.equal(
    result.userMessage.metadata.transportBindingId,
    'transport-binding-never-seeded',
  );
  assert.equal(result.userMessage.metadata.status, 'binding_not_found');

  // The diagnostic was persisted to the channel transcript and no
  // user-authored message ever entered the channel.
  const channel = requireChannel(result.state, channelId);
  const userMessages = channel.messages.filter((message) => message.senderKind === 'user');
  assert.equal(userMessages.length, 0);
  const diagnosticMessages = channel.messages.filter((message) =>
    message.metadata.event === 'transport_binding_inbound_rejected');
  assert.equal(diagnosticMessages.length, 1);
});

test('beginChannelMessageDispatch short-circuits when transportBindingId points at a deleted conversation', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  // Seed a transport binding whose conversationId points at nothing,
  // mirroring the canonical direct-lane projection metadata signal.
  await store.updateCore((core) => ({
    ...core,
    transportBindings: [
      ...core.transportBindings,
      {
        id: 'binding-stale',
        platform: 'internal',
        direction: 'bidirectional',
        conversationId: 'conversation-deleted',
        participantId: null,
        agentId: null,
        externalThreadKey: null,
        status: 'active',
        createdAt: '2026-05-06T07:59:00.000Z',
        updatedAt: '2026-05-06T07:59:00.000Z',
        metadata: { channelId: 'channel-stale', channelKind: 'direct_message' },
      },
    ],
  }));

  const result = await beginChannelMessageDispatch(
    state,
    channelId,
    { body: 'Inbound message', senderName: 'Owner' },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      transportBindingId: 'binding-stale',
    },
  );

  assert.equal(result.results.length, 0);
  assert.equal(result.preparedTurn, null);
  assert.equal(
    result.userMessage.metadata.event,
    'transport_binding_inbound_rejected',
  );
  assert.equal(
    result.userMessage.metadata.status,
    'no_conversation_linked',
  );
});

test('beginChannelMessageDispatch proceeds normally when no transportBindingId is supplied', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);

  const result = await beginChannelMessageDispatch(
    state,
    channelId,
    { body: 'Plain owner message', senderName: 'Owner' },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
    },
  );

  // Without an inbound binding to gate, dispatch goes through the
  // normal path and produces a real user message.
  assert.equal(result.userMessage.senderKind, 'user');
  assert.equal(result.userMessage.body, 'Plain owner message');
});
