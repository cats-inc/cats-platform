import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInMemoryToolEvidenceSink,
  createInMemoryWorkSupervisedTools,
  createSupervisedToolRegistry,
  createToolBoundary,
} from '../src/platform/supervision/index.ts';
import type { SchemaRef } from '../src/platform/supervision/contracts.ts';

const EXPECTED_OUTPUT_SCHEMA: SchemaRef = {
  id: 'work.sop.ask_weak.answer',
  version: '1.0',
  format: 'json_schema',
};

function createHarness() {
  const registry = createSupervisedToolRegistry();
  const evidenceSink = createInMemoryToolEvidenceSink();
  const tools = createInMemoryWorkSupervisedTools();
  tools.register(registry);
  const boundary = createToolBoundary({
    registry,
    evidenceSink,
    now: () => '2026-04-28T04:00:00.000Z',
  });

  return { registry, evidenceSink, tools, boundary };
}

function askWeakInput(overrides: Record<string, unknown> = {}) {
  return {
    question: 'Classify the operator request into the expected schema.',
    expectedOutputSchemaRef: EXPECTED_OUTPUT_SCHEMA,
    allowedToolNames: [],
    budget: {
      maxDurationMs: 1000,
      maxTokens: 512,
      hardStop: true,
    },
    ...overrides,
  };
}

test('work.sop.ask_weak is registered as a narrow first-slice weak-worker tool', () => {
  const { registry, tools } = createHarness();
  const manifest = registry.get('work.sop.ask_weak');

  assert.ok(manifest);
  assert.equal(manifest.sideEffect, 'none');
  assert.equal(manifest.preflight, 'required');
  assert.equal(manifest.approval, 'never');
  assert.deepEqual(manifest.maxBudgetHint, {
    maxDurationMs: 5000,
    maxTokens: 2048,
    hardStop: true,
  });
  assert.ok(tools.manifests.some((tool) => tool.name === 'work.sop.ask_weak'));
});

test('work.sop.ask_weak applies structured output without downstream tool autonomy', async () => {
  const { boundary, tools, evidenceSink } = createHarness();

  const result = await boundary.invoke({
    toolName: 'work.sop.ask_weak',
    input: askWeakInput(),
    actionId: 'action-ask-weak',
    runId: 'run-weak-worker',
    actorRef: 'agent:strong-driver',
    grant: {
      parentToolScope: 'read_only',
      policyToolScope: 'read_only',
    },
    execute: tools.executors['work.sop.ask_weak'],
  });

  assert.equal(result.status, 'applied');
  assert.deepEqual(result.result.schemaRef, EXPECTED_OUTPUT_SCHEMA);
  assert.deepEqual(result.result.scaffold, {
    templateId: 'work.sop.ask_weak.v1',
    retryLimit: 0,
    confidenceThreshold: 0.4,
    escalationTarget: 'strong_driver',
    expectedOutputSchemaRef: EXPECTED_OUTPUT_SCHEMA,
  });
  assert.deepEqual(result.result.allowedToolNames, []);
  assert.deepEqual(result.result.suggestedToolNames, []);
  assert.equal(evidenceSink.read()[0]?.toolName, 'work.sop.ask_weak');
});

test('work.sop.ask_weak rejects non-empty first-slice tool subgrants', async () => {
  const { boundary, tools } = createHarness();

  const result = await boundary.invoke({
    toolName: 'work.sop.ask_weak',
    input: askWeakInput({ allowedToolNames: ['work.context.lookup'] }),
    actionId: 'action-ask-weak-tools',
    runId: 'run-weak-worker',
    actorRef: 'agent:strong-driver',
    grant: {
      parentToolScope: 'read_only',
      policyToolScope: 'read_only',
    },
    execute: tools.executors['work.sop.ask_weak'],
  });

  assert.equal(result.status, 'rejected');
  assert.equal(result.error.code, 'E_TOOL_SCOPE_DENIED');
});

test('work.sop.ask_weak rejects invalid schema before result reaches the driver', async () => {
  const { boundary, tools } = createHarness();

  const result = await boundary.invoke({
    toolName: 'work.sop.ask_weak',
    input: askWeakInput({
      expectedOutputSchemaRef: {
        id: '',
        version: '1.0',
        format: 'json_schema',
      },
    }),
    actionId: 'action-ask-weak-invalid',
    runId: 'run-weak-worker',
    actorRef: 'agent:strong-driver',
    grant: {
      parentToolScope: 'read_only',
      policyToolScope: 'read_only',
    },
    execute: tools.executors['work.sop.ask_weak'],
  });

  assert.equal(result.status, 'rejected');
  assert.equal(result.error.code, 'E_SCHEMA_INVALID');
});
