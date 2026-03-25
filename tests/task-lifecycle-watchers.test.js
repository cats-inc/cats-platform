import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState, upsertCoreTask } from '../dist-server/core/model/index.js';
import { MemoryCoreStore } from '../dist-server/core/store.js';
import {
  checkoutTaskExecution,
  startTaskRunWatcher,
} from '../dist-server/core/taskLifecycle.js';
import {
  readObservedExecutionMetadata,
} from '../dist-server/core/taskLifecycleShared.js';

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

async function waitFor(assertion, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  await assertion();
}

test('observed execution metadata prefers nested runtime strategy state and sanitizes strategy state', () => {
  const observed = readObservedExecutionMetadata({
    session: {
      strategy: {
        request: {
          requestedStrategy: 'react',
          acceptanceCriteria: 'Use the nested request.',
          strategyContext: {
            phase: 'execute',
          },
          correlation: {
            taskId: 'task-watch',
            product: 'chat',
          },
        },
        effectiveStrategy: 'react',
        resolutionSource: 'explicit_request',
        summary: {
          status: 'running',
          stepCount: 1,
        },
        localState: {
          consecutiveDuplicateToolCalls: 2,
        },
        updatedAt: '2026-03-26T05:00:30.000Z',
      },
      requestedStrategy: 'simple_tool_call',
      acceptanceCriteria: 'Use the flat request.',
      strategyContext: {
        phase: 'fallback',
      },
      correlation: {
        taskId: 'task-flat',
        product: 'work',
      },
      inspection: {
        strategy: {
          requestedStrategy: 'pdca',
          effectiveStrategy: 'simple_tool_call',
        },
      },
    },
    observePath: '/sessions/session-watch/observe',
    stream: {
      path: '/sessions/session-watch/stream',
      available: false,
    },
  });

  assert.deepEqual(observed, {
    requestedStrategy: 'react',
    effectiveStrategy: 'react',
    acceptanceCriteria: 'Use the nested request.',
    strategyContext: {
      phase: 'execute',
    },
    correlation: {
      taskId: 'task-watch',
      product: 'chat',
    },
    strategyState: {
      effectiveStrategy: 'react',
      resolutionSource: 'explicit_request',
      updatedAt: '2026-03-26T05:00:30.000Z',
      summary: {
        status: 'running',
        stepCount: 1,
      },
    },
  });
});

test('task run watcher settles execution metadata before live stream teardown', async () => {
  const now = new Date('2026-03-26T05:10:00.000Z');
  const taskWrite = upsertCoreTask(
    createDefaultCoreState(),
    {
      id: 'task-watch-running',
      title: 'Persist running execution metadata early',
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
    sessionId: 'session-watch-running',
    executionRequest: {
      requestedStrategy: 'react',
      acceptanceCriteria: 'Persist strategy metadata before teardown.',
      correlation: {
        taskId: taskWrite.task.id,
        product: 'chat',
      },
    },
    now,
  });
  const coreStore = new MemoryCoreStore(checkout.core);
  const streamGate = createDeferred();
  let observePhase = 'running';

  const started = startTaskRunWatcher({
    coreStore,
    runtimeClient: {
      async observeSession() {
        if (observePhase === 'final') {
          return {
            session: {
              id: 'session-watch-running',
              inspection: {
                state: 'idle',
                strategy: {
                  state: {
                    request: {
                      requestedStrategy: 'react',
                    },
                    effectiveStrategy: 'react',
                    resolutionSource: 'explicit_request',
                    summary: {
                      status: 'completed',
                      stepCount: 2,
                    },
                    updatedAt: '2026-03-26T05:11:00.000Z',
                  },
                },
                lastRun: {
                  id: 'runtime-run-watch-running',
                  status: 'succeeded',
                  startedAt: '2026-03-26T05:10:00.000Z',
                  endedAt: '2026-03-26T05:11:00.000Z',
                  resultSummary: 'Finished after stream teardown.',
                },
              },
            },
            observePath: '/sessions/session-watch-running/observe',
            stream: {
              path: '/sessions/session-watch-running/stream',
              available: true,
            },
          };
        }

        return {
          session: {
            id: 'session-watch-running',
            inspection: {
              state: 'running',
              strategy: {
                state: {
                  request: {
                    requestedStrategy: 'react',
                    acceptanceCriteria: 'Persist strategy metadata before teardown.',
                    correlation: {
                      taskId: taskWrite.task.id,
                      product: 'chat',
                    },
                  },
                  effectiveStrategy: 'react',
                  resolutionSource: 'explicit_request',
                  summary: {
                    status: 'running',
                    stepCount: 1,
                  },
                  updatedAt: '2026-03-26T05:10:30.000Z',
                },
              },
              currentRun: {
                id: 'runtime-run-watch-running',
                status: 'running',
                startedAt: '2026-03-26T05:10:00.000Z',
              },
            },
          },
          observePath: '/sessions/session-watch-running/observe',
          stream: {
            path: '/sessions/session-watch-running/stream',
            available: true,
          },
        };
      },
      async streamSession() {
        await streamGate.promise;
        observePhase = 'final';
      },
    },
    taskId: checkout.task.id,
    runId: checkout.run.id,
    sessionId: 'session-watch-running',
    actorId: 'actor-worker',
    now: () => new Date('2026-03-26T05:11:00.000Z'),
  });

  assert.equal(started, true);
  await waitFor(async () => {
    const core = await coreStore.readCore();
    const run = core.runs.find((candidate) => candidate.id === checkout.run.id);
    const task = core.tasks.find((candidate) => candidate.id === checkout.task.id);
    assert.equal(run?.status, 'running');
    assert.equal(run?.metadata.execution?.effectiveStrategy, 'react');
    assert.equal(
      run?.metadata.execution?.strategyState?.summary?.status,
      'running',
    );
    assert.equal(task?.metadata.taskLifecycle?.execution?.effectiveStrategy, 'react');
  });

  streamGate.resolve();

  await waitFor(async () => {
    const core = await coreStore.readCore();
    const run = core.runs.find((candidate) => candidate.id === checkout.run.id);
    assert.equal(run?.status, 'completed');
  });
});

