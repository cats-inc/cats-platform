import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatWorkCorrelation,
  formatWorkDeliveryMode,
  formatWorkExecutionProduct,
  formatWorkExecutionStrategy,
  formatWorkRuntimeBridgeProduct,
  formatWorkTokenList,
} from '../src/products/work/renderer/workExecutionPresentation.ts';

test('work execution presentation maps runtime tokens to UI labels', () => {
  assert.equal(formatWorkExecutionProduct('code'), 'Code');
  assert.equal(formatWorkExecutionProduct('custom_surface'), 'Custom Surface');
  assert.equal(formatWorkExecutionProduct(null), 'Unassigned');

  assert.equal(formatWorkExecutionStrategy('reflexion'), 'Reflexion');
  assert.equal(formatWorkExecutionStrategy('plan-and-execute'), 'Plan And Execute');
  assert.equal(formatWorkExecutionStrategy(''), 'Not specified');

  assert.equal(formatWorkDeliveryMode('commit_only'), 'Commit Only');
  assert.equal(formatWorkDeliveryMode(undefined), 'Not specified');
  assert.equal(formatWorkRuntimeBridgeProduct('work'), 'Work');
  assert.equal(formatWorkRuntimeBridgeProduct(null), 'No runtime bridge');
});

test('work execution presentation formats token lists and runtime correlations', () => {
  assert.equal(
    formatWorkTokenList(['create_commit', 'request_review']),
    'Create Commit, Request Review',
  );
  assert.equal(formatWorkTokenList([], 'Nothing pending'), 'Nothing pending');
  assert.equal(
    formatWorkCorrelation({
      product: 'code',
      workItemId: 'work-item-1',
      conversationId: 'conversation-1',
    }),
    'Code | work-item-1 | conversation-1',
  );
  assert.equal(formatWorkCorrelation(null), 'Not recorded');
});
