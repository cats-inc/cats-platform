import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveWorkExecutionPreparationPhase,
} from '../src/products/work/shared/workExecutionPreparationPhase.js';

test('execution-preparation resolver matches Boss Cat requests over visible Work Items', () => {
  const result = resolveWorkExecutionPreparationPhase({
    rawText: 'Boss Cat 幫忙逐一開工這些待辦事項',
    visibleWorkItemIds: ['work-item-intake-1', 'work-item-intake-2'],
  });

  assert.equal(result.kind, 'matched');
  assert.equal(result.phase, 'execution_preparation');
  assert.equal(result.scope, 'visible_selection');
  assert.equal(result.confidence, 'high');
  assert.deepEqual(result.workItemRefs, ['work-item-intake-1', 'work-item-intake-2']);
});

test('execution-preparation resolver extracts explicit Work Item refs', () => {
  const result = resolveWorkExecutionPreparationPhase({
    rawText: 'Boss Cat, start working through work-item-alpha and work-item-beta.',
  });

  assert.equal(result.kind, 'matched');
  assert.equal(result.reasonCode, 'explicit_work_items_execution_request');
  assert.deepEqual(result.workItemRefs, ['work-item-alpha', 'work-item-beta']);
});

test('execution-preparation resolver can use an addressed Boss Cat signal', () => {
  const result = resolveWorkExecutionPreparationPhase({
    rawText: 'Please start working through these tasks.',
    addressedBossCat: true,
    activeWorkItemIds: ['work-item-active-1'],
  });

  assert.equal(result.kind, 'matched');
  assert.equal(result.scope, 'active_context');
  assert.deepEqual(result.workItemRefs, ['work-item-active-1']);
});

test('execution-preparation resolver rejects non-Boss or non-execution messages', () => {
  assert.deepEqual(resolveWorkExecutionPreparationPhase({
    rawText: 'Please capture this as a todo.',
    visibleWorkItemIds: ['work-item-1'],
  }), {
    kind: 'none',
    phase: null,
    reasonCode: 'missing_boss_cat_address',
    normalizedText: 'please capture this as a todo.',
  });

  assert.deepEqual(resolveWorkExecutionPreparationPhase({
    rawText: '/work create a planning item',
    addressedBossCat: true,
    visibleWorkItemIds: ['work-item-1'],
  }), {
    kind: 'none',
    phase: null,
    reasonCode: 'slash_command',
    normalizedText: '/work create a planning item',
  });
});
