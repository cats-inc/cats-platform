import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import { createCat, createChannel } from '../build/server/products/chat/state/model/index.js';

function createStateWithCat() {
  const withCat = createCat(createDefaultChatState(), {
    name: 'Companion',
    provider: 'claude',
    instance: null,
    model: 'claude-sonnet-4',
    products: ['chat'],
  });
  return {
    state: withCat,
    catId: withCat.cats[0]?.id ?? null,
  };
}

test('createChannel treats entryKind=direct as a direct lane when roomMode is omitted', () => {
  const { state, catId } = createStateWithCat();
  assert.ok(catId, 'expected seeded cat id');

  const next = createChannel(state, {
    title: '',
    topic: 'Wake up',
    entryKind: 'direct',
    participantCatIds: [catId],
    skipBossCatGreeting: true,
  });

  const channel = next.channels[0];
  assert.equal(channel?.roomRouting?.mode, 'direct_cat_chat');
  assert.equal(channel?.roomRouting?.leadParticipantId, catId);
  assert.equal(channel?.channelKind, 'direct_lane');
  assert.equal(channel?.composerMode, 'cat_led');
});

test('createChannel treats entryKind=solo as a solo thread when composerMode is omitted', () => {
  const next = createChannel(createDefaultChatState(), {
    title: 'New chat',
    topic: 'Draft next step',
    entryKind: 'solo',
    skipBossCatGreeting: true,
  });

  const channel = next.channels[0];
  assert.equal(channel?.roomRouting?.mode, 'boss_chat');
  assert.equal(channel?.composerMode, 'solo');
  assert.equal(channel?.channelKind, 'boss_thread');
});

