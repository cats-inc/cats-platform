import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryCoreStore } from '../src/core/store.ts';
import {
  DEFAULT_SUPERVISION_SCHEMA_VERSION,
  createSupervisionPolicySnapshotRef,
  persistSupervisionPolicySnapshot,
  type SupervisionPolicySnapshot,
} from '../src/platform/supervision/index.ts';

function policySnapshot(): SupervisionPolicySnapshot {
  return {
    schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION,
    policyBundleVersion: 'test-policy@1',
    dialVersions: {
      toolScope: 'tool-scope@1',
    },
    evaluatedAt: '2026-04-25T10:00:00.000Z',
    actionId: 'action-policy-1',
    runId: 'run-policy-1',
    actorRef: 'agent:boss',
    policy: {
      autonomy: 'single_step',
      taskGranularity: 'step',
      toolScope: 'read_only',
      scaffolding: 'few_shot',
      validation: 'schema_required',
      checkpointCadence: 'every_step',
      approvalThreshold: 'medium',
      fallbackPolicy: 'retry',
    },
    contextSummary: {
      actorRef: 'agent:boss',
      targetRef: 'work-item:1',
      actionType: 'tool_call',
      sideEffect: 'none',
      bootstrapTreatment: 'default',
      capabilityConfidence: 'catalog_only',
    },
    reasons: ['catalog_only capability starts conservative'],
  };
}

test('policy snapshots persist as execution traces with durable refs', async () => {
  const coreStore = new MemoryCoreStore();
  const snapshot = policySnapshot();

  const result = await persistSupervisionPolicySnapshot({
    coreStore,
    snapshot,
    conversationId: 'conversation-policy-1',
    taskId: 'task-policy-1',
    now: () => new Date('2026-04-25T10:01:00.000Z'),
  });
  const core = await coreStore.readCore();
  const trace = core.traces[0];

  assert.deepEqual(result.snapshotRef, {
    snapshotId:
      'policy-snapshot:run-policy-1:action-policy-1:test-policy@1:' +
      '2026-04-25T10:00:00.000Z',
    policyBundleVersion: 'test-policy@1',
    actionId: 'action-policy-1',
    runId: 'run-policy-1',
  });
  assert.equal(trace?.id, result.snapshotRef.snapshotId);
  assert.equal(trace?.kind, 'status');
  assert.equal(trace?.traceId, 'supervision-policy:run-policy-1');
  assert.equal(trace?.conversationId, 'conversation-policy-1');
  assert.equal(trace?.runId, 'run-policy-1');
  assert.equal(trace?.taskId, 'task-policy-1');
  assert.equal(trace?.actorId, 'agent:boss');
  assert.equal(trace?.createdAt, '2026-04-25T10:00:00.000Z');
  assert.equal(trace?.metadata.source, 'supervision_policy_snapshot');
  assert.deepEqual(trace?.metadata.snapshotRef, result.snapshotRef);
  assert.deepEqual(trace?.metadata.snapshot, snapshot);
  assert.deepEqual(result.trace, trace);
  assert.deepEqual(result.core, core);
});

test('policy snapshot refs are deterministic for evidence linkage', () => {
  const ref = createSupervisionPolicySnapshotRef(policySnapshot());

  assert.deepEqual(ref, {
    snapshotId:
      'policy-snapshot:run-policy-1:action-policy-1:test-policy@1:' +
      '2026-04-25T10:00:00.000Z',
    policyBundleVersion: 'test-policy@1',
    actionId: 'action-policy-1',
    runId: 'run-policy-1',
  });
});
