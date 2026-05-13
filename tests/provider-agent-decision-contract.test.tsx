import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
  validateProviderAgentBoundedObservation,
  validateProviderAgentDecision,
  type ProviderAgentBoundedObservation,
  type ProviderAgentDecision,
} from '../src/platform/orchestration/index.ts';
import {
  DEFAULT_SUPERVISION_SCHEMA_VERSION,
  type SupervisedToolManifest,
} from '../src/platform/supervision/index.ts';

function manifest(name: string): SupervisedToolManifest {
  return {
    schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION,
    name,
    manifestVersion: '1.0',
    description: `${name} fixture`,
    sideEffect: 'none',
    preflight: 'available',
    blocking: 'blocking',
    cancellation: 'cooperative',
    approval: 'never',
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

function observation(): ProviderAgentBoundedObservation {
  return {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    observationId: 'observation-1',
    runId: 'run-1',
    goal: 'Resolve the work item using available bounded tools.',
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
      dials: {
        autonomy: 'milestone_plan',
        taskGranularity: 'milestone',
        toolScope: 'narrow_write',
        scaffolding: 'few_shot',
        validation: 'best_effort',
        checkpointCadence: 'milestone',
        approvalThreshold: 'medium',
        fallbackPolicy: 'retry',
      },
      allowedFallbacks: ['retry', 'ask_human'],
    },
    availableTools: [
      {
        manifest: manifest('work.context.lookup'),
        reason: 'Read scoped work context.',
      },
      {
        manifest: manifest('work.local_note.apply'),
        reason: 'Write a local note when policy allows.',
      },
    ],
    contextRefs: ['work-item:1', 'run:1'],
    summaries: [
      {
        key: 'tool_rejection_count',
        kind: 'count',
        value: 0,
      },
      {
        key: 'recent_outcome',
        kind: 'enumerated_outcome',
        value: 'no_prior_run',
      },
    ],
    budget: {
      maxDurationMs: 30_000,
      hardStop: true,
    },
    invariants: ['no direct runtime call', 'respect tool surface'],
  };
}

test('provider-agent semantic plan validates against bounded tool surface', () => {
  const decision: ProviderAgentDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'semantic_plan',
    decisionId: 'decision-1',
    planId: 'plan-1',
    confidence: 'medium',
    rationaleSummary: 'Use context first, then write a local note.',
    steps: [
      {
        stepId: 'step-lookup',
        summary: 'Read bounded context.',
        action: 'call_tool',
        toolName: 'work.context.lookup',
        input: { key: 'goal' },
      },
      {
        stepId: 'step-note',
        summary: 'Write scoped note.',
        action: 'call_tool',
        toolName: 'work.local_note.apply',
        input: { noteId: 'n1', body: 'bounded result' },
        dependsOn: ['step-lookup'],
      },
    ],
  };

  assert.deepEqual(validateProviderAgentDecision({ observation: observation(), decision }), []);
});

test('bounded observation rejects raw-content summaries and oversized text', () => {
  const input = observation();
  input.summaries = [
    {
      key: 'raw_message_body',
      kind: 'opaque_ref',
      value: 'x'.repeat(281),
    },
  ];

  assert.deepEqual(validateProviderAgentBoundedObservation(input), [
    'summary raw_message_body appears to describe raw conversation content',
    'summary raw_message_body must be 280 characters or less',
  ]);
});

test('bounded observation rejects oversized summary lists and keys', () => {
  const input = observation();
  input.summaries = Array.from({ length: 25 }, (_, index) => ({
    key: index === 0 ? 'x'.repeat(81) : `summary_${index}`,
    kind: 'count',
    value: index,
  }));

  assert.deepEqual(validateProviderAgentBoundedObservation(input), [
    'summaries must contain 24 entries or fewer',
    'summary.key must be 80 characters or less',
  ]);
});

