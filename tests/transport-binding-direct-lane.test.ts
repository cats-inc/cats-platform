import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreConversation,
  upsertCoreTransportBinding,
} from '../src/core/model/index.js';
import {
  isDirectLaneConversationKind,
  resolveTransportBindingDirectLane,
  resolveTransportTurnContextHint,
} from '../src/core/transportBindingDirectLane.js';

function seedConversation(
  coreInput: ReturnType<typeof createDefaultCoreState>,
  id: string,
  kind: 'direct_message' | 'chat_channel' | 'work_thread' | 'code_thread' = 'direct_message',
): ReturnType<typeof createDefaultCoreState> {
  return upsertCoreConversation(
    coreInput,
    {
      id,
      title: id,
      kind,
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
}

test('resolveTransportBindingDirectLane returns binding_not_found for unknown ids', () => {
  const core = createDefaultCoreState();
  const resolution = resolveTransportBindingDirectLane(core, 'binding-missing');
  assert.equal(resolution.status, 'binding_not_found');
  assert.equal(resolution.binding, null);
  assert.equal(resolution.conversation, null);
});

test('resolveTransportBindingDirectLane resolves an active binding to its direct conversation', () => {
  let core = createDefaultCoreState();
  core = seedConversation(core, 'conversation-direct-1', 'direct_message');
  core = upsertCoreTransportBinding(
    core,
    {
      id: 'binding-telegram-1',
      platform: 'telegram',
      direction: 'inbound',
      conversationId: 'conversation-direct-1',
      status: 'active',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;

  const resolution = resolveTransportBindingDirectLane(core, 'binding-telegram-1');
  assert.equal(resolution.status, 'resolved');
  assert.equal(resolution.binding?.id, 'binding-telegram-1');
  assert.equal(resolution.conversation?.id, 'conversation-direct-1');
  assert.equal(resolution.conversationKind, 'direct_message');

  const hint = resolveTransportTurnContextHint(core, 'binding-telegram-1');
  assert.deepEqual(hint, {
    conversationId: 'conversation-direct-1',
    transportBindingId: 'binding-telegram-1',
    conversationKind: 'direct_message',
  });
});

test('resolveTransportBindingDirectLane reports no_conversation_linked when conversationId is null', () => {
  let core = createDefaultCoreState();
  core = upsertCoreTransportBinding(
    core,
    {
      id: 'binding-fresh',
      platform: 'telegram',
      direction: 'inbound',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;

  const resolution = resolveTransportBindingDirectLane(core, 'binding-fresh');
  assert.equal(resolution.status, 'no_conversation_linked');
  assert.ok(resolution.binding);
  assert.equal(resolution.conversation, null);
  assert.equal(resolveTransportTurnContextHint(core, 'binding-fresh'), null);
});

test('resolveTransportBindingDirectLane reports no_conversation_linked when conversation is missing from core', () => {
  let core = createDefaultCoreState();
  core = upsertCoreTransportBinding(
    core,
    {
      id: 'binding-stale',
      platform: 'telegram',
      direction: 'inbound',
      conversationId: 'conversation-deleted',
      status: 'active',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  // Note: the conversation referenced by the binding was never seeded.

  const resolution = resolveTransportBindingDirectLane(core, 'binding-stale');
  assert.equal(resolution.status, 'no_conversation_linked');
  assert.equal(resolution.conversationId, 'conversation-deleted');
  assert.equal(resolution.conversation, null);
});

test('resolveTransportBindingDirectLane reports conversation_not_direct_lane for non-direct conversations', () => {
  let core = createDefaultCoreState();
  core = seedConversation(core, 'conversation-channel-1', 'chat_channel');
  core = upsertCoreTransportBinding(
    core,
    {
      id: 'binding-misrouted',
      platform: 'telegram',
      conversationId: 'conversation-channel-1',
      status: 'active',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;

  const resolution = resolveTransportBindingDirectLane(core, 'binding-misrouted');
  assert.equal(resolution.status, 'conversation_not_direct_lane');
  assert.equal(resolution.conversationKind, 'chat_channel');
});

test('resolveTransportBindingDirectLane reports binding_disabled and binding_archived without resolving', () => {
  let core = createDefaultCoreState();
  core = seedConversation(core, 'conversation-direct-1', 'direct_message');
  core = upsertCoreTransportBinding(
    core,
    {
      id: 'binding-disabled',
      platform: 'telegram',
      conversationId: 'conversation-direct-1',
      status: 'disabled',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreTransportBinding(
    core,
    {
      id: 'binding-archived',
      platform: 'telegram',
      conversationId: 'conversation-direct-1',
      status: 'archived',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;

  const disabled = resolveTransportBindingDirectLane(core, 'binding-disabled');
  assert.equal(disabled.status, 'binding_disabled');
  assert.equal(disabled.conversation, null);

  const archived = resolveTransportBindingDirectLane(core, 'binding-archived');
  assert.equal(archived.status, 'binding_archived');
  assert.equal(archived.conversation, null);

  // Neither produces a turn-context hint.
  assert.equal(resolveTransportTurnContextHint(core, 'binding-disabled'), null);
  assert.equal(resolveTransportTurnContextHint(core, 'binding-archived'), null);
});

test('isDirectLaneConversationKind only accepts direct_message kinds in v1', () => {
  assert.equal(isDirectLaneConversationKind('direct_message'), true);
  assert.equal(isDirectLaneConversationKind('chat_channel'), false);
  assert.equal(isDirectLaneConversationKind('work_thread'), false);
  assert.equal(isDirectLaneConversationKind('code_thread'), false);
  assert.equal(isDirectLaneConversationKind('private_escalation'), false);
  assert.equal(isDirectLaneConversationKind('external_transport'), false);
});
