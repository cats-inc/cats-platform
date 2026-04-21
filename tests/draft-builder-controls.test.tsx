import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveChatNewChatDraftBuilderControls } from '../src/products/shared/renderer/draftBuilderControls.ts';

test('draft builder controls expose advanced add buttons without duplicating policy', () => {
  assert.deepEqual(
    resolveChatNewChatDraftBuilderControls({
      advancedDraftControlsEnabled: true,
      entryPreset: 'default',
      showStructuredDraftControls: true,
      hasVisibleParallelDraftTargets: false,
    }),
    {
      showParallelAddButton: true,
      showGroupAddButton: true,
      hideGroupHint: true,
      hideParallelHint: true,
    },
  );
});

test('draft builder controls keep dedicated group and parallel hints visible', () => {
  assert.equal(
    resolveChatNewChatDraftBuilderControls({
      advancedDraftControlsEnabled: true,
      entryPreset: 'group',
      showStructuredDraftControls: true,
      hasVisibleParallelDraftTargets: false,
    }).hideGroupHint,
    false,
  );
  assert.equal(
    resolveChatNewChatDraftBuilderControls({
      advancedDraftControlsEnabled: true,
      entryPreset: 'parallel',
      showStructuredDraftControls: true,
      hasVisibleParallelDraftTargets: false,
    }).hideParallelHint,
    false,
  );
});

test('draft builder controls still show compare button for existing visible branches', () => {
  assert.deepEqual(
    resolveChatNewChatDraftBuilderControls({
      advancedDraftControlsEnabled: false,
      entryPreset: 'default',
      showStructuredDraftControls: true,
      hasVisibleParallelDraftTargets: true,
    }),
    {
      showParallelAddButton: true,
      showGroupAddButton: false,
      hideGroupHint: false,
      hideParallelHint: false,
    },
  );
});
