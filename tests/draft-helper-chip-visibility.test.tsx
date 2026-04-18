import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveDraftHelperChipsDismissedState,
  shouldRenderDraftHelperChips,
} from '../src/products/shared/renderer/draftHelperChips.ts';

test('draft helper chips remain visible until a chip click dismisses them', () => {
  assert.equal(
    shouldRenderDraftHelperChips({
      availableChipCount: 3,
      dismissed: false,
    }),
    true,
  );
});

test('draft helper chips stay hidden after a chip click dismisses them', () => {
  const dismissed = resolveDraftHelperChipsDismissedState({
    previouslyDismissed: false,
    dismissedByChipClick: true,
  });
  assert.equal(dismissed, true);
  assert.equal(
    shouldRenderDraftHelperChips({
      availableChipCount: 3,
      dismissed,
    }),
    false,
  );
});

test('draft helper chips ignore unrelated composer edits once not dismissed', () => {
  const dismissed = resolveDraftHelperChipsDismissedState({
    previouslyDismissed: false,
    dismissedByChipClick: false,
  });
  assert.equal(dismissed, false);
  assert.equal(
    shouldRenderDraftHelperChips({
      availableChipCount: 3,
      dismissed,
    }),
    true,
  );
});

test('draft helper chips reset only when a new draft instance starts undisposed', () => {
  const dismissed = resolveDraftHelperChipsDismissedState({
    previouslyDismissed: true,
    dismissedByChipClick: false,
  });
  assert.equal(dismissed, true);
  assert.equal(
    shouldRenderDraftHelperChips({
      availableChipCount: 3,
      dismissed: false,
    }),
    true,
  );
});
