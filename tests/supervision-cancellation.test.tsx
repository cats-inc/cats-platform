import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCancellationContext,
  mapManifestCancellationToToolContext,
} from '../src/platform/supervision/index.ts';

test('manifest cancellation maps to cancellation context toolCancellation', () => {
  assert.equal(mapManifestCancellationToToolContext('cooperative'), 'cooperative_requested');
  assert.equal(mapManifestCancellationToToolContext('best_effort'), 'best_effort_requested');
  assert.equal(mapManifestCancellationToToolContext('not_supported'), 'not_supported');
});

test('cancellation context includes mandatory reasonCode and manifest-derived tool context', () => {
  const context = buildCancellationContext({
    manifest: { cancellation: 'best_effort' },
    requestedAt: '2026-04-25T05:00:00.000Z',
    requestedBy: 'operator:owner',
    runStateAtRequest: 'waiting_for_approval',
    reasonCode: 'operator_decision',
    reasonNote: 'Operator cancelled stale approval.',
    effectLanded: 'after_cancel_request',
  });

  assert.deepEqual(context, {
    requestedAt: '2026-04-25T05:00:00.000Z',
    requestedBy: 'operator:owner',
    runStateAtRequest: 'waiting_for_approval',
    toolCancellation: 'best_effort_requested',
    effectLanded: 'after_cancel_request',
    reasonCode: 'operator_decision',
    reasonNote: 'Operator cancelled stale approval.',
  });
});

test('cancellation context defaults to not_applied when no effect has landed', () => {
  const context = buildCancellationContext({
    manifest: { cancellation: 'not_supported' },
    requestedAt: '2026-04-25T05:00:00.000Z',
    requestedBy: 'scheduler:budget',
    runStateAtRequest: 'running',
    reasonCode: 'budget_hard_stop',
  });

  assert.equal(context.toolCancellation, 'not_supported');
  assert.equal(context.effectLanded, 'not_applied');
  assert.equal(context.reasonCode, 'budget_hard_stop');
});
