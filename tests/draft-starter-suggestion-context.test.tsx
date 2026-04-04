import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveDraftStarterSuggestionContext } from '../src/products/chat/renderer/draftStarterSuggestionContext.ts';

test('starter suggestion context marks direct lanes separately from cat-led drafts', () => {
  assert.deepEqual(
    resolveDraftStarterSuggestionContext({
      allowAddCat: false,
      draftLeadCatId: 'cat-lead',
      hasLeadCat: true,
      entryMode: 'default',
      participantCount: 1,
      parallelTargetCount: 0,
    }),
    {
      mode: 'direct',
      isGroupDraft: false,
      isDirectLaneContext: true,
      isCatLedDraft: false,
    },
  );

  assert.deepEqual(
    resolveDraftStarterSuggestionContext({
      allowAddCat: true,
      draftLeadCatId: 'cat-lead',
      hasLeadCat: true,
      entryMode: 'default',
      participantCount: 1,
      parallelTargetCount: 0,
    }),
    {
      mode: 'cat_led',
      isGroupDraft: false,
      isDirectLaneContext: false,
      isCatLedDraft: true,
    },
  );
});

test('starter suggestion context keeps group and parallel routes distinct', () => {
  assert.deepEqual(
    resolveDraftStarterSuggestionContext({
      allowAddCat: true,
      draftLeadCatId: null,
      hasLeadCat: true,
      entryMode: 'group',
      participantCount: 2,
      parallelTargetCount: 0,
    }),
    {
      mode: 'group',
      isGroupDraft: true,
      isDirectLaneContext: false,
      isCatLedDraft: false,
    },
  );

  assert.deepEqual(
    resolveDraftStarterSuggestionContext({
      allowAddCat: true,
      draftLeadCatId: null,
      hasLeadCat: false,
      entryMode: 'default',
      participantCount: 0,
      parallelTargetCount: 2,
    }),
    {
      mode: 'parallel',
      isGroupDraft: false,
      isDirectLaneContext: false,
      isCatLedDraft: false,
    },
  );
});

test('starter suggestion context falls back to solo when no cats are selected', () => {
  assert.deepEqual(
    resolveDraftStarterSuggestionContext({
      allowAddCat: true,
      draftLeadCatId: null,
      hasLeadCat: false,
      entryMode: 'default',
      participantCount: 0,
      parallelTargetCount: 0,
    }),
    {
      mode: 'solo',
      isGroupDraft: false,
      isDirectLaneContext: false,
      isCatLedDraft: false,
    },
  );
});
