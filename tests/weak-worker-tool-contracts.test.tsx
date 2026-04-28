import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCapabilityAssessment,
  createProviderCatalogEvidence,
  createInMemoryToolEvidenceSink,
  createInMemoryWorkSupervisedTools,
  createSupervisedToolRegistry,
  createToolBoundary,
  decideSupervisionPolicy,
} from '../src/platform/supervision/index.ts';
import {
  PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
  validateProviderAgentBoundedObservation,
  type ProviderAgentBoundedObservation,
} from '../src/platform/orchestration/index.ts';
import type {
  CapabilityAssessment,
  SupervisionPolicy,
  SchemaRef,
  SupervisedToolManifest,
} from '../src/platform/supervision/contracts.ts';

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

function catalogOnlyAssessment(): CapabilityAssessment {
  return buildCapabilityAssessment({
    assessedAt: '2026-04-28T04:00:00.000Z',
    bootstrapTreatment: 'weak_worker',
    confidenceSources: [
      createProviderCatalogEvidence({
        providerId: 'ollama',
        modelId: 'llama-small',
        catalogVersion: '2026-04',
        observedAt: '2026-04-28T03:59:00.000Z',
      }),
    ],
  });
}

function weakPolicyContext(toolManifest: SupervisedToolManifest) {
  return {
    actionId: 'action-weak-policy',
    runId: 'run-weak-worker',
    actorRef: 'agent:strong-driver',
    targetRef: 'tool:work.sop.ask_weak',
    providerRef: 'ollama:llama-small',
    actionType: 'tool_call',
    evaluatedAt: '2026-04-28T04:00:00.000Z',
    capabilityAssessment: catalogOnlyAssessment(),
    toolManifest,
  };
}

