import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryCoreStore } from '../dist-server/core/store.js';
import { createDefaultCoreState } from '../dist-server/core/model.js';

test('MemoryCoreStore exposes a neutral read/write boundary for Cats Core state', async () => {
  const initialState = createDefaultCoreState();
  const store = new MemoryCoreStore(initialState);

  const firstRead = await store.readCore();
  assert.deepEqual(firstRead, initialState);
  assert.notStrictEqual(firstRead, initialState);

  const nextState = structuredClone(firstRead);
  nextState.setupCompleteAt = '2026-03-21T00:00:00.000Z';
  nextState.ownerProfile.displayName = 'Suite Owner';

  const written = await store.writeCore(nextState);
  const secondRead = await store.readCore();

  assert.equal(written.setupCompleteAt, '2026-03-21T00:00:00.000Z');
  assert.equal(secondRead.ownerProfile.displayName, 'Suite Owner');

  nextState.ownerProfile.displayName = 'Mutated after write';
  assert.equal(secondRead.ownerProfile.displayName, 'Suite Owner');
});
