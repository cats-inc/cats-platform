import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSupervisedRunLifecycleService,
} from '../src/platform/supervision/index.ts';

function createClock(): () => Date {
  let tick = 0;
  return () => new Date(`2026-04-28T00:00:0${tick++}.000Z`);
}

test('supervised run lifecycle service derives queued and running states without content input', () => {
  const service = createSupervisedRunLifecycleService({ now: createClock() });
  const queued = service.create({ runId: 'run-1' });
  const running = service.transition(queued, { lifecycle: 'active' });

  assert.equal(queued.primaryState, 'queued');
  assert.equal(running.primaryState, 'running');
  assert.equal(running.createdAt, '2026-04-28T00:00:00.000Z');
  assert.equal(running.updatedAt, '2026-04-28T00:00:01.000Z');
});

test('supervised run lifecycle service derives waiting and blocked states from metadata', () => {
  const service = createSupervisedRunLifecycleService({ now: createClock() });
  const running = service.create({ runId: 'run-2', lifecycle: 'active' });
  const waiting = service.transition(running, {
    approvalRequests: [
      {
        requestId: 'approval-1',
        state: 'pending',
        gating: true,
      },
    ],
  });
  const blocked = service.transition(waiting, {
    approvalRequests: [],
    blockers: [
      {
        code: 'BUDGET_SOFT_LIMIT',
        message: 'Budget is near limit.',
      },
    ],
  });

  assert.equal(waiting.primaryState, 'waiting_for_approval');
  assert.equal(blocked.primaryState, 'blocked');
  assert.deepEqual(blocked.blockers.map((blocker) => blocker.code), ['BUDGET_SOFT_LIMIT']);
});

test('supervised run lifecycle service persists terminal state snapshots', () => {
  const service = createSupervisedRunLifecycleService({ now: createClock() });
  const running = service.create({
    runId: 'run-3',
    lifecycle: 'active',
    metadata: {
      unrelated: true,
    },
  });
  const failed = service.transition(running, {
    lifecycle: 'failed',
    terminalCause: 'no fallback policy option remains',
  });

  const supervision = failed.metadata.supervision as Record<string, unknown>;
  const runState = supervision.runState as Record<string, unknown>;

  assert.equal(failed.primaryState, 'failed');
  assert.equal(failed.terminalCause, 'no fallback policy option remains');
  assert.equal(failed.metadata.unrelated, true);
  assert.equal(runState.primaryState, 'failed');
  assert.equal(runState.terminalCause, 'no fallback policy option remains');
});
