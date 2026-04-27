import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
  applyProviderAgentPolicyGate,
  validateProviderAgentPolicyGate,
  type ProviderAgentBoundedObservation,
  type ProviderAgentDecision,
} from '../src/platform/orchestration/index.ts';
import {
  DEFAULT_SUPERVISION_SCHEMA_VERSION,
  type SupervisedToolManifest,
  type SupervisionPolicy,
} from '../src/platform/supervision/index.ts';

function manifest(
  name: string,
  sideEffect: SupervisedToolManifest['sideEffect'] = 'none',
): SupervisedToolManifest {
  return {
    schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION,
    name,
    manifestVersion: '1.0',
    description: `${name} fixture`,
    sideEffect,
    preflight: 'available',
    blocking: 'blocking',
    cancellation: 'cooperative',
    approval: sideEffect === 'none' ? 'never' : 'policy',
    evidence: 'summary',
    failureCodes: ['E_TOOL_SCOPE_DENIED'],
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

function policy(overrides: Partial<SupervisionPolicy> = {}): SupervisionPolicy {
  return {
    autonomy: 'milestone_plan',
    taskGranularity: 'milestone',
    toolScope: 'broad_write',
    scaffolding: 'few_shot',
    validation: 'best_effort',
    checkpointCadence: 'milestone',
    approvalThreshold: 'medium',
    fallbackPolicy: 'retry',
    ...overrides,
  };
}

function observation(overrides: {
  policy?: Partial<SupervisionPolicy>;
  tools?: SupervisedToolManifest[];
} = {}): ProviderAgentBoundedObservation {
  const tools = overrides.tools ?? [
    manifest('work.context.lookup'),
    manifest('work.external.publish', 'external_visible'),
  ];

  return {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    observationId: 'observation-1',
    runId: 'run-1',
    goal: 'Resolve the work item using bounded tools.',
    task: {
      kind: 'work_run',
      risk: 'medium',
    },
    actor: {
      actorRef: 'agent:codex',
      target: {
        kind: 'execution_target',
        provider: 'codex',
        model: 'gpt-5.4',
      },
      capabilityProfileRef: 'provider-capability:codex:native:gpt-5.4:default',
      providerRef: 'provider:codex',
    },
    policy: {
      dials: policy(overrides.policy),
      allowedFallbacks: ['retry', 'ask_human'],
    },
    availableTools: tools.map((tool) => ({
      manifest: tool,
      reason: `${tool.name} is available for this gate test.`,
    })),
    contextRefs: ['work-item:1', 'run:1'],
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
    invariants: ['respect policy dials'],
  };
}

function semanticPlan(toolNames: string[]): ProviderAgentDecision {
  return {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'semantic_plan',
    decisionId: 'decision-plan',
    planId: 'plan-1',
    confidence: 'medium',
    rationaleSummary: 'Use the bounded tools.',
    steps: toolNames.map((toolName, index) => ({
      stepId: `step-${index + 1}`,
      summary: `Call ${toolName}.`,
      action: 'call_tool',
      toolName,
      expectedOutputSchemaRef: {
        id: `${toolName}.output`,
        version: '1.0',
        format: 'json_schema',
      },
    })),
  };
}

test('policy gate preserves valid agent semantic choices', () => {
  assert.deepEqual(
    validateProviderAgentPolicyGate({
      observation: observation(),
      decision: semanticPlan(['work.context.lookup', 'work.external.publish']),
    }),
    [],
  );
});

test('policy gate rejects multi-step plans under weak single-step dials', () => {
  assert.deepEqual(
    validateProviderAgentPolicyGate({
      observation: observation({
        policy: {
          autonomy: 'single_step',
          taskGranularity: 'tiny',
          toolScope: 'read_only',
          validation: 'schema_required',
          scaffolding: 'sop_template',
          checkpointCadence: 'every_step',
        },
      }),
      decision: semanticPlan(['work.context.lookup', 'work.context.lookup']),
    }),
    [
      'single_step autonomy allows at most one executable semantic-plan step',
      'tiny task granularity allows at most one semantic-plan step',
    ],
  );
});

test('policy gate rejects tool calls above policy or parent tool scope', () => {
  const input = {
    observation: observation({
      policy: {
        toolScope: 'read_only',
      },
    }),
    decision: semanticPlan(['work.external.publish']),
  };

  assert.deepEqual(validateProviderAgentPolicyGate(input), [
    'step step-1.toolName work.external.publish is denied by policy toolScope: Tool ' +
      'work.external.publish requires broad_write, but effective grant is read_only.',
  ]);

  input.observation.policy.dials.toolScope = 'broad_write';
  input.observation.policy.parentToolScope = 'narrow_write';
  assert.deepEqual(validateProviderAgentPolicyGate(input), [
    'step step-1.toolName work.external.publish is denied by policy toolScope: Tool ' +
      'work.external.publish requires broad_write, but effective grant is narrow_write.',
  ]);
});

test('policy gate rejects schema-required tool requests without an expected output schema', () => {
  const decision: ProviderAgentDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'tool_request',
    decisionId: 'decision-tool',
    confidence: 'medium',
    toolName: 'work.context.lookup',
    target: { kind: 'worker_tool', toolName: 'work.context.lookup' },
    input: {},
    rationaleSummary: 'Call a scoped read tool.',
  };

  assert.deepEqual(
    validateProviderAgentPolicyGate({
      observation: observation({
        policy: {
          validation: 'schema_required',
        },
      }),
      decision,
    }),
    ['tool_request.expectedOutputSchemaRef is required by schema_required validation'],
  );
});

test('policy gate rejects delegation without outcome-delegation autonomy', () => {
  const decision: ProviderAgentDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'delegation_request',
    decisionId: 'decision-delegate',
    confidence: 'medium',
    target: { kind: 'durable_agent', agentId: 'cat-reviewer' },
    goalSummary: 'Delegate the outcome.',
    blocking: 'async',
    budget: {
      maxDurationMs: 30_000,
      hardStop: true,
    },
    rationaleSummary: 'Another agent should finish this.',
  };

  const result = applyProviderAgentPolicyGate({
    observation: observation({
      policy: {
        autonomy: 'milestone_plan',
      },
    }),
    decision,
  });

  assert.equal(result.status, 'rejected');
  assert.equal(
    result.status === 'rejected' ? result.error.message : '',
    'Provider-agent decision exceeded deterministic policy gates.',
  );
});
