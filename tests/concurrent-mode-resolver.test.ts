import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveConcurrentPresentationMode } from '../src/products/shared/renderer/components/chat-view/concurrentModeResolver.js';

const base = {
  explicitOverride: null,
  workflowRecommendation: null,
  userDefault: 'inline_stack' as const,
  segmentCount: 3,
  viewportWidth: 1280,
};

test('resolveConcurrentPresentationMode returns explicitOverride when set', () => {
  assert.equal(
    resolveConcurrentPresentationMode({ ...base, explicitOverride: 'focus_rail' }),
    'focus_rail',
  );
});

test('resolveConcurrentPresentationMode returns workflowRecommendation when no override', () => {
  assert.equal(
    resolveConcurrentPresentationMode({ ...base, workflowRecommendation: 'compare_cards' }),
    'compare_cards',
  );
});

test('resolveConcurrentPresentationMode returns userDefault when no override or recommendation', () => {
  assert.equal(
    resolveConcurrentPresentationMode({ ...base, userDefault: 'compare_cards' }),
    'compare_cards',
  );
});

test('resolveConcurrentPresentationMode resolves adaptive to compare_cards on wide viewport with 2-4 segments', () => {
  assert.equal(
    resolveConcurrentPresentationMode({ ...base, userDefault: 'adaptive', segmentCount: 3, viewportWidth: 1280 }),
    'compare_cards',
  );
});

test('resolveConcurrentPresentationMode resolves adaptive to inline_stack on narrow viewport', () => {
  assert.equal(
    resolveConcurrentPresentationMode({ ...base, userDefault: 'adaptive', segmentCount: 3, viewportWidth: 600 }),
    'inline_stack',
  );
});

test('resolveConcurrentPresentationMode resolves adaptive to inline_stack for single segment', () => {
  assert.equal(
    resolveConcurrentPresentationMode({ ...base, userDefault: 'adaptive', segmentCount: 1, viewportWidth: 1280 }),
    'inline_stack',
  );
});

test('resolveConcurrentPresentationMode resolves adaptive to inline_stack for 5+ segments', () => {
  assert.equal(
    resolveConcurrentPresentationMode({ ...base, userDefault: 'adaptive', segmentCount: 5, viewportWidth: 1280 }),
    'inline_stack',
  );
});

test('resolveConcurrentPresentationMode resolves adaptive to compare_cards at exactly 720px with 2 segments', () => {
  assert.equal(
    resolveConcurrentPresentationMode({ ...base, userDefault: 'adaptive', segmentCount: 2, viewportWidth: 720 }),
    'compare_cards',
  );
});

test('resolveConcurrentPresentationMode explicit override beats workflow recommendation', () => {
  assert.equal(
    resolveConcurrentPresentationMode({
      ...base,
      explicitOverride: 'inline_stack',
      workflowRecommendation: 'compare_cards',
    }),
    'inline_stack',
  );
});
