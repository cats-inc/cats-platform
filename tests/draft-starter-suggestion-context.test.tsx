import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveDraftStarterSuggestionContext } from '../src/products/chat/renderer/draftStarterSuggestionContext.ts';

test('starter suggestion context marks direct lanes separately from participant drafts', () => {
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
      mode: 'direct',
      isGroupDraft: false,
      isDirectLaneContext: true,
      isParticipantDraft: false,
    },
  );

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
      mode: 'participant',
      isGroupDraft: false,
      isDirectLaneContext: false,
      isParticipantDraft: true,
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
      isParticipantDraft: false,
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
      isParticipantDraft: false,
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
      isParticipantDraft: false,
    },
  );
});
