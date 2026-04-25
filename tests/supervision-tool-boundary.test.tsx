import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SUPERVISION_SCHEMA_VERSION,
  createInMemoryToolEvidenceSink,
  createSupervisedToolRegistry,
  createToolBoundary,
  type SupervisedToolManifest,
} from '../src/platform/supervision/index.ts';

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