function providerAgentObservation(input: {
  actorRef: string;
  provider: string;
  model: string;
  policy: SupervisionPolicy;
  tools: SupervisedToolManifest[];
}): ProviderAgentBoundedObservation {
  return {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    observationId: `observation-${input.provider}`,
    runId: 'run-weak-contrast',
    goal: 'Resolve the same high-level work request.',
    task: {
      kind: 'work_run',
      risk: 'medium',
    },
    actor: {
      actorRef: input.actorRef,
      target: {
        kind: 'execution_target',
        provider: input.provider,
        model: input.model,
      },
      capabilityProfileRef: `provider-capability:${input.provider}:${input.model}`,
      providerRef: `provider:${input.provider}`,
    },
    policy: {
      dials: input.policy,
      allowedFallbacks: ['retry', 'ask_human'],
    },
    availableTools: input.tools.map((tool) => ({
      manifest: tool,
      reason: `${tool.name} allowed by policy surface.`,
    })),
    contextRefs: ['work-item:same-request'],
    summaries: [
      {
        key: 'tool_rejection_count',
        kind: 'count',
        value: 0,
      },
    ],
    budget: {
      maxDurationMs: 30_000,
      hardStop: true,
    },
    invariants: ['same seam; policy dials select autonomy'],
  };
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

test('weak capability policy rejects autonomous delegation and open-ended recovery', () => {
  const { registry } = createHarness();
  const manifest = registry.get('work.sop.ask_weak');
  assert.ok(manifest);

  const milestone = decideSupervisionPolicy({
    ...weakPolicyContext(manifest),
    requestedPolicy: {
      autonomy: 'milestone_plan',
    },
  });
  const delegatedRecovery = decideSupervisionPolicy({
    ...weakPolicyContext(manifest),
    requestedPolicy: {
      fallbackPolicy: 'delegate_other',
    },
  });
  const broadWrite = decideSupervisionPolicy({
    ...weakPolicyContext(manifest),
    requestedPolicy: {
      toolScope: 'broad_write',
    },
  });

  assert.equal(milestone.status, 'rejected');
  assert.equal(milestone.error.code, 'E_TOOL_SCOPE_DENIED');
  assert.match(milestone.error.message, /milestone_plan/u);
  assert.equal(delegatedRecovery.status, 'rejected');
  assert.equal(delegatedRecovery.error.code, 'E_TOOL_SCOPE_DENIED');
  assert.match(delegatedRecovery.error.message, /delegate_other/u);
  assert.equal(broadWrite.status, 'rejected');
  assert.equal(broadWrite.error.code, 'E_TOOL_SCOPE_DENIED');
});

test('toolBoundary rejects weak-worker tools outside the effective scope', async () => {
  const { boundary, tools } = createHarness();

  const result = await boundary.invoke({
    toolName: 'work.sop.ask_weak',
    input: askWeakInput(),
    actionId: 'action-ask-weak-no-scope',
    runId: 'run-weak-worker',
    actorRef: 'agent:strong-driver',
    grant: {
      parentToolScope: 'none',
      policyToolScope: 'read_only',
    },
    execute: tools.executors['work.sop.ask_weak'],
  });

  assert.equal(result.status, 'rejected');
  assert.equal(result.error.code, 'E_TOOL_SCOPE_DENIED');
});

test('strong and weak profiles use the same provider-agent seam with different dials', () => {
  const { registry } = createHarness();
  const strongPolicy: SupervisionPolicy = {
    autonomy: 'milestone_plan',
    taskGranularity: 'milestone',
    toolScope: 'narrow_write',
    scaffolding: 'few_shot',
    validation: 'schema_required',
    checkpointCadence: 'milestone',
    approvalThreshold: 'medium',
    fallbackPolicy: 'retry',
  };
  const weakPolicy: SupervisionPolicy = {
    autonomy: 'single_step',
    taskGranularity: 'tiny',
    toolScope: 'read_only',
    scaffolding: 'sop_template',
    validation: 'schema_required',
    checkpointCadence: 'every_step',
    approvalThreshold: 'low',
    fallbackPolicy: 'ask_human',
  };
  const strongObservation = providerAgentObservation({
    actorRef: 'agent:codex',
    provider: 'codex',
    model: 'gpt-5.4',
    policy: strongPolicy,
    tools: registry.filter({
      parentToolScope: 'narrow_write',
      policyToolScope: strongPolicy.toolScope,
    }),
  });
  const weakObservation = providerAgentObservation({
    actorRef: 'worker:ollama-small',
    provider: 'ollama',
    model: 'llama-small',
    policy: weakPolicy,
    tools: registry.filter({
      parentToolScope: 'read_only',
      policyToolScope: weakPolicy.toolScope,
    }),
  });

  assert.deepEqual(validateProviderAgentBoundedObservation(strongObservation), []);
  assert.deepEqual(validateProviderAgentBoundedObservation(weakObservation), []);
  assert.equal(strongObservation.contractVersion, weakObservation.contractVersion);
  assert.equal(strongObservation.task.kind, weakObservation.task.kind);
  assert.notEqual(strongObservation.policy.dials.autonomy, weakObservation.policy.dials.autonomy);
  assert.ok(strongObservation.availableTools.some((tool) =>
    tool.manifest.name === 'work.local_note.apply'));
  assert.equal(
    weakObservation.availableTools.some((tool) => tool.manifest.name === 'work.local_note.apply'),
    false,
  );
  assert.ok(weakObservation.availableTools.some((tool) =>
    tool.manifest.name === 'work.sop.ask_weak'));
});

test('weak-worker evidence is attributed to the parent run and driver actor', async () => {
  const { boundary, tools, evidenceSink } = createHarness();

  const result = await boundary.invoke({
    toolName: 'work.sop.ask_weak',
    input: askWeakInput(),
    actionId: 'action-weak-evidence',
    runId: 'run-parent-driver',
    actorRef: 'agent:strong-driver',
    grant: {
      parentToolScope: 'read_only',
      policyToolScope: 'read_only',
    },
    execute: tools.executors['work.sop.ask_weak'],
  });
  const events = evidenceSink.read();

  assert.equal(result.status, 'applied');
  assert.equal(events.length, 1);
  assert.equal(events[0]?.runId, 'run-parent-driver');
  assert.equal(events[0]?.actorRef, 'agent:strong-driver');
  assert.equal(events[0]?.toolName, 'work.sop.ask_weak');
  assert.equal(events[0]?.status, 'applied');
  assert.equal('workerRunId' in (events[0] as Record<string, unknown>), false);
});
