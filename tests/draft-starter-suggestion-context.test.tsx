import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveDraftStarterSuggestionContext } from '../src/products/chat/renderer/draftStarterSuggestionContext.ts';

test('starter suggestion context surfaces isDirectLaneContext separately from composer mode', () => {
  // Direct lane (`/chat/dm/:catId` with no add-cat affordance) is its
  // own surface — not a sub-mode of +New chat. The `mode` value is
  // composer state for the +New chat surface only; on direct lane the
  // mode falls through to `'solo'` and the renderer suppresses chips
  // via the dedicated `isDirectLaneContext` flag.
  assert.deepEqual(
    resolveDraftStarterSuggestionContext({
      allowAddCat: false,
      draftDefaultRecipientCatId: 'cat-lead',
      hasDefaultRecipientCat: true,
      entryPreset: 'default',
      participantCount: 1,
      parallelTargetCount: 0,
    }),
    {
      mode: 'solo',
      isGroupDraft: false,
      isDirectLaneContext: true,
    },
  );

  // +New chat opened with a cat preset (allowAddCat: true) is just a
  // regular New chat draft. There is no separate "Participant Chat"
  // mode — the cat fills the audience picker but the hero stays the
  // standard greeting.
  assert.deepEqual(
    resolveDraftStarterSuggestionContext({
      allowAddCat: true,
      draftDefaultRecipientCatId: 'cat-lead',
      hasDefaultRecipientCat: true,
      entryPreset: 'default',
      participantCount: 1,
      parallelTargetCount: 0,
    }),
    {
      mode: 'solo',
      isGroupDraft: false,
      isDirectLaneContext: false,
    },
  );
});

test('starter suggestion context keeps group and parallel routes distinct', () => {
  assert.deepEqual(
    resolveDraftStarterSuggestionContext({
      allowAddCat: true,
      draftDefaultRecipientCatId: null,
      hasDefaultRecipientCat: true,
      entryPreset: 'group',
      participantCount: 2,
      parallelTargetCount: 0,
    }),
    {
      mode: 'group',
      isGroupDraft: true,
      isDirectLaneContext: false,
    },
  );

  assert.deepEqual(
    resolveDraftStarterSuggestionContext({
      allowAddCat: true,
      draftDefaultRecipientCatId: null,
      hasDefaultRecipientCat: false,
      entryPreset: 'default',
      participantCount: 0,
      parallelTargetCount: 2,
    }),
    {
      mode: 'parallel',
      isGroupDraft: false,
      isDirectLaneContext: false,
    },
  );
});

test('starter suggestion context falls back to solo when no cats are selected', () => {
  assert.deepEqual(
    resolveDraftStarterSuggestionContext({
      allowAddCat: true,
      draftDefaultRecipientCatId: null,
      hasDefaultRecipientCat: false,
      entryPreset: 'default',
      participantCount: 0,
      parallelTargetCount: 0,
    }),
    {
      mode: 'solo',
      isGroupDraft: false,
      isDirectLaneContext: false,
    },
  );
});
