import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chatLifecycleClassName,
  chatLifecycleLabel,
  resolveChatLifecycleState,
} from '../src/products/shared/lifecycle.ts';

test('chat lifecycle state resolver maps runtime lease statuses onto the shared UI state vocabulary', () => {
  assert.equal(resolveChatLifecycleState('ready'), 'awake');
  assert.equal(resolveChatLifecycleState('initializing'), 'waking_up');
  assert.equal(resolveChatLifecycleState('error'), 'error');
  assert.equal(resolveChatLifecycleState('not_started'), 'sleeping');
  assert.equal(resolveChatLifecycleState(null), 'sleeping');
  assert.equal(resolveChatLifecycleState(undefined), 'sleeping');
});

test('chat lifecycle labels and class names stay aligned with the shared state vocabulary', () => {
  assert.equal(chatLifecycleLabel('awake'), 'Awake');
  assert.equal(chatLifecycleLabel('waking_up'), 'Waking up');
  assert.equal(chatLifecycleLabel('error'), 'Needs attention');
  assert.equal(chatLifecycleLabel('sleeping'), 'Sleeping');

  assert.equal(chatLifecycleClassName('awake'), 'isAwake');
  assert.equal(chatLifecycleClassName('waking_up'), 'isWaking');
  assert.equal(chatLifecycleClassName('error'), 'isErrored');
  assert.equal(chatLifecycleClassName('sleeping'), 'isSleeping');
});
