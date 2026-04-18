import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveVisibleDraftStarterSuggestions } from '../src/products/chat/renderer/draftStarterSuggestions.ts';

test('visible starter suggestions return sanitized externally supplied ideas', () => {
  const suggestions = resolveVisibleDraftStarterSuggestions({
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
    suggestions: [],
  });

  assert.deepEqual(suggestions, []);
});

test('visible starter suggestions return empty when supplied ideas are all blank', () => {
  const suggestions = resolveVisibleDraftStarterSuggestions({
    suggestions: [
      {
        id: '   ',
        prompt: '   ',
      },
    ],
  });

  assert.deepEqual(suggestions, []);
});

test('visible starter suggestions return empty when nothing is supplied', () => {
  assert.deepEqual(resolveVisibleDraftStarterSuggestions({}), []);
  assert.deepEqual(resolveVisibleDraftStarterSuggestions({ suggestions: null }), []);
});
