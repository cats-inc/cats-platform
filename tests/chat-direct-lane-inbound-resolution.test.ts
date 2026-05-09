import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreConversation,
  upsertCoreTransportBinding,
} from '../src/core/model/index.js';
import {
  isDirectLaneReadyForInboundDispatch,
  resolveDirectLaneInboundContextForChannel,
} from '../src/products/chat/state/runtime-dispatch/transportBindingResolution.js';
import { buildDirectLaneTransportBindingId } from '../src/shared/chatCoreIds.js';

const CHANNEL_ID = 'channel-direct-1';
const CONVERSATION_ID = 'conversation-channel-direct-1';

function seedDirectLaneBinding(
  coreInput: ReturnType<typeof createDefaultCoreState>,
  options: {
    conversationId?: string | null;
    conversationKind?: 'direct_message' | 'chat_channel';
    bindingStatus?: 'active' | 'disabled' | 'archived';
  } = {},
): ReturnType<typeof createDefaultCoreState> {
  let core = coreInput;
  const conversationId = options.conversationId === undefined
    ? CONVERSATION_ID
    : options.conversationId;
  if (conversationId !== null) {
    core = upsertCoreConversation(
      core,
      {
        id: conversationId,
        title: conversationId,
        kind: options.conversationKind ?? 'direct_message',
      },
      new Date('2026-04-14T22:00:00.000Z'),
    ).core;
  }
  core = upsertCoreTransportBinding(
    core,
    {
      id: buildDirectLaneTransportBindingId(CHANNEL_ID),
      platform: 'internal',
      direction: 'bidirectional',
      conversationId,
      status: options.bindingStatus ?? 'active',
      metadata: { channelId: CHANNEL_ID, channelKind: 'direct_message' },
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  return core;
}

test('resolveDirectLaneInboundContextForChannel reports ready when binding + conversation are healthy', () => {
  const core = seedDirectLaneBinding(createDefaultCoreState());

  const context = resolveDirectLaneInboundContextForChannel(core, CHANNEL_ID);
  assert.equal(context.status, 'resolved');
  assert.equal(context.ready, true);
  assert.equal(context.conversationId, CONVERSATION_ID);
  assert.equal(
    context.transportBindingId,
    buildDirectLaneTransportBindingId(CHANNEL_ID),
  );
  assert.equal(context.reason, null);

  assert.equal(isDirectLaneReadyForInboundDispatch(core, CHANNEL_ID), true);
});

test('resolveDirectLaneInboundContextForChannel reports binding_not_found before any binding has been written', () => {
  const core = createDefaultCoreState();

  const context = resolveDirectLaneInboundContextForChannel(core, CHANNEL_ID);
  assert.equal(context.status, 'binding_not_found');
  assert.equal(context.ready, false);
  assert.equal(context.conversationId, null);
  assert.notEqual(context.reason, null);
  assert.equal(isDirectLaneReadyForInboundDispatch(core, CHANNEL_ID), false);
});

test('resolveDirectLaneInboundContextForChannel surfaces no_conversation_linked when conversationId is null', () => {
  const core = seedDirectLaneBinding(createDefaultCoreState(), { conversationId: null });

  const context = resolveDirectLaneInboundContextForChannel(core, CHANNEL_ID);
  assert.equal(context.status, 'no_conversation_linked');
  assert.equal(context.ready, false);
  assert.equal(context.conversationId, null);
});

test('resolveDirectLaneInboundContextForChannel surfaces conversation_not_direct_lane for misrouted bindings', () => {
  const core = seedDirectLaneBinding(createDefaultCoreState(), {
    conversationKind: 'chat_channel',
  });

  const context = resolveDirectLaneInboundContextForChannel(core, CHANNEL_ID);
  assert.equal(context.status, 'conversation_not_direct_lane');
  assert.equal(context.ready, false);
});

test('resolveDirectLaneInboundContextForChannel surfaces binding_disabled / binding_archived without resolving', () => {
  const disabledCore = seedDirectLaneBinding(createDefaultCoreState(), {
    bindingStatus: 'disabled',
  });
  const archivedCore = seedDirectLaneBinding(createDefaultCoreState(), {
    bindingStatus: 'archived',
  });

  assert.equal(
    resolveDirectLaneInboundContextForChannel(disabledCore, CHANNEL_ID).status,
    'binding_disabled',
  );
  assert.equal(
    resolveDirectLaneInboundContextForChannel(archivedCore, CHANNEL_ID).status,
    'binding_archived',
  );
  assert.equal(isDirectLaneReadyForInboundDispatch(disabledCore, CHANNEL_ID), false);
  assert.equal(isDirectLaneReadyForInboundDispatch(archivedCore, CHANNEL_ID), false);
});
