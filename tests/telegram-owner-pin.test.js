import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createTelegramRelay } from '../build/server/platform/transports/telegram/relay/index.js';
import {
  createFileBackedTelegramRelayStore,
  InMemoryTelegramRelayStore,
} from '../build/server/platform/transports/telegram/store/index.js';

/**
 * SPEC-140: a Telegram bot binding answers only its owner. The first private
 * chat that writes becomes the owner (as in Cats Bot); a binding that already
 * talked to people is settled from the chats it has seen; nobody else gets in
 * or gets a message out.
 */

const NOW = '2026-11-11T00:00:00.000Z';

function context(overrides = {}) {
  const defaultBotBinding = {
    id: 'bot-binding-telegram',
    platform: 'telegram',
    botName: 'smelly_bot',
    orchestratorActorId: 'actor-orchestrator-global',
    catActorId: 'actor-cat-cat-smelly',
    bossCatActorId: 'actor-cat-cat-smelly',
    roomMode: 'direct_message',
    status: 'active',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: NOW,
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

let updateId = 100;
function privateMessage(chatId, text, extra = {}) {
  updateId += 1;
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      text,
      chat: { id: chatId, type: 'private', username: `user${chatId}` },
      from: { id: chatId, first_name: `Name ${chatId}`, username: `user${chatId}` },
      ...extra,
    },
  };
}

function callbackFrom(chatId) {
  updateId += 1;
  return {
    update_id: updateId,
    callback_query: {
      id: `cb-${updateId}`,
      data: 'noop',
      from: { id: chatId },
      message: { message_id: 1, chat: { id: chatId, type: 'private' } },
    },
  };
}

function legacyChat(chatId, lastInboundAt, bindingId = 'bot-binding-telegram') {
  return {
    telegramChatId: String(chatId),
    conversationId: `telegram:${bindingId}:${chatId}`,
    bindingId,
    botName: 'smelly_bot',
    transportConversationMode: 'direct_message',
    roomRoutingStatus: 'linked_room',
    linkedRoomId: 'room-dm',
    telegramChatType: 'private',
    telegramChatTitle: null,
    telegramChatUsername: `user${chatId}`,
    lastInboundMessageId: '1',
    lastInboundAt,
    lastInboundTextPreview: 'hi',
    lastInboundAttachmentKinds: [],
    lastOutboundMessageId: null,
    lastOutboundAt: null,
    createdAt: lastInboundAt,
    updatedAt: lastInboundAt,
  };
}

function relayWith(store, calls = []) {
  return createTelegramRelay({
    store,
    now: () => new Date(NOW),
    deliveryClient: {
      async deliver(request) {
        calls.push(request);
        return { ok: true, chatId: request.chatId, messageId: '9001' };
      },
    },
  });
}

test('the first private chat becomes the owner; everyone else is ignored, buttons included (SPEC-140 FR-1, FR-2)', () => {
  const store = new InMemoryTelegramRelayStore();
  const relay = relayWith(store);
  const ctx = context();

  const first = relay.receiveUpdate({ update: privateMessage(111, 'hello'), context: ctx });
  assert.equal(first.status, 'accepted');
  const owner = store.getOwner('bot-binding-telegram');
  assert.equal(owner.state, 'pinned');
  assert.equal(owner.userId, '111');
  assert.equal(owner.how, 'first_message');
  assert.equal(owner.displayName, 'Name 111');
  assert.equal(owner.username, 'user111');

  const stranger = relay.receiveUpdate({ update: privateMessage(222, 'let me in'), context: ctx });
  assert.equal(stranger.status, 'ignored');
  assert.equal(stranger.reason, 'not_owner');
  assert.equal(stranger.mappedConversationId, null);
  assert.equal(store.getBinding('222', null), null, 'a stranger leaves no record');
  assert.equal(store.listBindings().some((binding) => binding.telegramChatId === '222'), false);

  assert.equal(relay.receiveUpdate({ update: callbackFrom(222), context: ctx }).reason, 'not_owner');
  assert.equal(relay.receiveUpdate({ update: privateMessage(111, 'still me'), context: ctx }).status, 'accepted');
});