test('bounded observation rejects invalid budget envelopes', () => {
  const invalidLimits = observation();
  invalidLimits.budget = {
    maxCostUsd: 0,
    maxTokens: -1,
    maxDurationMs: 0,
    hardStop: false,
  };

  assert.deepEqual(validateProviderAgentBoundedObservation(invalidLimits), [
    'budget.maxCostUsd must be greater than 0',
    'budget.maxTokens must be a positive integer',
    'budget.maxDurationMs must be a positive integer',
    'budget.hardStop must be true for provider-agent observations',
  ]);

  const missingLimit = observation();
  missingLimit.budget = {
    hardStop: true,
  };

  assert.deepEqual(validateProviderAgentBoundedObservation(missingLimit), [
    'budget must include at least one maxCostUsd, maxTokens, or maxDurationMs limit',
  ]);
});

test('bounded observation rejects inconsistent allowed fallback surfaces', () => {
  const input = observation();
  input.policy.dials = {
    ...input.policy.dials,
    fallbackPolicy: 'ask_human',
  };
  input.policy.allowedFallbacks = [
    'retry',
    'retry',
    'not_supported' as never,
  ];

  assert.deepEqual(validateProviderAgentBoundedObservation(input), [
    'policy.allowedFallbacks must not contain duplicate values',
    'policy.allowedFallbacks[2] is unsupported: not_supported',
    'policy.allowedFallbacks must include policy.dials.fallbackPolicy ask_human',
  ]);
});

test('bounded observation rejects unsupported task and summary enum values', () => {
  const input = observation();
  input.task = {
    kind: 'unknown_task' as never,
    risk: 'certain' as never,
  };
  input.summaries = [
    {
      key: 'unsupported_kind',
      kind: 'raw_json' as never,
      value: null,
    },
  ];

  assert.deepEqual(validateProviderAgentBoundedObservation(input), [
    'task.kind is unsupported: unknown_task',
    'task.risk is unsupported: certain',
    'summary.kind is unsupported: raw_json',
  ]);
});

test('bounded observation rejects missing and oversized tool reasons', () => {
  const input = observation();
  input.availableTools[0] = {
    ...input.availableTools[0]!,
    reason: '',
  };
  input.availableTools[1] = {
    ...input.availableTools[1]!,
    reason: 'x'.repeat(281),
  };

  assert.deepEqual(validateProviderAgentBoundedObservation(input), [
    'availableTools[0].reason is required',
    'availableTools[1].reason must be 280 characters or less',
  ]);
});

test('bounded observation rejects oversized context refs and invariants', () => {
  const input = observation();
  input.contextRefs = Array.from({ length: 65 }, (_, index) => {
    if (index === 0) {
      return '';
    }
    if (index === 1) {
      return 'x'.repeat(241);
    }
    return `context-ref:${index}`;
  });
  input.invariants = Array.from({ length: 25 }, (_, index) => {
    if (index === 0) {
      return '';
    }
    if (index === 1) {
      return 'x'.repeat(321);
    }
    return `Invariant ${index}`;
  });

  assert.deepEqual(validateProviderAgentBoundedObservation(input), [
    'contextRefs must contain 64 entries or fewer',
    'contextRefs[0] is required',
    'contextRefs[1] must be 240 characters or less',
    'invariants must contain 24 entries or fewer',
    'invariants[0] is required',
    'invariants[1] must be 320 characters or less',
  ]);
});

test('bounded observation rejects oversized tool input hints', () => {
  const input = observation();
  input.availableTools[0] = {
    ...input.availableTools[0]!,
    inputHints: [
      'x'.repeat(401),
      '',
      'Use only server-resolved ids.',
      'Keep writes bounded.',
      'Preserve source context.',
      'Do not execute work.',
      'Return compact summaries.',
      'Respect policy dials.',
      'Extra hint past the contract.',
    ],
  };

  assert.deepEqual(validateProviderAgentBoundedObservation(input), [
    'availableTools[0].inputHints must contain 8 entries or fewer',
    'availableTools[0].inputHints[0] must be 400 characters or less',
    'availableTools[0].inputHints[1] is required',
  ]);
});

