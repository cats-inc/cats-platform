import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DEFAULT_SUPERVISION_SCHEMA_VERSION,
  buildCancellationContext,
  createDurableToolEvidenceSink,
  createInMemoryToolEvidenceSink,
  createSupervisedToolRegistry,
  createToolBoundary,
  type SupervisedToolManifest,
  type SupervisionPolicySnapshot,
} from '../src/platform/supervision/index.ts';
import {
  readEvidenceEvents,
} from '../src/platform/persistence/evidence.ts';

function manifest(name: string, sideEffect: SupervisedToolManifest['sideEffect']): SupervisedToolManifest {
  return {
    schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION,
    name,
    manifestVersion: '1.0',
    description: `${name} fixture`,
    sideEffect,
    preflight: sideEffect === 'none' ? 'available' : 'required',
    blocking: 'blocking',
    cancellation: 'cooperative',
    approval: sideEffect === 'none' ? 'never' : 'policy',
    evidence: 'summary',
    failureCodes: sideEffect === 'none' ? [] : ['E_PRECHECK_FAILED'],
    inputSchema: {
      id: `${name}.input`,
      version: '1.0',
      format: 'json_schema',
    },
    outputSchema: {
      id: `${name}.output`,
      version: '1.0',
      format: 'json_schema',
    },
  };
}

function createFixtureBoundary() {
  const registry = createSupervisedToolRegistry();
  const evidenceSink = createInMemoryToolEvidenceSink();
  const boundary = createToolBoundary({
    registry,
    evidenceSink,
    now: () => '2026-04-25T03:00:00.000Z',
  });

  return { registry, evidenceSink, boundary };
}

function policySnapshot(): SupervisionPolicySnapshot {
  return {
    schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION,
    policyBundleVersion: 'test-policy@1',
    evaluatedAt: '2026-04-25T08:00:00.000Z',
    actionId: 'policy-action',
    runId: 'run-1',
    actorRef: 'agent:boss',
    policy: {
      autonomy: 'single_step',
      taskGranularity: 'step',
      toolScope: 'read_only',
      scaffolding: 'few_shot',
      validation: 'schema_required',
      checkpointCadence: 'every_step',
      approvalThreshold: 'low',
      fallbackPolicy: 'retry',
    },
    contextSummary: {
      actorRef: 'agent:boss',
      targetRef: 'tool:lookup',
      actionType: 'tool_call',
      sideEffect: 'none',
      capabilityConfidence: 'catalog_only',
    },
    reasons: ['test policy'],
  };
}

test('tool boundary returns applied results and records evidence', async () => {
  const { registry, evidenceSink, boundary } = createFixtureBoundary();
  registry.register(manifest('work.context.lookup', 'none'));

  const result = await boundary.invoke({
    toolName: 'work.context.lookup',
    input: { id: 'ctx-1' },
    actionId: 'action-1',
    runId: 'run-1',
    actorRef: 'agent:boss',
    grant: {
      parentToolScope: 'read_only',
      policyToolScope: 'read_only',
    },
    execute: (input: { id: string }) => ({
      status: 'applied',
      result: { found: input.id },
    }),
  });

  assert.equal(result.status, 'applied');
  assert.deepEqual(result.result, { found: 'ctx-1' });
  assert.deepEqual(evidenceSink.read().map((event) => event.status), ['applied']);
});

test('tool boundary rejects unauthorized tools before executing handlers', async () => {
  const { registry, evidenceSink, boundary } = createFixtureBoundary();
  registry.register(manifest('work.local_note.apply', 'local_state'));
  let executed = false;

  const result = await boundary.invoke({
    toolName: 'work.local_note.apply',
    input: { note: 'draft' },
    actionId: 'action-2',
    runId: 'run-1',
    actorRef: 'agent:boss',
    grant: {
      parentToolScope: 'read_only',
      policyToolScope: 'broad_write',
    },
    execute: () => {
      executed = true;
      return { status: 'applied', result: { ok: true } };
    },
  });

  assert.equal(executed, false);
  assert.equal(result.status, 'rejected');
  assert.equal(result.error.code, 'E_TOOL_SCOPE_DENIED');
  assert.deepEqual(evidenceSink.read().map((event) => event.rejectionCode), [
    'E_TOOL_SCOPE_DENIED',
  ]);
});

