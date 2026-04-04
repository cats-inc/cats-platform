import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveCoreTaskHandoffState,
  taskExecutionProductLabel,
} from '../dist-server/core/taskHandoff.js';

function createTask(overrides = {}) {
  return {
    status: 'draft',
    approval: {
      status: 'not_requested',
    },
    ...overrides,
  };
}

test('resolveCoreTaskHandoffState keeps pending review tasks pending', () => {
  const state = resolveCoreTaskHandoffState({
    task: createTask(),
    targetProduct: 'work',
    currentProduct: 'work',
  });

  assert.equal(state, 'pending_review');
});

test('resolveCoreTaskHandoffState marks current-product work as active_here once approved', () => {
  const state = resolveCoreTaskHandoffState({
    task: createTask({
      status: 'in_progress',
      approval: { status: 'approved' },
    }),
    targetProduct: 'work',
    currentProduct: 'work',
  });

  assert.equal(state, 'active_here');
});

test('resolveCoreTaskHandoffState marks downstream products as ready_for_pickup once approved', () => {
  const state = resolveCoreTaskHandoffState({
    task: createTask({
      status: 'in_progress',
      approval: { status: 'approved' },
    }),
    targetProduct: 'code',
    currentProduct: 'work',
  });

  assert.equal(state, 'ready_for_pickup');
});

test('resolveCoreTaskHandoffState stops rejected tasks and completes terminal tasks', () => {
  assert.equal(resolveCoreTaskHandoffState({
    task: createTask({
      status: 'cancelled',
      approval: { status: 'rejected' },
    }),
    targetProduct: 'chat',
    currentProduct: 'work',
  }), 'stopped');

  assert.equal(resolveCoreTaskHandoffState({
    task: createTask({
      status: 'completed',
      approval: { status: 'approved' },
    }),
    targetProduct: 'chat',
    currentProduct: 'work',
  }), 'completed');
});

test('taskExecutionProductLabel exposes stable short labels for platform products', () => {
  assert.equal(taskExecutionProductLabel('chat'), 'Chat');
  assert.equal(taskExecutionProductLabel('work'), 'Work');
  assert.equal(taskExecutionProductLabel('code'), 'Code');
});
