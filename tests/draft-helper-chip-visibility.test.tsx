import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDraftHelperChipsState,
  dismissDraftHelperChipsState,
  fingerprintDraftHelperChips,
  resolveDraftHelperRegionVisibility,
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

test('fingerprintDraftHelperChips returns null for an empty chip set', () => {
  assert.equal(fingerprintDraftHelperChips([]), null);
});

test('fingerprintDraftHelperChips returns identical fingerprints for identical content so stable refreshes keep the dismissal', () => {
  const chips = [
    { id: 'chip-a', prompt: 'Review this PR', label: 'Review' },
    { id: 'chip-b', prompt: 'Summarize the thread', label: 'Summarize' },
  ];
  assert.equal(fingerprintDraftHelperChips(chips), fingerprintDraftHelperChips([...chips]));
});

test('fingerprintDraftHelperChips diverges when a refresh rewrites a chip prompt even if the id is reused', () => {
  const before = [{ id: 'chip-a', prompt: 'Review this PR', label: 'Review' }];
  const after = [{ id: 'chip-a', prompt: 'Summarize this PR', label: 'Review' }];
  assert.notEqual(fingerprintDraftHelperChips(before), fingerprintDraftHelperChips(after));
});

test('fingerprintDraftHelperChips diverges when only the label changes so relabeled chips revive the row', () => {
  const before = [{ id: 'chip-a', prompt: 'Review this PR', label: 'Review' }];
  const after = [{ id: 'chip-a', prompt: 'Review this PR', label: 'Reviewing' }];
  assert.notEqual(fingerprintDraftHelperChips(before), fingerprintDraftHelperChips(after));
});

test('fingerprintDraftHelperChips treats a missing label the same as an empty label so chat-shaped chips stay stable', () => {
  const withUndefined = [{ id: 'chip-a', prompt: 'Review this PR' }];
  const withNullLabel = [{ id: 'chip-a', prompt: 'Review this PR', label: null }];
  assert.equal(
    fingerprintDraftHelperChips(withUndefined),
    fingerprintDraftHelperChips(withNullLabel),
  );
});

test('fingerprintDraftHelperChips resists delimiter-injection collisions when chip copy shifts separator characters across fields', () => {
  const promptOwnsTail = [{ id: 'chip-a', prompt: 'b::c', label: 'd' }];
  const labelOwnsTail = [{ id: 'chip-a', prompt: 'b', label: 'c::d' }];
  assert.notEqual(
    fingerprintDraftHelperChips(promptOwnsTail),
    fingerprintDraftHelperChips(labelOwnsTail),
  );
  const promptOwnsJoin = [{ id: 'chip-a', prompt: 'x||y', label: 'z' }];
  const splitAcrossChips = [
    { id: 'chip-a', prompt: 'x', label: '' },
    { id: 'y', prompt: 'z', label: '' },
  ];
  assert.notEqual(
    fingerprintDraftHelperChips(promptOwnsJoin),
    fingerprintDraftHelperChips(splitAcrossChips),
  );
});

test('helperRegion stays empty in direct lane regardless of available chip sources', () => {
  assert.deepEqual(
    resolveDraftHelperRegionVisibility({
      isDirectLaneContext: true,
      showDraftHelperChips: true,
      runtimeChipCount: 5,
      fallbackChipCount: 1,
    }),
    { runtimeChipsRendered: false, fallbackChipsRendered: false },
  );
});

test('helperRegion shows runtime chips when they are present and not yet dismissed', () => {
  assert.deepEqual(
    resolveDraftHelperRegionVisibility({
      isDirectLaneContext: false,
      showDraftHelperChips: true,
      runtimeChipCount: 2,
      fallbackChipCount: 1,
    }),
    { runtimeChipsRendered: true, fallbackChipsRendered: false },
  );
});

test('runtime chips suppress the product fallback even after the user dismisses them so the fallback does not back-fill', () => {
  // Reviewer-flagged regression for 94d9d6c7: when a +New draft is
  // expanded into a group with runtime starter suggestions, dismissing
  // a runtime chip used to flip the chat-product Pomodoro fallback
  // back on. The fallback gate must be tied to the runtime chip
  // SOURCE (count > 0), not the rendered visibility.
  assert.deepEqual(
    resolveDraftHelperRegionVisibility({
      isDirectLaneContext: false,
      showDraftHelperChips: false,
      runtimeChipCount: 2,
      fallbackChipCount: 1,
    }),
    { runtimeChipsRendered: false, fallbackChipsRendered: false },
  );
});

test('product fallback chips render when no runtime chip source exists', () => {
  assert.deepEqual(
    resolveDraftHelperRegionVisibility({
      isDirectLaneContext: false,
      showDraftHelperChips: true,
      runtimeChipCount: 0,
      fallbackChipCount: 1,
    }),
    { runtimeChipsRendered: false, fallbackChipsRendered: true },
  );
});

test('helperRegion stays empty when there is no runtime chip source and no product fallback either', () => {
  assert.deepEqual(
    resolveDraftHelperRegionVisibility({
      isDirectLaneContext: false,
      showDraftHelperChips: true,
      runtimeChipCount: 0,
      fallbackChipCount: 0,
    }),
    { runtimeChipsRendered: false, fallbackChipsRendered: false },
  );
});
