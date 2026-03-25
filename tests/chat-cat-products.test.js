import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultChatState } from '../dist-server/chat/defaults.js';
import {
  createCat,
  setBossCat,
  updateCatProducts,
} from '../dist-server/chat/model.js';
import {
  defaultCatProducts,
  listEnabledSuiteSurfaces,
} from '../dist-server/shared/suiteSurfaces.js';

test('default chat state exposes suite-enabled surfaces only', () => {
  const state = createDefaultChatState();

  assert.deepEqual(state.capabilities.availableSurfaces, listEnabledSuiteSurfaces());
});

test('createCat defaults to chat products and ignores unavailable surfaces', () => {
  let state = createDefaultChatState();

  state = createCat(state, {
    name: 'Worker',
    provider: 'claude',
  });
  assert.deepEqual(state.cats[0].products, defaultCatProducts());

  state = createCat(state, {
    name: 'Analyst',
    provider: 'claude',
    products: ['work'],
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
