import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveDraftStarterSuggestions,
  resolveVisibleDraftStarterSuggestions,
} from '../src/products/chat/renderer/draftStarterSuggestions.ts';

test('starter suggestions default to solo fallback prompts', () => {
  const suggestions = resolveDraftStarterSuggestions({ mode: 'solo' });

  assert.equal(suggestions.length, 3);
  assert.match(suggestions[0]?.prompt ?? '', /Plan today's priorities/u);
});

test('starter suggestions personalize cat-led and direct prompts with the lead cat name', () => {
  const catLed = resolveDraftStarterSuggestions({
    mode: 'cat_led',
    leadCatName: 'Milo',
  });
  const direct = resolveDraftStarterSuggestions({
    mode: 'direct',
    leadCatName: 'Milo',
  });

  assert.match(catLed[0]?.prompt ?? '', /Milo/u);
  assert.match(direct[0]?.prompt ?? '', /Milo/u);
});

test('starter suggestions keep dedicated group and parallel fallback sets', () => {
  const group = resolveDraftStarterSuggestions({ mode: 'group' });
  const parallel = resolveDraftStarterSuggestions({ mode: 'parallel' });

  assert.match(group[0]?.prompt ?? '', /split roles/u);
  assert.match(parallel[0]?.prompt ?? '', /different models/u);
});

test('visible starter suggestions prefer externally supplied ideas over fallback prompts', () => {
  const suggestions = resolveVisibleDraftStarterSuggestions({
    mode: 'group',
    suggestions: [
      {
        id: 'guide-cat-brief',
        prompt: 'Guide Cat suggests starting with the real constraint before assigning roles.',
      },
    ],
  });

  assert.deepEqual(suggestions, [
    {
      id: 'guide-cat-brief',
      prompt: 'Guide Cat suggests starting with the real constraint before assigning roles.',
    },
  ]);
});

test('visible starter suggestions honor an explicit empty override', () => {
  const suggestions = resolveVisibleDraftStarterSuggestions({
    mode: 'group',
    suggestions: [],
  });

  assert.deepEqual(suggestions, []);
});

test('visible starter suggestions fall back when supplied ideas are missing or blank', () => {
  const suggestions = resolveVisibleDraftStarterSuggestions({
    mode: 'group',
    suggestions: [
      {
        id: '   ',
        prompt: '   ',
      },
    ],
  });

  assert.equal(suggestions.length, 3);
  assert.match(suggestions[0]?.prompt ?? '', /split roles/u);
});
