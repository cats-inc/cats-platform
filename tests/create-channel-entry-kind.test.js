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
    originSurface: 'chat',
    entryKind: 'direct',
    participantCatIds: [catId],
  });

  const channel = next.channels[0];
  assert.equal(channel?.roomRouting?.mode, 'direct_message');
  assert.equal(channel?.roomRouting?.defaultRecipientId, catId);
  assert.equal(channel?.channelKind, 'direct_message');
});

test('createChannel starts entryKind=default with the remembered default participant when participants are omitted', () => {
  const state = createDefaultChatState();
  const next = createChannel(state, {
    title: 'New chat',
    topic: 'Draft next step',
    originSurface: 'chat',
    entryKind: 'default',
  });

  const channel = next.channels[0];
  assert.equal(channel?.roomRouting?.mode, 'chat_channel');
  assert.equal(channel?.channelKind, 'chat_channel');
  assert.equal(channel?.participantAssignments?.length, 1);
  assert.equal(channel?.participantAssignments?.[0]?.sourceKind, 'adhoc');
  assert.equal(channel?.participantAssignments?.[0]?.execution.target.provider, state.newChatDefaults.provider);
  assert.equal(channel?.coordinatorParticipantId, channel?.participantAssignments?.[0]?.participantId);
});