test('tool requests and semantic-plan steps cannot use tools outside the bounded surface', () => {
  const input = observation();
  const toolRequest: ProviderAgentDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'tool_request',
    decisionId: 'decision-tool',
    confidence: 'medium',
    toolName: 'work.secret.write',
    target: { kind: 'worker_tool', toolName: 'work.secret.write' },
    input: {},
    rationaleSummary: 'Try an unavailable write.',
  };
  const semanticPlan: ProviderAgentDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'semantic_plan',
    decisionId: 'decision-plan',
    planId: 'plan-secret',
    confidence: 'medium',
    rationaleSummary: 'Try an unavailable tool in a plan.',
    steps: [
      {
        stepId: 'step-secret',
        summary: 'Secret write.',
        action: 'call_tool',
        toolName: 'work.secret.write',
      },
    ],
  };

  assert.deepEqual(validateProviderAgentDecision({ observation: input, decision: toolRequest }), [
    'tool_request.toolName work.secret.write is outside the bounded tool surface',
  ]);
  assert.deepEqual(validateProviderAgentDecision({ observation: input, decision: semanticPlan }), [
    'step step-secret.toolName work.secret.write is outside the bounded tool surface',
  ]);
});

test('provider-agent decisions reject unsupported enum values', () => {
  const unknownDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'mystery_decision',
    decisionId: 'decision-mystery',
    confidence: 'certain',
  } as unknown as ProviderAgentDecision;
  const invalidStep: ProviderAgentDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'semantic_plan',
    decisionId: 'decision-invalid-step',
    planId: 'plan-invalid-step',
    confidence: 'medium',
    rationaleSummary: 'Try an invalid step action.',
    steps: [
      {
        stepId: 'step-invent',
        summary: 'Invent an unsupported action.',
        action: 'invent' as never,
      },
    ],
  };
  const invalidDelegation: ProviderAgentDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'delegation_request',
    decisionId: 'decision-invalid-delegation',
    confidence: 'medium',
    target: { kind: 'execution_target', provider: 'codex' },
    goalSummary: 'Delegate later.',
    blocking: 'later' as never,
    budget: {
      maxDurationMs: 10_000,
      hardStop: true,
    },
    rationaleSummary: 'Try an unsupported blocking mode.',
  };

  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: unknownDecision,
  }), [
    'decision.kind is unsupported: mystery_decision',
    'decision.confidence is unsupported: certain',
  ]);
  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: invalidStep,
  }), [
    'step step-invent.action is unsupported: invent',
  ]);
  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: invalidDelegation,
  }), [
    'delegation_request.blocking is unsupported: later',
  ]);
});

test('provider-agent decisions reject non-string runtime JSON fields without throwing', () => {
  const decision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'semantic_plan',
    decisionId: 42,
    planId: 101,
    confidence: 'medium',
    rationaleSummary: null,
    steps: [
      {
        stepId: 7,
        summary: false,
        action: 'respond',
      },
    ],
  } as unknown as ProviderAgentDecision;

  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision,
  }), [
    'decisionId must be a string',
    'planId must be a string',
    'rationaleSummary must be a string',
    'step.stepId must be a string',
    'step 7 summary must be a string',
  ]);
});

test('provider-agent semantic plans reject non-array steps without throwing', () => {
  const decision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'semantic_plan',
    decisionId: 'decision-bad-steps',
    planId: 'plan-bad-steps',
    confidence: 'medium',
    rationaleSummary: 'Return malformed steps.',
    steps: {
      stepId: 'step-not-array',
      summary: 'This should be wrapped in an array.',
      action: 'respond',
    },
  } as unknown as ProviderAgentDecision;

  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision,
  }), [
    'semantic_plan.steps must be an array',
  ]);
});

test('recovery decision must choose a platform-allowed fallback option', () => {
  const decision: ProviderAgentDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'recovery_decision',
    decisionId: 'decision-recover',
    confidence: 'low',
    rejectedActionId: 'step-denied',
    selectedFallback: 'delegate_other',
    correctedInput: { key: 'goal' },
    rationaleSummary: 'Delegate after rejection.',
  };

  assert.deepEqual(validateProviderAgentDecision({ observation: observation(), decision }), [
    'recovery selectedFallback delegate_other is outside allowedFallbacks',
  ]);
});