test('tool boundary preserves pending approval and records no applied evidence', async () => {
  const { registry, evidenceSink, boundary } = createFixtureBoundary();
  registry.register(manifest('work.approval_gated.apply', 'external_visible'));
  let mutationLanded = false;

  const result = await boundary.invoke({
    toolName: 'work.approval_gated.apply',
    input: { value: 'proposed' },
    actionId: 'action-3',
    runId: 'run-1',
    actorRef: 'agent:boss',
    grant: {
      parentToolScope: 'broad_write',
      policyToolScope: 'broad_write',
    },
    execute: () => {
      mutationLanded = false;
      return {
        status: 'pending_approval',
        requestId: 'approval-1',
        summary: 'Apply proposed external change.',
      };
    },
  });

  assert.equal(mutationLanded, false);
  assert.equal(result.status, 'pending_approval');
  assert.equal(evidenceSink.read()[0]?.status, 'pending_approval');
  assert.equal(evidenceSink.read()[0]?.summary, 'Apply proposed external change.');
});

test('tool boundary converts thrown executor failures to rejected ToolResult', async () => {
  const { registry, evidenceSink, boundary } = createFixtureBoundary();
  registry.register(manifest('work.context.lookup', 'none'));

  const result = await boundary.invoke({
    toolName: 'work.context.lookup',
    input: {},
    actionId: 'action-4',
    runId: 'run-1',
    actorRef: 'agent:boss',
    grant: {
      parentToolScope: 'read_only',
      policyToolScope: 'read_only',
    },
    execute: () => {
      throw new Error('preflight failed');
    },
  });

  assert.equal(result.status, 'rejected');
  assert.equal(result.error.code, 'E_PRECHECK_FAILED');
  assert.equal(result.error.message, 'preflight failed');
  assert.equal(evidenceSink.read()[0]?.rejectionCode, 'E_PRECHECK_FAILED');
});

test('tool boundary evidence captures actor, policy, tool, and approval metadata', async () => {
  const { registry, evidenceSink, boundary } = createFixtureBoundary();
  registry.register(manifest('work.approval_gated.apply', 'external_visible'));

  const result = await boundary.invoke({
    toolName: 'work.approval_gated.apply',
    input: {},
    actionId: 'action-5',
    runId: 'run-1',
    actorRef: 'agent:boss',
    policySnapshot: policySnapshot(),
    grant: {
      parentToolScope: 'broad_write',
      policyToolScope: 'broad_write',
    },
    execute: () => ({
      status: 'pending_approval',
      requestId: 'approval-5',
      summary: 'Needs approval.',
    }),
  });
  const event = evidenceSink.read()[0];

  assert.equal(result.status, 'pending_approval');
  assert.equal(event?.actorRef, 'agent:boss');
  assert.deepEqual(event?.policySnapshotRef, {
    snapshotId:
      'policy-snapshot:run-1:policy-action:test-policy@1:' +
      '2026-04-25T08:00:00.000Z',
    policyBundleVersion: 'test-policy@1',
    actionId: 'policy-action',
    runId: 'run-1',
  });
  assert.deepEqual(event?.toolManifest, {
    name: 'work.approval_gated.apply',
    manifestVersion: '1.0',
    sideEffect: 'external_visible',
    approval: 'policy',
    evidence: 'summary',
  });
  assert.equal(event?.approvalRequestId, 'approval-5');
});

