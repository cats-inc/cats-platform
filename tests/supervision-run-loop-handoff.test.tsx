import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decideRunLoopHandoff,
  type DecideRunLoopHandoffInput,
} from '../src/platform/supervision/index.ts';

test('run-loop handoff returns provider responses to the provider-agent seam by reference', () => {
  const handoff = decideRunLoopHandoff({
    runId: 'run-1',
    actionId: 'action-provider-response',
    primaryState: 'running',
    nextTarget: 'provider_agent_seam',
    observationRef: {
      refId: 'observation-provider-1',
      source: 'provider_response',
      evidenceRef: 'evidence-provider-1',
      summaryRef: 'summary-provider-1',
    },
  });

  assert.deepEqual(handoff, {
    kind: 'provider_agent_seam',
    runId: 'run-1',
    actionId: 'action-provider-response',
    observationRef: {
      refId: 'observation-provider-1',
      source: 'provider_response',
      evidenceRef: 'evidence-provider-1',
      summaryRef: 'summary-provider-1',
    },
  });
  assert.equal(Object.hasOwn(handoff, 'responseText'), false);
});

test('run-loop handoff can return weak-worker results to the weak-worker tool boundary', () => {
  const handoff = decideRunLoopHandoff({
    runId: 'run-2',
    actionId: 'action-weak-worker',
    primaryState: 'running',
    nextTarget: 'weak_worker_tool_boundary',
    weakWorkerToolName: 'work.sop.ask_weak',
    observationRef: {
      refId: 'observation-weak-1',
      source: 'weak_worker_result',
      evidenceRef: 'evidence-weak-1',
      resultStatus: 'applied',
    },
  });

  assert.deepEqual(handoff, {
    kind: 'weak_worker_tool_boundary',
    runId: 'run-2',
    actionId: 'action-weak-worker',
    toolName: 'work.sop.ask_weak',
    observationRef: {
      refId: 'observation-weak-1',
      source: 'weak_worker_result',
      evidenceRef: 'evidence-weak-1',
      resultStatus: 'applied',
    },
  });
});

test('run-loop handoff returns terminal state without asking for semantic continuation', () => {
  const handoff = decideRunLoopHandoff({
    runId: 'run-3',
    actionId: 'action-terminal',
    primaryState: 'failed',
  });

  assert.deepEqual(handoff, {
    kind: 'terminal',
    runId: 'run-3',
    actionId: 'action-terminal',
    primaryState: 'failed',
  });
});

test('run-loop handoff rejects observation refs that carry raw response content', () => {
  const input = {
    runId: 'run-4',
    actionId: 'action-raw-response',
    primaryState: 'running',
    nextTarget: 'provider_agent_seam',
    observationRef: {
      refId: 'observation-raw-1',
      source: 'provider_response',
      responseText: 'The provider response belongs in evidence, not the scheduler.',
    },
  } as unknown as DecideRunLoopHandoffInput;

  assert.throws(
    () => decideRunLoopHandoff(input),
    /metadata-only; forbidden keys: responseText/u,
  );
});
