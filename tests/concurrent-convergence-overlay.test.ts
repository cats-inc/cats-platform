import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveConvergenceOverlay } from '../src/products/chat/renderer/components/chat-view/convergencePolicyOverlay.js';

test('resolveConvergenceOverlay returns null when policy is null', () => {
  assert.equal(resolveConvergenceOverlay(null, ['lane-1', 'lane-2']), null);
});

test('resolveConvergenceOverlay returns null when policy is undefined', () => {
  assert.equal(resolveConvergenceOverlay(undefined, ['lane-1']), null);
});

test('resolveConvergenceOverlay returns null for all known policy kinds in stub', () => {
  const kinds = ['keep_all', 'pick_one', 'synthesize_one', 'promote_one_continue'] as const;
  for (const kind of kinds) {
    assert.equal(resolveConvergenceOverlay(kind, ['lane-1', 'lane-2']), null, `expected null for ${kind}`);
  }
});