test('a binding that talked to one chat before owners existed pins it; several make the owner choose (SPEC-140 FR-3, FR-4)', async () => {
  const single = new InMemoryTelegramRelayStore();
  single.upsertBinding(legacyChat(111, '2026-11-01T00:00:00.000Z'));
  const singleRelay = relayWith(single);
  assert.equal(singleRelay.receiveUpdate({ update: privateMessage(222, 'hi'), context: context() }).reason, 'not_owner');
  assert.deepEqual(
    { state: single.getOwner('bot-binding-telegram').state, how: single.getOwner('bot-binding-telegram').how },
    { state: 'pinned', how: 'history' },
  );
  assert.equal(singleRelay.receiveUpdate({ update: privateMessage(111, 'hi'), context: context() }).status, 'accepted');

  const many = new InMemoryTelegramRelayStore();
  many.upsertBinding(legacyChat(111, '2026-11-01T00:00:00.000Z'));
  many.upsertBinding(legacyChat(222, '2026-11-05T00:00:00.000Z'));
  const calls = [];
  const relay = relayWith(many, calls);
  const ctx = context();
  for (const chatId of [111, 222, 333]) {
    const receipt = relay.receiveUpdate({ update: privateMessage(chatId, 'hi'), context: ctx });
    assert.equal(receipt.status, 'ignored');
    assert.equal(receipt.reason, 'owner_not_confirmed', `chat ${chatId} waits for the owner's choice`);
  }
  const blocked = await relay.deliver({ request: { operation: 'send', chatId: '111', text: 'hello' }, context: ctx });
  assert.equal(blocked.status, 'failed');
  assert.equal(blocked.reason, 'not_owner_chat');
  assert.equal(calls.length, 0, 'nothing goes out while the owner has not chosen');
  assert.equal(relay.resolveBinding({ roomId: 'room-dm', bindingId: 'bot-binding-telegram' }), null);

  const owners = relay.getDiagnostics(ctx).owners;
  assert.equal(owners.length, 1);
  assert.equal(owners[0].state, 'choose');
  assert.deepEqual(
    owners[0].candidates.map((candidate) => candidate.userId),
    ['333', '222', '111'],
    'every chat that writes while the owner chooses is collected, the newest first',
  );

  assert.equal(relay.chooseOwner('bot-binding-telegram', '999'), null, 'only a chat the binding had seen');
  const chosen = relay.chooseOwner('bot-binding-telegram', '111');
  assert.equal(chosen.state, 'pinned');
  assert.equal(chosen.how, 'owner_choice');
  assert.equal(relay.receiveUpdate({ update: privateMessage(111, 'me'), context: ctx }).status, 'accepted');
  assert.equal(relay.receiveUpdate({ update: privateMessage(222, 'me?'), context: ctx }).reason, 'not_owner');
  assert.equal(relay.chooseOwner('bot-binding-telegram', '222'), null, 'no choice once an owner is pinned');
  assert.equal(relay.resolveBinding({ roomId: 'room-dm', bindingId: 'bot-binding-telegram' })?.telegramChatId, '111');
});

test('history counts only chats that wrote in, offers previews, and an ignored update keeps no dedupe slot (SPEC-140 FR-2, FR-3)', () => {
  const store = new InMemoryTelegramRelayStore();
  store.upsertBinding(legacyChat(111, '2026-11-01T00:00:00.000Z'));
  // What a delivery used to write for a chat it only sent to: a time, but no inbound message.
  store.upsertBinding({ ...legacyChat(333, '2026-11-02T00:00:00.000Z'), lastInboundMessageId: null, lastInboundTextPreview: null });
  // A group or channel id (negative), recorded as private by the old delivery path.
  store.upsertBinding({ ...legacyChat(-1001234567890, '2026-11-03T00:00:00.000Z'), lastInboundMessageId: null });
  const relay = relayWith(store);
  const ignored = relay.receiveUpdate({ update: privateMessage(222, 'hi'), context: context() });
  assert.equal(ignored.reason, 'not_owner');
  assert.equal(store.hasProcessedUpdate(ignored.updateId), false, 'like other ignored updates, no dedupe slot');
  assert.equal(store.getOwner('bot-binding-telegram').userId, '111', 'a chat the bot only sent to never counts');

  const many = new InMemoryTelegramRelayStore();
  many.upsertBinding({ ...legacyChat(111, '2026-11-01T00:00:00.000Z'), lastInboundTextPreview: 'it is me, the owner' });
  many.upsertBinding(legacyChat(222, '2026-11-05T00:00:00.000Z'));
  relayWith(many).receiveUpdate({ update: privateMessage(444, 'hi'), context: context() });
  const candidates = many.getOwner('bot-binding-telegram').candidates;
  assert.equal(candidates.find((candidate) => candidate.userId === '111').lastMessagePreview, 'it is me, the owner');
});

