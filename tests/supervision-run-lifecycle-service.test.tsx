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

test('supervised run lifecycle service applies approval denial through fallback policy', () => {
  const service = createSupervisedRunLifecycleService({ now: createClock() });
  const waiting = service.create({
    runId: 'run-4',
    lifecycle: 'active',
    approvalRequests: [
      {
        requestId: 'approval-1',
        state: 'pending',
        gating: true,
      },
    ],
  });
  const failed = service.denyApproval(waiting, {
    requestId: 'approval-1',
    fallbackPolicy: 'ask_human',
  });

  assert.equal(failed.lifecycle, 'failed');
  assert.equal(failed.primaryState, 'failed');
  assert.equal(failed.approvalRequests[0]?.state, 'denied');
  assert.equal(failed.terminalCause, 'approval denied: approval-1');

  const retryWaiting = service.create({
    runId: 'run-5',
    lifecycle: 'active',
    approvalRequests: [
      {
        requestId: 'approval-1',
        state: 'pending',
        gating: true,
      },
    ],
  });
  const running = service.denyApproval(retryWaiting, {
    requestId: 'approval-1',
    fallbackPolicy: 'retry',
  });

  assert.equal(running.lifecycle, 'active');
  assert.equal(running.primaryState, 'running');
  assert.equal(running.approvalRequests[0]?.state, 'denied');
});

test('supervised run lifecycle service cancels pending approvals with audit metadata', () => {
  const service = createSupervisedRunLifecycleService({ now: createClock() });
  const waiting = service.create({
    runId: 'run-6',
    lifecycle: 'active',
    approvalRequests: [
      {
        requestId: 'approval-1',
        state: 'pending',
        gating: true,
      },
    ],
  });
  const cancelled = service.cancel(waiting, {
    requestedBy: 'operator:owner',
    reasonCode: 'operator_decision',
    reasonNote: 'No longer needed.',
  });

  assert.equal(cancelled.lifecycle, 'cancelled');
  assert.equal(cancelled.primaryState, 'cancelled');
  assert.equal(cancelled.approvalRequests[0]?.state, 'cancelled');
  assert.equal(cancelled.cancelAudit?.requestedAt, '2026-04-28T00:00:01.000Z');
  assert.equal(cancelled.cancelAudit?.requestedBy, 'operator:owner');
  assert.equal(cancelled.cancelAudit?.reasonCode, 'operator_decision');
});

test('supervised run lifecycle service handles soft and hard timeouts', () => {
  const service = createSupervisedRunLifecycleService({ now: createClock() });
  const running = service.create({ runId: 'run-7', lifecycle: 'active' });
  const softTimedOut = service.timeout(running, {
    timeoutId: 'first-response',
    message: 'First response timed out.',
  });
  const hardTimedOut = service.timeout(running, {
    timeoutId: 'hard-stop',
    hardStop: true,
  });

  assert.equal(softTimedOut.lifecycle, 'active');
  assert.equal(softTimedOut.primaryState, 'blocked');
  assert.equal(softTimedOut.blockers[0]?.code, 'TIMEOUT');
  assert.deepEqual(softTimedOut.blockers[0]?.details, { timeoutId: 'first-response' });
  assert.equal(hardTimedOut.lifecycle, 'failed');
  assert.equal(hardTimedOut.primaryState, 'failed');
  assert.equal(hardTimedOut.terminalCause, 'timeout: hard-stop');
});

test('supervised run lifecycle service resumes and retries without semantic recovery', () => {
  const service = createSupervisedRunLifecycleService({ now: createClock() });
  const running = service.create({ runId: 'run-8', lifecycle: 'active' });
  const blocked = service.timeout(running, { timeoutId: 'first-response' });
  const resumed = service.resume(blocked);
  const retried = service.retry(blocked, { reason: 'operator requested retry' });
  const retryMetadata = retried.metadata.supervision as Record<string, unknown>;

  assert.equal(resumed.lifecycle, 'active');
  assert.equal(resumed.primaryState, 'running');
  assert.deepEqual(resumed.blockers, []);
  assert.equal(retried.lifecycle, 'active');
  assert.equal(retried.primaryState, 'running');
  assert.deepEqual(retried.blockers, []);
  assert.deepEqual(retryMetadata.lifecycleRetry, {
    reason: 'operator requested retry',
  });
});
