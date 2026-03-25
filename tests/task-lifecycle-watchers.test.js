import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState, upsertCoreTask } from '../dist-server/core/model/index.js';
import { MemoryCoreStore } from '../dist-server/core/store.js';
import {
  checkoutTaskExecution,
  startTaskRunWatcher,
} from '../dist-server/core/taskLifecycle.js';

test('task run watcher persists observed runtime strategy metadata additively', async () => {
  const now = new Date('2026-03-26T05:00:00.000Z');
  const taskWrite = upsertCoreTask(
    createDefaultCoreState(),
    {
      id: 'task-watch',
      title: 'Watch runtime strategy metadata',
      status: 'approved',
      ownerActorId: 'actor-owner',
      assignedActorIds: ['actor-worker'],
      metadata: {},
    },
    now,
  );

  const checkout = checkoutTaskExecution({
    core: taskWrite.core,
    taskId: taskWrite.task.id,
    actorId: 'actor-worker',
    sessionId: 'session-watch',
    executionRequest: {
      requestedStrategy: 'react',
      acceptanceCriteria: 'Complete the task and report outcome.',
      correlation: {
        taskId: taskWrite.task.id,
        product: 'chat',
      },
    },
    now,
  });
  const coreStore = new MemoryCoreStore(checkout.core);
  const strategyState = {
    request: {
      requestedStrategy: 'react',
      acceptanceCriteria: 'Complete the task and report outcome.',
      correlation: {
        taskId: taskWrite.task.id,
        product: 'chat',
      },
    },
    effectiveStrategy: 'react',
    resolutionSource: 'explicit_request',
    summary: {
      status: 'completed',
      stepCount: 2,
      resolutionSource: 'explicit_request',
      updatedAt: '2026-03-26T05:01:00.000Z',
    },
    updatedAt: '2026-03-26T05:01:00.000Z',
  };

  const started = startTaskRunWatcher({
    coreStore,
    runtimeClient: {
      async observeSession() {
        return {
          session: {
            id: 'session-watch',
            inspection: {
              state: 'idle',
              strategy: {
                requestedStrategy: 'react',
                effectiveStrategy: 'react',
                acceptanceCriteria: 'Complete the task and report outcome.',
                correlation: {
                  taskId: taskWrite.task.id,
                  product: 'chat',
                },
                state: strategyState,
              },
              lastRun: {
                id: 'runtime-run-watch',
                status: 'succeeded',
                startedAt: '2026-03-26T05:00:00.000Z',
                endedAt: '2026-03-26T05:01:00.000Z',
                resultSummary: 'Task completed successfully.',
              },
            },
          },
          observePath: '/sessions/session-watch/observe',
          stream: {
            path: '/sessions/session-watch/stream',
            available: false,
          },
        };
      },
      async streamSession() {},
    },
    taskId: checkout.task.id,
    runId: checkout.run.id,
    sessionId: 'session-watch',
    actorId: 'actor-worker',
    now: () => new Date('2026-03-26T05:01:00.000Z'),
  });

  assert.equal(started, true);
  await new Promise((resolve) => setTimeout(resolve, 10));

  const core = await coreStore.readCore();
  const task = core.tasks.find((candidate) => candidate.id === checkout.task.id);
  const run = core.runs.find((candidate) => candidate.id === checkout.run.id);

  assert.equal(task?.status, 'completed');
  assert.equal(run?.status, 'completed');
  assert.equal(run?.metadata.execution.requestedStrategy, 'react');
  assert.equal(run?.metadata.execution.effectiveStrategy, 'react');
  assert.equal(run?.metadata.execution.strategyState.summary.status, 'completed');
  assert.equal(task?.metadata.taskLifecycle.execution.requestedStrategy, 'react');
  assert.equal(task?.metadata.taskLifecycle.execution.effectiveStrategy, 'react');
  assert.equal(
    task?.metadata.taskLifecycle.execution.strategyState.summary.stepCount,
    2,
  );
});