test('reset never reopens "first message wins": chats that write are collected and the owner picks (SPEC-140 FR-5)', () => {
  const store = new InMemoryTelegramRelayStore();
  const relay = relayWith(store);
  const ctx = context();
  relay.receiveUpdate({ update: privateMessage(111, 'hello'), context: ctx });
  const reset = relay.resetOwner('bot-binding-telegram');
  assert.deepEqual({ state: reset.state, candidates: reset.candidates }, { state: 'choose', candidates: [] });

  const squatter = relay.receiveUpdate({ update: privateMessage(666, 'mine now'), context: ctx });
  assert.equal(squatter.reason, 'owner_not_confirmed', 'a stranger who keeps writing does not win');
  assert.equal(relay.receiveUpdate({ update: privateMessage(222, 'new phone'), context: ctx }).reason, 'owner_not_confirmed');
  const candidates = store.getOwner('bot-binding-telegram').candidates;
  assert.deepEqual(candidates.map((candidate) => candidate.userId), ['222', '666']);
  assert.equal(candidates[0].lastMessagePreview, 'new phone');
  assert.equal(candidates[0].displayName, 'Name 222');

  assert.equal(relay.chooseOwner('bot-binding-telegram', '222').how, 'owner_choice');
  assert.equal(relay.receiveUpdate({ update: privateMessage(222, 'me'), context: ctx }).status, 'accepted');
  assert.equal(relay.receiveUpdate({ update: privateMessage(666, 'me?'), context: ctx }).reason, 'not_owner');
  assert.equal(relay.receiveUpdate({ update: privateMessage(111, 'old phone'), context: ctx }).reason, 'not_owner');
});

test('records written before bindings were scoped count only for the default binding, and only after it existed (SPEC-140 FR-3)', () => {
  const store = new InMemoryTelegramRelayStore();
  store.upsertBinding({ ...legacyChat(777, '2026-11-01T00:00:00.000Z'), bindingId: null });
  const relay = relayWith(store);
  const base = context();
  const second = { ...base.defaultBotBinding, id: 'bot-binding-second', botName: 'second_bot', createdAt: '2026-11-05T00:00:00.000Z' };
  const ctx = context({ botBindings: [base.defaultBotBinding, second] });
  const owners = Object.fromEntries(relay.getDiagnostics(ctx).owners.map((owner) => [owner.bindingId, owner]));
  assert.equal(owners['bot-binding-telegram'].state, 'pinned', 'the default binding inherits its unscoped history');
  assert.equal(owners['bot-binding-telegram'].userId, '777');
  assert.equal(owners['bot-binding-second'].state, 'open', 'a newer binding never inherits another bot\'s user');

  const late = new InMemoryTelegramRelayStore();
  late.upsertBinding(legacyChat(888, '2026-09-01T00:00:00.000Z'));
  relayWith(late).getDiagnostics(context());
  assert.equal(late.getOwner('bot-binding-telegram').state, 'open', 'a chat from before the binding existed is not its history');
});

test('a binding sends only to its owner, and makes no record for any other chat (SPEC-140 FR-6)', async () => {
  const store = new InMemoryTelegramRelayStore();
  const calls = [];
  const relay = relayWith(store, calls);
  const ctx = context();

  const beforeOwner = await relay.deliver({ request: { operation: 'send', chatId: '111', text: 'hi' }, context: ctx });
  assert.equal(beforeOwner.reason, 'not_owner_chat', 'nobody owns a fresh binding yet');

  relay.receiveUpdate({ update: privateMessage(111, 'hello'), context: ctx });
  const toStranger = await relay.deliver({ request: { operation: 'send', chatId: '222', text: 'secret' }, context: ctx });
  assert.equal(toStranger.status, 'failed');
  assert.equal(toStranger.reason, 'not_owner_chat');
  assert.equal(store.listBindings().some((binding) => binding.telegramChatId === '222'), false);

  const toOwner = await relay.deliver({ request: { operation: 'send', chatId: '111', text: 'hi' }, context: ctx });
  assert.equal(toOwner.status, 'sent');
  assert.deepEqual(calls.map((call) => call.chatId), ['111']);
});