test('durable tool evidence sink writes boundary evidence into evidence JSONL', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'cats-supervision-evidence-'));
  try {
    const registry = createSupervisedToolRegistry();
    const evidenceSink = createDurableToolEvidenceSink({
      dataDir,
      conversationId: 'conversation-supervision',
      sessionId: 'session-supervision',
    });
    const boundary = createToolBoundary({
      registry,
      evidenceSink,
      now: () => '2026-04-25T09:00:00.000Z',
    });
    registry.register(manifest('work.approval_gated.apply', 'external_visible'));

    const result = await boundary.invoke({
      toolName: 'work.approval_gated.apply',
      input: {},
      actionId: 'action-durable',
      runId: 'run-durable',
      actorRef: 'agent:boss',
      policySnapshot: policySnapshot(),
      grant: {
        parentToolScope: 'broad_write',
        policyToolScope: 'broad_write',
      },
      execute: () => ({
        status: 'pending_approval',
        requestId: 'approval-durable',
        summary: 'Durable approval request.',
      }),
    });

    const events = readEvidenceEvents(dataDir, 'conversation-supervision');
    assert.equal(result.status, 'pending_approval');
    assert.equal(evidenceSink.read().length, 1);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.id, 'run-durable:action-durable:work.approval_gated.apply:2026-04-25T09:00:00.000Z');
    assert.equal(events[0]?.conversationId, 'conversation-supervision');
    assert.equal(events[0]?.sessionId, 'session-supervision');
    assert.equal(events[0]?.kind, 'system_event');
    assert.equal(events[0]?.payload.source, 'supervision_tool_boundary');
    assert.equal(events[0]?.payload.toolName, 'work.approval_gated.apply');
    assert.equal(events[0]?.payload.status, 'pending_approval');
    assert.equal(events[0]?.payload.approvalRequestId, 'approval-durable');
    assert.deepEqual(events[0]?.payload.policySnapshotRef, {
      snapshotId:
        'policy-snapshot:run-1:policy-action:test-policy@1:' +
        '2026-04-25T08:00:00.000Z',
      policyBundleVersion: 'test-policy@1',
      actionId: 'policy-action',
      runId: 'run-1',
    });
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('tool boundary persists cancellation context on late-finishing action evidence', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'cats-supervision-cancel-evidence-'));
  try {
    const registry = createSupervisedToolRegistry();
    const evidenceSink = createDurableToolEvidenceSink({
      dataDir,
      conversationId: 'conversation-cancel',
    });
    const boundary = createToolBoundary({
      registry,
      evidenceSink,
      now: () => '2026-04-25T09:30:00.000Z',
    });
    const toolManifest = manifest('work.local_note.apply', 'local_state');
    const cancellationContext = buildCancellationContext({
      manifest: toolManifest,
      requestedAt: '2026-04-25T09:29:00.000Z',
      requestedBy: 'operator:owner',
      runStateAtRequest: 'running',
      reasonCode: 'operator_decision',
      effectLanded: 'after_cancel_request',
    });
    registry.register(toolManifest);

    const result = await boundary.invoke({
      toolName: 'work.local_note.apply',
      input: { noteId: 'note-1', body: 'late write' },
      actionId: 'action-cancel',
      runId: 'run-cancel',
      actorRef: 'agent:boss',
      cancellationContext,
      grant: {
        parentToolScope: 'narrow_write',
        policyToolScope: 'narrow_write',
      },
      execute: () => ({
        status: 'applied',
        result: { ok: true },
      }),
    });

    const event = evidenceSink.read()[0];
    const events = readEvidenceEvents(dataDir, 'conversation-cancel');
    assert.equal(result.status, 'applied');
    assert.deepEqual(event?.cancellationContext, cancellationContext);
    assert.deepEqual(events[0]?.payload.cancellationContext, cancellationContext);
    assert.equal(
      (events[0]?.payload.cancellationContext as typeof cancellationContext).reasonCode,
      'operator_decision',
    );
    assert.equal(
      (events[0]?.payload.cancellationContext as typeof cancellationContext).toolCancellation,
      'cooperative_requested',
    );
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