test('task run watcher skips live stream when initial observe already shows a terminal run', async () => {
  const now = new Date('2026-03-26T05:20:00.000Z');
  const taskWrite = upsertCoreTask(
    createDefaultCoreState(),
    {
      id: 'task-watch-terminal',
      title: 'Short-circuit terminal observe payloads',
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
    sessionId: 'session-watch-terminal',
    executionRequest: {
      requestedStrategy: 'react',
      correlation: {
        taskId: taskWrite.task.id,
        product: 'chat',
      },
    },
    now,
  });
  const coreStore = new MemoryCoreStore(checkout.core);
  let streamCalls = 0;

  const started = startTaskRunWatcher({
    coreStore,
    runtimeClient: {
      async observeSession() {
        return {
          session: {
            id: 'session-watch-terminal',
            inspection: {
              state: 'idle',
              strategy: {
                state: {
                  request: {
                    requestedStrategy: 'react',
                  },
                  effectiveStrategy: 'react',
                  resolutionSource: 'explicit_request',
                  summary: {
                    status: 'completed',
                    stepCount: 1,
                  },
                  updatedAt: '2026-03-26T05:21:00.000Z',
                },
              },
              lastRun: {
                id: 'runtime-run-watch-terminal',
                status: 'succeeded',
                startedAt: '2026-03-26T05:20:00.000Z',
                endedAt: '2026-03-26T05:21:00.000Z',
                resultSummary: 'Completed before stream attach.',
              },
            },
          },
          observePath: '/sessions/session-watch-terminal/observe',
          stream: {
            path: '/sessions/session-watch-terminal/stream',
            available: true,
          },
        };
      },
      async streamSession() {
        streamCalls += 1;
      },
    },
    taskId: checkout.task.id,
    runId: checkout.run.id,
    sessionId: 'session-watch-terminal',
    actorId: 'actor-worker',
    now: () => new Date('2026-03-26T05:21:00.000Z'),
  });

  assert.equal(started, true);
  await waitFor(async () => {
    const core = await coreStore.readCore();
    const run = core.runs.find((candidate) => candidate.id === checkout.run.id);
    assert.equal(run?.status, 'completed');
  });

  const core = await coreStore.readCore();
  const task = core.tasks.find((candidate) => candidate.id === checkout.task.id);
  const run = core.runs.find((candidate) => candidate.id === checkout.run.id);

  assert.equal(streamCalls, 0);
  assert.equal(task?.status, 'completed');
  assert.equal(run?.metadata.execution?.effectiveStrategy, 'react');
  assert.equal(
    run?.metadata.execution?.strategyState?.summary?.status,
    'completed',
  );
});

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
    localState: {
      consecutiveDuplicateToolCalls: 1,
      lastToolCallSignature: 'shell:{"command":"pwd"}',
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
  await waitFor(async () => {
    const core = await coreStore.readCore();
    const run = core.runs.find((candidate) => candidate.id === checkout.run.id);
    assert.equal(run?.status, 'completed');
  });

  const core = await coreStore.readCore();
  const task = core.tasks.find((candidate) => candidate.id === checkout.task.id);
  const run = core.runs.find((candidate) => candidate.id === checkout.run.id);
  const runExecution = run?.metadata.execution;
  const runStrategyState = runExecution?.strategyState;
  const taskExecution = task?.metadata.taskLifecycle.execution;
  const taskStrategyState = taskExecution?.strategyState;

  assert.equal(task?.status, 'completed');
  assert.equal(run?.status, 'completed');
  assert.ok(runExecution);
  assert.ok(runStrategyState);
  assert.ok(taskExecution);
  assert.ok(taskStrategyState);
  assert.equal(runExecution.requestedStrategy, 'react');
  assert.equal(runExecution.effectiveStrategy, 'react');
  assert.equal(runStrategyState.effectiveStrategy, 'react');
  assert.equal(
    runStrategyState.resolutionSource,
    'explicit_request',
  );
  assert.equal(runStrategyState.summary.status, 'completed');
  assert.equal(
    runStrategyState.localState,
    undefined,
  );
  assert.equal(taskExecution.requestedStrategy, 'react');
  assert.equal(taskExecution.effectiveStrategy, 'react');
  assert.equal(
    taskStrategyState.resolutionSource,
    'explicit_request',
  );
  assert.equal(
    taskStrategyState.summary.stepCount,
    2,
  );
  assert.equal(
    taskStrategyState.localState,
    undefined,
  );
});
