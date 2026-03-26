import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runStartupRecoveryPasses,
} from '../dist-server/app/server/startupRecovery.js';

test('runStartupRecoveryPasses executes startup recovery in order', async () => {
  const order = [];

  await runStartupRecoveryPasses([
    async () => {
      order.push('polling:start');
      await Promise.resolve();
      order.push('polling:end');
    },
    async () => {
      order.push('chat:start');
      await Promise.resolve();
      order.push('chat:end');
    },
    async () => {
      order.push('orchestrator:start');
      await Promise.resolve();
      order.push('orchestrator:end');
    },
  ]);

  assert.deepEqual(order, [
    'polling:start',
    'polling:end',
    'chat:start',
    'chat:end',
    'orchestrator:start',
    'orchestrator:end',
  ]);
});

test('runStartupRecoveryPasses continues after a failed startup recovery pass', async () => {
  const order = [];

  await runStartupRecoveryPasses([
    async () => {
      order.push('polling');
    },
    async () => {
      order.push('chat');
      throw new Error('chat recovery failed');
    },
    async () => {
      order.push('orchestrator');
    },
  ]);

  assert.deepEqual(order, [
    'polling',
    'chat',
    'orchestrator',
  ]);
});
