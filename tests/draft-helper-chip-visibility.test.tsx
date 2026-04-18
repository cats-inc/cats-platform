import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDraftHelperChipsState,
  dismissDraftHelperChipsState,
  shouldRenderDraftHelperChips,
  syncDraftHelperChipsResetKey,
} from '../src/products/shared/renderer/draftHelperChips.ts';

test('draft helper chips render when a non-empty chip set has not been dismissed', () => {
  assert.equal(
    shouldRenderDraftHelperChips({ availableChipCount: 3, dismissed: false }),
    true,
  );
});

test('draft helper chips hide when dismissed even if chips remain available', () => {
  assert.equal(
    shouldRenderDraftHelperChips({ availableChipCount: 3, dismissed: true }),
    false,
  );
});

test('draft helper chips hide when no chips are available regardless of dismissal', () => {
  assert.equal(
    shouldRenderDraftHelperChips({ availableChipCount: 0, dismissed: false }),
    false,
  );
});

test('dismissing the chip row flips dismissed to true', () => {
  const initial = createDraftHelperChipsState('chat:new:default|chip-a|chip-b');
  const after = dismissDraftHelperChipsState(initial);
  assert.equal(after.dismissed, true);
  assert.equal(after.lastResetKey, initial.lastResetKey);
});

test('dismissing when already dismissed preserves state identity so React can skip extra renders', () => {
  const dismissed = dismissDraftHelperChipsState(
    createDraftHelperChipsState('chat:new:default|chip-a'),
  );
  const again = dismissDraftHelperChipsState(dismissed);
  assert.strictEqual(again, dismissed);
});

test('syncing the reset key with the same value preserves state identity', () => {
  const state = dismissDraftHelperChipsState(
    createDraftHelperChipsState('chat:new:default|chip-a'),
  );
  const synced = syncDraftHelperChipsResetKey(state, 'chat:new:default|chip-a');
  assert.strictEqual(synced, state);
});

test('syncing the reset key with a new chip fingerprint clears dismissal so the fresh chip set shows up', () => {
  const dismissed = dismissDraftHelperChipsState(
    createDraftHelperChipsState('chat:new:default|chip-a'),
  );
  assert.equal(dismissed.dismissed, true);
  const synced = syncDraftHelperChipsResetKey(dismissed, 'chat:new:default|chip-b');
  assert.equal(synced.dismissed, false);
  assert.equal(synced.lastResetKey, 'chat:new:default|chip-b');
});

test('syncing the reset key from a value to null also resets dismissal so a no-chip mode is cleanly entered', () => {
  const dismissed = dismissDraftHelperChipsState(
    createDraftHelperChipsState('chat:new:default|chip-a'),
  );
  const synced = syncDraftHelperChipsResetKey(dismissed, null);
  assert.equal(synced.dismissed, false);
  assert.equal(synced.lastResetKey, null);
});
