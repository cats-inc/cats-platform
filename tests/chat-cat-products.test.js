import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import {
  createCat,
  createChannel,
  setBossCat,
  updateCatProducts,
} from '../build/server/products/chat/state/model/index.js';
import {
  defaultCatProducts,
  listEnabledPlatformSurfaces,
} from '../build/server/shared/platformSurfaces.js';

test('default chat state exposes platform-enabled surfaces only', () => {
  const state = createDefaultChatState();

  assert.deepEqual(state.capabilities.availableSurfaces, listEnabledPlatformSurfaces());
});

test('createCat defaults to chat products and falls back when surfaces are unavailable', () => {
  let state = createDefaultChatState();

  state = createCat(state, {
    name: 'Worker',
    provider: 'claude',
  });
  assert.deepEqual(state.cats[0].products, defaultCatProducts());

  state = createCat(state, {
    name: 'Analyst',
    provider: 'claude',
    products: ['bogus'],
  });
  assert.deepEqual(state.cats[0].products, defaultCatProducts());
});

test('updateCatProducts requires at least one product and boss promotion restores chat', () => {
  let state = createDefaultChatState();
  state = createCat(state, {
    name: 'Ops',
    provider: 'claude',
  });
  const catId = state.cats[0].id;

  assert.throws(
    () => updateCatProducts(state, catId, []),
    /Cat must be available in at least one product/,
  );

  const legacyState = structuredClone(state);
  legacyState.cats[0].products = ['work'];
  const nextState = setBossCat(legacyState, catId);

  assert.deepEqual(nextState.cats[0].products, ['work', 'chat']);
});

test('removing chat from cat products detaches active chat participation and clears direct-lane routing', () => {
  const now = new Date('2026-03-26T00:00:00.000Z');
  let state = createDefaultChatState();
  state.capabilities.availableSurfaces = ['chat', 'work'];

  state = createCat(state, {
    name: 'Operator',
    provider: 'claude',
  }, now);
  const catId = state.cats[0].id;

  state = createChannel(state, {
    title: 'Operator Direct',
    topic: 'Dropping chat should detach the cat from active lanes.',
    originSurface: 'chat',
    roomMode: 'direct_message',
    participantCatIds: [catId],
    defaultRecipientId: catId,
    skipBossCatGreeting: true,
  }, now);

  state = updateCatProducts(state, catId, ['work']);

  const assignment = state.channels[0].catAssignments.find((candidate) => candidate.catId === catId);
  assert.deepEqual(state.cats[0].products, ['work']);
  assert.equal(assignment?.status, 'removed');
  assert.equal(assignment?.execution.lease.status, 'removed');
  assert.equal(state.channels[0].roomRouting?.mode, 'chat_channel');
  assert.equal(state.channels[0].roomRouting?.defaultRecipientId, null);
});
