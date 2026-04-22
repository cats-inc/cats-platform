import assert from 'node:assert/strict';
import test from 'node:test';

import { ChatEventHub } from '../build/server/products/chat/api/chatEventHub.js';
import { publishChannelMutation } from '../build/server/products/chat/api/transportEventPublisher.js';
import { publishTelegramBridgeResult } from '../build/server/server/routes/telegram.js';

test('subscribe and emit delivers events to listener', () => {
  const hub = new ChatEventHub();
  const received = [];
  hub.subscribe((event) => received.push(event));

  hub.emit({ kind: 'room_updated', channelId: 'ch-1', timestamp: '2026-01-01T00:00:00Z' });

  assert.equal(received.length, 1);
  assert.equal(received[0].kind, 'room_updated');
  assert.equal(received[0].channelId, 'ch-1');
});

test('unsubscribe stops delivery', () => {
  const hub = new ChatEventHub();
  const received = [];
  const unsubscribe = hub.subscribe((event) => received.push(event));

  hub.emit({ kind: 'room_updated', timestamp: '2026-01-01T00:00:00Z' });
  unsubscribe();
  hub.emit({ kind: 'recents_changed', timestamp: '2026-01-01T00:00:01Z' });

  assert.equal(received.length, 1);
});

test('multiple subscribers all receive events', () => {
  const hub = new ChatEventHub();
  let countA = 0;
  let countB = 0;
  hub.subscribe(() => { countA++; });
  hub.subscribe(() => { countB++; });

  hub.emit({ kind: 'unread_changed', timestamp: '2026-01-01T00:00:00Z' });

  assert.equal(countA, 1);
  assert.equal(countB, 1);
});

test('subscriber count reflects active subscribers', () => {
  const hub = new ChatEventHub();
  assert.equal(hub.subscriberCount, 0);

  const unsub1 = hub.subscribe(() => {});
  assert.equal(hub.subscriberCount, 1);

  const unsub2 = hub.subscribe(() => {});
  assert.equal(hub.subscriberCount, 2);

  unsub1();
  assert.equal(hub.subscriberCount, 1);

  unsub2();
  assert.equal(hub.subscriberCount, 0);
});

test('listener error does not break other subscribers', () => {
  const hub = new ChatEventHub();
  const received = [];
  hub.subscribe(() => { throw new Error('boom'); });
  hub.subscribe((event) => received.push(event));

  hub.emit({ kind: 'transport_ingress', timestamp: '2026-01-01T00:00:00Z' });

  assert.equal(received.length, 1);
});

test('publishChannelMutation emits room update and channel-scoped recents invalidation', () => {
  const hub = new ChatEventHub();
  const received = [];
  hub.subscribe((event) => received.push(event));

  publishChannelMutation(hub, 'channel-1', 'updated');

  assert.equal(received.length, 2);
  assert.equal(received[0].kind, 'room_updated');
  assert.equal(received[0].channelId, 'channel-1');
  assert.equal(received[1].kind, 'recents_changed');
  assert.equal(received[1].channelId, 'channel-1');
});

test('publishTelegramBridgeResult emits ingress and room update for the linked Cats room', () => {
  const hub = new ChatEventHub();
  const received = [];
  hub.subscribe((event) => received.push(event));

  publishTelegramBridgeResult(hub, { roomId: 'channel-telegram-1' });

  assert.equal(received.length, 3);
  assert.equal(received[0].kind, 'transport_ingress');
  assert.equal(received[0].channelId, 'channel-telegram-1');
  assert.equal(received[1].kind, 'recents_changed');
  assert.equal(received[2].kind, 'room_updated');
  assert.equal(received[2].channelId, 'channel-telegram-1');
});

test('publishTelegramBridgeResult emits message metadata for every appended bridge message', () => {
  const hub = new ChatEventHub();
  const received = [];
  hub.subscribe((event) => received.push(event));

  publishTelegramBridgeResult(hub, {
    roomId: 'channel-telegram-1',
    messages: [
      {
        id: 'msg-user',
        senderKind: 'user',
        senderName: 'Telegram User',
        body: 'hello',
        metadata: {
          origin: 'telegram',
          sourceTransportBindingId: 'transport-telegram-bot-binding-cat',
        },
      },
      {
        id: 'msg-agent',
        senderKind: 'agent',
        senderName: 'Companion',
        body: 'hi',
        metadata: {
          origin: 'runtime',
          sourceTransportBindingId: 'transport-telegram-bot-binding-cat',
        },
      },
    ],
  });

  const roomUpdates = received.filter((event) => event.kind === 'room_updated');
  assert.equal(roomUpdates.length, 2);
  assert.deepEqual(roomUpdates.map((event) => event.detail), [
    {
      mutation: 'message_added',
      messageId: 'msg-user',
      origin: 'telegram',
      sourceTransportBindingId: 'transport-telegram-bot-binding-cat',
    },
    {
      mutation: 'message_added',
      messageId: 'msg-agent',
      origin: 'runtime',
      sourceTransportBindingId: 'transport-telegram-bot-binding-cat',
    },
  ]);
});
