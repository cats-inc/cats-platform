import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInMemoryToolEvidenceSink,
  createInMemoryWorkSupervisedTools,
  createSupervisedToolRegistry,
  createToolBoundary,
} from '../src/platform/supervision/index.ts';

function createHarness() {
  const registry = createSupervisedToolRegistry();
  const evidenceSink = createInMemoryToolEvidenceSink();
  const tools = createInMemoryWorkSupervisedTools({
    context: {
      'run.goal': 'Ship supervision slice',
    },
  });
  tools.register(registry);
  const boundary = createToolBoundary({
    registry,
    evidenceSink,
    now: () => '2026-04-25T04:00:00.000Z',
  });

  return { registry, evidenceSink, tools, boundary };
}

test('work.context.lookup reads Work projection context', async () => {
  const { boundary, tools } = createHarness();

  const result = await boundary.invoke({
    toolName: 'work.context.lookup',
    input: { key: 'run.goal' },
    actionId: 'action-lookup',
    runId: 'run-1',
    actorRef: 'agent:boss',
    grant: {
      parentToolScope: 'read_only',
      policyToolScope: 'read_only',
    },
    execute: tools.executors['work.context.lookup'],
  });

  assert.equal(result.status, 'applied');
  assert.deepEqual(result.result, {
    key: 'run.goal',
    found: true,
    value: 'Ship supervision slice',
  });
});

test('work.local_note.apply lands local-state note mutations', async () => {
  const { boundary, tools } = createHarness();

  const result = await boundary.invoke({
    toolName: 'work.local_note.apply',
    input: { noteId: 'note-1', body: 'Draft note' },
    actionId: 'action-note',
    runId: 'run-1',
    actorRef: 'agent:boss',
    grant: {
      parentToolScope: 'narrow_write',
      policyToolScope: 'narrow_write',
    },
    execute: tools.executors['work.local_note.apply'],
  });

  assert.equal(result.status, 'applied');
  assert.deepEqual(tools.state.notes.get('note-1'), {
    noteId: 'note-1',
    body: 'Draft note',
  });
});

test('work.approval_gated.apply returns pending approval before mutation lands', async () => {
  const { boundary, tools, evidenceSink } = createHarness();

  const result = await boundary.invoke({
    toolName: 'work.approval_gated.apply',
    input: { value: 'external-change' },
    actionId: 'action-approval',
    runId: 'run-1',
    actorRef: 'agent:boss',
    grant: {
      parentToolScope: 'broad_write',
      policyToolScope: 'broad_write',
    },
    execute: tools.executors['work.approval_gated.apply'],
  });

  assert.equal(result.status, 'pending_approval');
  assert.equal(result.requestId, 'run-1:action-approval:approval');
  assert.deepEqual(tools.state.approvalMutations, []);
  assert.equal(evidenceSink.read()[0]?.status, 'pending_approval');
});

test('approved approval-gated retry applies idempotently', async () => {
  const { boundary, tools } = createHarness();
  const invocation = {
    toolName: 'work.approval_gated.apply',
    input: { value: 'external-change' },
    actionId: 'action-approval',
    runId: 'run-1',
    actorRef: 'agent:boss',
    grant: {
      parentToolScope: 'broad_write' as const,
      policyToolScope: 'broad_write' as const,
    },
    execute: tools.executors['work.approval_gated.apply'],
  };

  const pending = await boundary.invoke(invocation);
  assert.equal(pending.status, 'pending_approval');
  tools.approve(pending.requestId);

  const applied = await boundary.invoke(invocation);
  const repeated = await boundary.invoke(invocation);

  assert.equal(applied.status, 'applied');
  assert.equal(repeated.status, 'applied');
  assert.deepEqual(applied.result, repeated.result);
  assert.deepEqual(tools.state.approvalMutations, [
    {
      requestId: 'run-1:action-approval:approval',
      value: 'external-change',
    },
  ]);
});

test('denied approval retry returns E_APPROVAL_DENIED', async () => {
  const { boundary, tools } = createHarness();
  const invocation = {
    toolName: 'work.approval_gated.apply',
    input: { value: 'external-change' },
    actionId: 'action-approval',
    runId: 'run-1',
    actorRef: 'agent:boss',
    grant: {
      parentToolScope: 'broad_write' as const,
      policyToolScope: 'broad_write' as const,
    },
    execute: tools.executors['work.approval_gated.apply'],
  };

  const pending = await boundary.invoke(invocation);
  assert.equal(pending.status, 'pending_approval');
  tools.deny(pending.requestId);

  const rejected = await boundary.invoke(invocation);

  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.error.code, 'E_APPROVAL_DENIED');
});

test('cancelled run rejects approval-gated tool calls with E_RUN_CANCELLED', async () => {
  const { boundary, tools } = createHarness();
  tools.cancelRun('run-1');

  const result = await boundary.invoke({
    toolName: 'work.approval_gated.apply',
    input: { value: 'external-change' },
    actionId: 'action-approval',
    runId: 'run-1',
    actorRef: 'agent:boss',
    grant: {
      parentToolScope: 'broad_write',
      policyToolScope: 'broad_write',
    },
    execute: tools.executors['work.approval_gated.apply'],
  });

  assert.equal(result.status, 'rejected');
  assert.equal(result.error.code, 'E_RUN_CANCELLED');
  assert.deepEqual(tools.state.approvalMutations, []);
});

test('work.sop.classify_text_batch uses strict schema and no downstream tool scope', async () => {
  const { boundary, tools } = createHarness();
  const manifest = tools.manifests.find((tool) => tool.name === 'work.sop.classify_text_batch');

  const result = await boundary.invoke({
    toolName: 'work.sop.classify_text_batch',
    input: {
      items: [
        { id: 'item-1', text: 'This needs legal review.' },
        { id: 'item-2', text: 'Engineering follow-up.' },
      ],
      labels: ['legal', 'engineering'],
    },
    actionId: 'action-sop',
    runId: 'run-1',
    actorRef: 'agent:boss',
    grant: {
      parentToolScope: 'read_only',
      policyToolScope: 'read_only',
    },
    execute: tools.executors['work.sop.classify_text_batch'],
  });

  assert.equal(tools.sopWorkerProfile.toolScope, 'none');
  assert.deepEqual(tools.sopWorkerProfile.budget, {
    maxDurationMs: 1000,
    maxTokens: 1024,
    hardStop: true,
  });
  assert.deepEqual(manifest?.maxBudgetHint, tools.sopWorkerProfile.budget);
  assert.equal(result.status, 'applied');
  assert.deepEqual(result.result.classifications.map((classification) => classification.label), [
    'legal',
    'engineering',
  ]);
});

test('work.sop.classify_text_batch rejects invalid schema before result reaches agent', async () => {
  const { boundary, tools } = createHarness();

  const result = await boundary.invoke({
    toolName: 'work.sop.classify_text_batch',
    input: {
      items: [{ id: '', text: 'No id' }],
      labels: [],
    },
    actionId: 'action-sop-invalid',
    runId: 'run-1',
    actorRef: 'agent:boss',
    grant: {
      parentToolScope: 'read_only',
      policyToolScope: 'read_only',
    },
    execute: tools.executors['work.sop.classify_text_batch'],
  });

  assert.equal(result.status, 'rejected');
  assert.equal(result.error.code, 'E_SCHEMA_INVALID');
});