test('a room mirrors only to the owner, never to the chat that touched it last (SPEC-140 FR-6)', () => {
  const store = new InMemoryTelegramRelayStore();
  store.upsertBinding(legacyChat(111, '2026-11-01T00:00:00.000Z'));
  store.upsertBinding(legacyChat(222, '2026-11-09T00:00:00.000Z'));
  store.setOwner('bot-binding-telegram', {
    state: 'pinned', userId: '111', displayName: null, username: null, pinnedAt: NOW, how: 'owner_choice',
  });
  const relay = relayWith(store);
  assert.equal(relay.resolveBinding({ roomId: 'room-dm', bindingId: 'bot-binding-telegram' })?.telegramChatId, '111');
  assert.equal(relay.findSoleUnlinkedConversation('bot-binding-telegram'), null);

  // Before anything settled an owner, a room lookup judges from this binding's own records
  // without storing that judgement.
  const fresh = new InMemoryTelegramRelayStore();
  fresh.upsertBinding(legacyChat(555, '2026-11-01T00:00:00.000Z'));
  const freshRelay = relayWith(fresh);
  assert.equal(freshRelay.resolveBinding({ roomId: 'room-dm', bindingId: 'bot-binding-telegram' })?.telegramChatId, '555');
  assert.equal(fresh.getOwner('bot-binding-telegram'), null, 'nothing is stored from a partial view');
  fresh.upsertBinding({ ...legacyChat(556, '2026-11-02T00:00:00.000Z'), bindingId: null });
  assert.equal(freshRelay.resolveBinding({ roomId: 'room-dm', bindingId: 'bot-binding-telegram' })?.telegramChatId, '555',
    'an unscoped record never sways a lookup that cannot tell which binding it belongs to');
});

test('owners persist with the relay state; a damaged owner is derived again (SPEC-140 FR-7)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cats-telegram-owner-'));
  try {
    const chatStatePath = path.join(dir, 'chat-state.json');
    const store = createFileBackedTelegramRelayStore(chatStatePath);
    const relay = relayWith(store);
    relay.receiveUpdate({ update: privateMessage(111, 'hello'), context: context() });

    const statePath = path.join(dir, 'chat-state.telegram-relay.json');
    const persisted = JSON.parse(readFileSync(statePath, 'utf8'));
    assert.equal(persisted.version, 2);
    assert.equal(persisted.owners['bot-binding-telegram'].userId, '111');

    const reopened = createFileBackedTelegramRelayStore(chatStatePath);
    assert.equal(reopened.getOwner('bot-binding-telegram').userId, '111');

    persisted.owners['bot-binding-telegram'] = { state: 'pinned', userId: 7 };
    writeFileSync(statePath, JSON.stringify(persisted));
    const repaired = createFileBackedTelegramRelayStore(chatStatePath);
    assert.equal(repaired.getOwner('bot-binding-telegram'), null, 'a damaged entry is dropped');
    const relayAgain = relayWith(repaired);
    assert.equal(relayAgain.receiveUpdate({ update: privateMessage(222, 'hi'), context: context() }).reason, 'not_owner');
    assert.equal(repaired.getOwner('bot-binding-telegram').how, 'history', 'derived again from the one chat it had seen');

    // A file that cannot be read at all is copied aside, and the owner is confirmed, never claimed.
    writeFileSync(statePath, '{ not json');
    const damaged = createFileBackedTelegramRelayStore(chatStatePath);
    assert.equal(damaged.isOwnerStateUncertain(), true);
    assert.ok(readdirSync(dir).some((name) => name.startsWith('chat-state.telegram-relay.json.damaged-')), 'the damaged file is kept');
    const afterDamage = relayWith(damaged);
    assert.equal(afterDamage.receiveUpdate({ update: privateMessage(999, 'first!'), context: context() }).reason, 'owner_not_confirmed');
    assert.equal(damaged.getOwner('bot-binding-telegram').state, 'choose');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
