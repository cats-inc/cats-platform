import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runStartupRecoveryPasses,
  runServerStartupRecoveryPasses,
} from '../build/server/app/server/startupRecovery.js';

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

test('runServerStartupRecoveryPasses reconciles commands and pending golden-path deliveries', async () => {
  const calls = [];
  const chatStore = {
    async read() {
      return {
        bossCatId: null,
        cats: [],
        channels: [],
      };
    },
    async readCore() {
      return {
        tasks: [],
        activities: [],
        botBindings: [],
      };
    },
    async write(state) {
      return state;
    },
    async writeCore(core) {
      return core;
    },
  };

  await runServerStartupRecoveryPasses({
    shared: {
      now: () => new Date('2026-03-30T00:00:00.000Z'),
      coreStore: chatStore,
      runtimeClient: {},
      startup: {},
      resumePendingOrchestratorDispatch: async () => {
        throw new Error('not used');
      },
      resumeWorkflowContinuationDispatch: async () => {
        throw new Error('not used');
      },
    },
    chat: {
      chatStore,
      companionStore: {},
      orchestratorChannelRouter: {},
      orchestratorPlannerSurface: {},
      taskExecutionLocator: {},
      memoryStore: {},
      memoryService: {},
      telegramRelay: {},
      telegramRoomBridge: {},
      pollingSupervisor: {
        async reconcilePolling() {},
      },
      telegramCommandSurfaceSync: {
        async reconcile() {
          calls.push('telegram-command-surface');
        },
      },
      transportWorkGoldenPath: {
        outbox: {
          async recoverPending() {
            calls.push('golden-path-deliveries');
          },
        },
        runner: null,
      },
      eventHub: {},
    },
    work: {},
    code: {},
  });

  assert.deepEqual(calls, ['telegram-command-surface', 'golden-path-deliveries']);
});
