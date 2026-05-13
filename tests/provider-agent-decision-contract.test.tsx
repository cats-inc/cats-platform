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

test('bounded observation rejects malformed array fields without throwing', () => {
  const input = observation();
  input.policy.allowedFallbacks = 'retry' as never;
  input.availableTools = { manifest: manifest('work.context.lookup') } as never;
  input.contextRefs = 'work-item:1' as never;
  input.invariants = null as never;
  input.summaries = { key: 'summary', kind: 'count', value: 1 } as never;

  assert.deepEqual(validateProviderAgentBoundedObservation(input), [
    'policy.allowedFallbacks must be an array',
    'availableTools must be an array',
    'contextRefs must be an array',
    'invariants must be an array',
    'summaries must be an array',
  ]);
});

test('bounded observation rejects malformed tool descriptors without throwing', () => {
  const input = observation();
  input.availableTools = [
    null as never,
    {
      manifest: {
        schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION,
        name: 'work.context.lookup',
        manifestVersion: 'v'.repeat(41),
        description: 'd'.repeat(501),
        sideEffect: 'secret',
        preflight: 'maybe',
        blocking: 'later',
        cancellation: 'never',
        approval: 'sometimes',
        evidence: 'raw',
        failureCodes: 'E_TOOL_SCOPE_DENIED',
        inputSchema: null,
        outputSchema: {
          id: 'work.context.lookup.output',
          version: '1.0',
          format: 'json_schema',
        },
      },
      reason: 42,
      inputHints: 'Call it carefully.',
    } as never,
  ];

  assert.deepEqual(validateProviderAgentBoundedObservation(input), [
    'availableTools[0] must be an object',
    'availableTools[1].manifest.manifestVersion must be 40 characters or less',
    'availableTools[1].manifest.description must be 500 characters or less',
    'availableTools[1].manifest.sideEffect is unsupported: secret',
    'availableTools[1].manifest.preflight is unsupported: maybe',
    'availableTools[1].manifest.blocking is unsupported: later',
    'availableTools[1].manifest.cancellation is unsupported: never',
    'availableTools[1].manifest.approval is unsupported: sometimes',
    'availableTools[1].manifest.evidence is unsupported: raw',
    'availableTools[1].manifest.failureCodes must be an array',
    'availableTools[1].manifest.inputSchema must be an object',
    'availableTools[1].reason must be a string',
    'availableTools[1].inputHints must be an array',
  ]);
});

test('bounded observation rejects unsupported tool descriptor and manifest fields', () => {
  const input = observation();
  input.availableTools[0] = {
    ...input.availableTools[0]!,
    debug: 'hidden descriptor field',
    manifest: {
      ...input.availableTools[0]!.manifest,
      secret: 'hidden manifest field',
      maxBudgetHint: {
        maxDurationMs: 1000,
        hardStop: true,
        softLimit: true,
      },
      inputSchema: {
        ...input.availableTools[0]!.manifest.inputSchema,
        extra: 'hidden schema field',
      },
    },
  } as never;

  assert.deepEqual(validateProviderAgentBoundedObservation(input), [
    'availableTools[0] contains unsupported fields: debug',
    'availableTools[0].manifest contains unsupported fields: secret',
    'availableTools[0].manifest.inputSchema contains unsupported fields: extra',
    'availableTools[0].manifest.maxBudgetHint contains unsupported fields: softLimit',
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

test('provider-agent decisions validate addressable tool and delegation targets', () => {
  const wrongToolTarget: ProviderAgentDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'tool_request',
    decisionId: 'decision-wrong-tool-target',
    confidence: 'medium',
    toolName: 'work.context.lookup',
    target: { kind: 'execution_target', provider: 'codex', model: 'gpt-5.4' },
    input: {},
    rationaleSummary: 'Try to call a tool through a runtime target.',
  };
  const mismatchedToolTarget: ProviderAgentDecision = {
    ...wrongToolTarget,
    decisionId: 'decision-mismatched-tool-target',
    target: { kind: 'worker_tool', toolName: 'work.local_note.apply' },
  };
  const invalidDelegationTarget: ProviderAgentDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'delegation_request',
    decisionId: 'decision-invalid-target',
    confidence: 'medium',
    target: { kind: 'execution_target', provider: '', model: 'm'.repeat(121) },
    goalSummary: 'Delegate with malformed target fields.',
    blocking: 'async',
    budget: {
      maxDurationMs: 30_000,
      hardStop: true,
    },
    rationaleSummary: 'Malformed target should be rejected.',
  };
  const workerToolDelegationTarget: ProviderAgentDecision = {
    ...invalidDelegationTarget,
    decisionId: 'decision-worker-tool-delegation',
    target: { kind: 'worker_tool', toolName: 'work.context.lookup' },
  };
  const wrongSemanticStepToolTarget: ProviderAgentDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'semantic_plan',
    decisionId: 'decision-wrong-step-tool-target',
    planId: 'plan-wrong-step-tool-target',
    confidence: 'medium',
    rationaleSummary: 'Try to call a tool through a runtime target in a plan.',
    steps: [
      {
        stepId: 'step-lookup',
        summary: 'Read bounded context.',
        action: 'call_tool',
        toolName: 'work.context.lookup',
        target: { kind: 'execution_target', provider: 'codex', model: 'gpt-5.4' },
      },
    ],
  };
  const mismatchedSemanticStepToolTarget: ProviderAgentDecision = {
    ...wrongSemanticStepToolTarget,
    decisionId: 'decision-mismatched-step-tool-target',
    steps: [
      {
        stepId: 'step-lookup',
        summary: 'Read bounded context.',
        action: 'call_tool',
        toolName: 'work.context.lookup',
        target: { kind: 'worker_tool', toolName: 'work.local_note.apply' },
      },
    ],
  };
  const workerToolSemanticDelegateTarget: ProviderAgentDecision = {
    ...wrongSemanticStepToolTarget,
    decisionId: 'decision-worker-tool-step-delegation',
    planId: 'plan-worker-tool-step-delegation',
    steps: [
      {
        stepId: 'step-delegate',
        summary: 'Delegate work elsewhere.',
        action: 'delegate_run',
        target: { kind: 'worker_tool', toolName: 'work.context.lookup' },
      },
    ],
  };

  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: wrongToolTarget,
  }), [
    'tool_request.target.kind must be worker_tool',
  ]);
  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: mismatchedToolTarget,
  }), [
    'tool_request.target.toolName must match tool_request.toolName work.context.lookup',
  ]);
  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: invalidDelegationTarget,
  }), [
    'delegation_request.target.provider is required',
    'delegation_request.target.model must be 120 characters or less',
  ]);
  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: workerToolDelegationTarget,
  }), [
    'delegation_request.target.kind must not be worker_tool',
  ]);
  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: wrongSemanticStepToolTarget,
  }), [
    'step step-lookup.target.kind must be worker_tool for call_tool',
  ]);
  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: mismatchedSemanticStepToolTarget,
  }), [
    'step step-lookup.target.toolName must match step toolName work.context.lookup',
  ]);
  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: workerToolSemanticDelegateTarget,
  }), [
    'step step-delegate.target.kind must not be worker_tool unless action is call_tool',
  ]);
});

test('provider-agent decisions validate expected output schema refs against tool manifests', () => {
  const mismatchedToolRequest: ProviderAgentDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'tool_request',
    decisionId: 'decision-mismatched-schema',
    confidence: 'medium',
    toolName: 'work.context.lookup',
    target: { kind: 'worker_tool', toolName: 'work.context.lookup' },
    input: {},
    expectedOutputSchemaRef: {
      id: 'work.local_note.apply.output',
      version: '1.0',
      format: 'json_schema',
    },
    rationaleSummary: 'Try a mismatched output schema ref.',
  };
  const malformedSchemaStep: ProviderAgentDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'semantic_plan',
    decisionId: 'decision-bad-schema-ref',
    planId: 'plan-bad-schema-ref',
    confidence: 'medium',
    rationaleSummary: 'Return malformed schema refs.',
    steps: [
      {
        stepId: 'step-lookup',
        summary: 'Read bounded context.',
        action: 'call_tool',
        toolName: 'work.context.lookup',
        expectedOutputSchemaRef: {
          id: '',
          version: 'v'.repeat(41),
          format: 'xml' as never,
          uri: 'u'.repeat(1001),
        },
      },
    ],
  };

  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: mismatchedToolRequest,
  }), [
    'tool_request.expectedOutputSchemaRef must match work.context.lookup outputSchema',
  ]);
  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: malformedSchemaStep,
  }), [
    'step step-lookup.expectedOutputSchemaRef.id is required',
    'step step-lookup.expectedOutputSchemaRef.version must be 40 characters or less',
    'step step-lookup.expectedOutputSchemaRef.format is unsupported: xml',
    'step step-lookup.expectedOutputSchemaRef.uri must be 1000 characters or less',
  ]);
});

test('provider-agent tool inputs stay bounded JSON values', () => {
  const toolRequest: ProviderAgentDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'tool_request',
    decisionId: 'decision-input-bounds',
    confidence: 'medium',
    toolName: 'work.context.lookup',
    target: { kind: 'worker_tool', toolName: 'work.context.lookup' },
    input: {
      raw: 'x'.repeat(4001),
      items: Array.from({ length: 33 }, (_, index) => `item-${index}`),
      callback: (() => undefined) as unknown,
    },
    rationaleSummary: 'Try to pass an unbounded tool input.',
  };
  const semanticPlan: ProviderAgentDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'semantic_plan',
    decisionId: 'decision-step-input-bounds',
    planId: 'plan-step-input-bounds',
    confidence: 'medium',
    rationaleSummary: 'Try to pass an unbounded step input.',
    steps: [
      {
        stepId: 'step-lookup',
        summary: 'Read bounded context.',
        action: 'call_tool',
        toolName: 'work.context.lookup',
        input: {
          raw: 'x'.repeat(4001),
        },
      },
    ],
  };

  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: toolRequest,
  }), [
    'tool_request.input.raw must be 4000 characters or less',
    'tool_request.input.items must contain 32 entries or fewer',
    'tool_request.input.callback must be JSON-compatible',
  ]);
  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: semanticPlan,
  }), [
    'step step-lookup.input.raw must be 4000 characters or less',
  ]);
});

test('provider-agent tool inputs must be JSON argument objects', () => {
  const toolRequest = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'tool_request',
    decisionId: 'decision-input-object',
    confidence: 'medium',
    toolName: 'work.context.lookup',
    target: { kind: 'worker_tool', toolName: 'work.context.lookup' },
    input: 'raw scalar input',
    rationaleSummary: 'Try to pass a scalar tool input.',
  } as unknown as ProviderAgentDecision;
  const semanticPlan: ProviderAgentDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'semantic_plan',
    decisionId: 'decision-step-input-object',
    planId: 'plan-step-input-object',
    confidence: 'medium',
    rationaleSummary: 'Try to pass a scalar step input.',
    steps: [
      {
        stepId: 'step-lookup',
        summary: 'Read bounded context.',
        action: 'call_tool',
        toolName: 'work.context.lookup',
        input: 'raw scalar input',
      } as never,
    ],
  };

  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: toolRequest,
  }), [
    'tool_request.input must be an object',
  ]);
  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: semanticPlan,
  }), [
    'step step-lookup.input must be an object',
  ]);
});

test('provider-agent recovery corrected input stays bounded when present', () => {
  const scalarCorrection = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'recovery_decision',
    decisionId: 'decision-recover-scalar-correction',
    confidence: 'low',
    rejectedActionId: 'tool-call-1',
    selectedFallback: 'retry',
    correctedInput: 'retry with this raw string',
    rationaleSummary: 'Retry with a malformed correction.',
  } as unknown as ProviderAgentDecision;
  const oversizedCorrection: ProviderAgentDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'recovery_decision',
    decisionId: 'decision-recover-oversized-correction',
    confidence: 'low',
    rejectedActionId: 'tool-call-1',
    selectedFallback: 'retry',
    correctedInput: {
      raw: 'x'.repeat(4001),
    },
    rationaleSummary: 'Retry with an oversized correction.',
  };

  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: scalarCorrection,
  }), [
    'correctedInput must be an object',
  ]);
  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: oversizedCorrection,
  }), [
    'correctedInput.raw must be 4000 characters or less',
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
    target: { kind: 'execution_target', provider: 'codex', model: 'gpt-5.4' },
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

test('provider-agent decisions reject unsupported model-authored fields', () => {
  const semanticPlan = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'semantic_plan',
    decisionId: 'decision-extra-plan-field',
    planId: 'plan-extra-field',
    confidence: 'medium',
    rationaleSummary: 'Try to smuggle extra model-authored fields.',
    scratchpad: 'hidden reasoning must not be retained',
    steps: [
      {
        stepId: 'respond',
        summary: 'Respond.',
        action: 'respond',
        notes: 'extra step field',
      },
    ],
  } as unknown as ProviderAgentDecision;
  const toolRequest = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'tool_request',
    decisionId: 'decision-extra-tool-field',
    confidence: 'medium',
    toolName: 'work.context.lookup',
    target: { kind: 'worker_tool', toolName: 'work.context.lookup' },
    input: {},
    workItemId: 'work-item-model-supplied-id',
    rationaleSummary: 'Try to supply server-resolved ids outside input.',
  } as unknown as ProviderAgentDecision;
  const recoveryDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'recovery_decision',
    decisionId: 'decision-extra-recovery-field',
    confidence: 'low',
    rejectedActionId: 'step-denied',
    selectedFallback: 'retry',
    correctedInput: {},
    chainOfThought: 'hidden reasoning must not be retained',
    rationaleSummary: 'Retry with a bounded input.',
  } as unknown as ProviderAgentDecision;

  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: semanticPlan,
  }), [
    'semantic_plan contains unsupported fields: scratchpad',
    'step respond contains unsupported fields: notes',
  ]);
  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: toolRequest,
  }), [
    'tool_request contains unsupported fields: workItemId',
  ]);
  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: recoveryDecision,
  }), [
    'recovery_decision contains unsupported fields: chainOfThought',
  ]);
});

test('provider-agent decisions reject unsupported nested model-authored fields', () => {
  const extraTargetField = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'tool_request',
    decisionId: 'decision-extra-target-field',
    confidence: 'medium',
    toolName: 'work.context.lookup',
    target: {
      kind: 'worker_tool',
      toolName: 'work.context.lookup',
      credential: 'hidden target credential',
    },
    input: {},
    rationaleSummary: 'Try to smuggle target fields.',
  } as unknown as ProviderAgentDecision;
  const extraSchemaField = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'tool_request',
    decisionId: 'decision-extra-schema-field',
    confidence: 'medium',
    toolName: 'work.context.lookup',
    target: { kind: 'worker_tool', toolName: 'work.context.lookup' },
    input: {},
    expectedOutputSchemaRef: {
      id: 'work.context.lookup.output',
      version: '1.0',
      format: 'json_schema',
      secret: 'hidden schema hint',
    },
    rationaleSummary: 'Try to smuggle schema fields.',
  } as unknown as ProviderAgentDecision;
  const extraBudgetField = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'delegation_request',
    decisionId: 'decision-extra-budget-field',
    confidence: 'medium',
    target: { kind: 'execution_target', provider: 'codex', model: 'gpt-5.4' },
    goalSummary: 'Delegate with an extra budget field.',
    blocking: 'async',
    budget: {
      maxDurationMs: 30_000,
      hardStop: true,
      softLimit: true,
    },
    rationaleSummary: 'Try to smuggle budget fields.',
  } as unknown as ProviderAgentDecision;

  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: extraTargetField,
  }), [
    'tool_request.target contains unsupported fields: credential',
  ]);
  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: extraSchemaField,
  }), [
    'tool_request.expectedOutputSchemaRef contains unsupported fields: secret',
  ]);
  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: extraBudgetField,
  }), [
    'delegation_request.budget contains unsupported fields: softLimit',
  ]);
});

test('provider-agent delegation and recovery decisions reject malformed bounded fields', () => {
  const invalidDelegation: ProviderAgentDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'delegation_request',
    decisionId: 'decision-invalid-delegation-bounds',
    confidence: 'medium',
    target: { kind: 'execution_target', provider: 'codex', model: 'gpt-5.4' },
    goalSummary: 'g'.repeat(281),
    blocking: 'blocking',
    budget: {
      maxTokens: 'many' as never,
      hardStop: false,
    },
    rationaleSummary: 'r'.repeat(281),
  };
  const nonObjectBudget: ProviderAgentDecision = {
    ...invalidDelegation,
    decisionId: 'decision-invalid-budget-object',
    goalSummary: 'Delegate with a malformed budget.',
    budget: null as never,
    rationaleSummary: 'Budget must stay structured.',
  };
  const invalidRecovery: ProviderAgentDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'recovery_decision',
    decisionId: 'decision-invalid-recovery-bounds',
    confidence: 'low',
    rejectedActionId: 'step-denied',
    selectedFallback: 'retry',
    rationaleSummary: 'r'.repeat(281),
  };

  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: invalidDelegation,
  }), [
    'goalSummary must be 280 characters or less',
    'rationaleSummary must be 280 characters or less',
    'delegation_request.budget.maxTokens must be a positive integer',
    'delegation_request.budget.hardStop must be true for provider-agent observations',
  ]);
  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: nonObjectBudget,
  }), [
    'delegation_request.budget must be an object',
  ]);
  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: invalidRecovery,
  }), [
    'rationaleSummary must be 280 characters or less',
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

test('provider-agent decisions reject oversized model-authored identifiers', () => {
  const decision: ProviderAgentDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'semantic_plan',
    decisionId: 'd'.repeat(121),
    planId: 'p'.repeat(121),
    confidence: 'medium',
    rationaleSummary: 'Return oversized ids.',
    steps: [
      {
        stepId: 's'.repeat(121),
        summary: 'Oversized step id.',
        action: 'respond',
      },
    ],
  };
  const recoveryDecision: ProviderAgentDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'recovery_decision',
    decisionId: 'decision-recover',
    confidence: 'low',
    rejectedActionId: 'a'.repeat(121),
    selectedFallback: 'retry',
    rationaleSummary: 'Retry with bounded input.',
  };

  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision,
  }), [
    'decisionId must be 120 characters or less',
    'planId must be 120 characters or less',
    'step.stepId must be 120 characters or less',
  ]);
  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: recoveryDecision,
  }), [
    'rejectedActionId must be 120 characters or less',
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

test('provider-agent semantic plans reject malformed step entries without throwing', () => {
  const decision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'semantic_plan',
    decisionId: 'decision-bad-step-entry',
    planId: 'plan-bad-step-entry',
    confidence: 'medium',
    rationaleSummary: 'Return malformed step entries.',
    steps: [
      null,
      7,
      {
        stepId: 'respond',
        summary: 'Respond after malformed entries are ignored.',
        action: 'respond',
      },
    ],
  } as unknown as ProviderAgentDecision;

  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision,
  }), [
    'semantic_plan.steps[0] must be an object',
    'semantic_plan.steps[1] must be an object',
  ]);
});

test('provider-agent semantic plans reject oversized step lists', () => {
  const decision: ProviderAgentDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'semantic_plan',
    decisionId: 'decision-too-many-steps',
    planId: 'plan-too-many-steps',
    confidence: 'medium',
    rationaleSummary: 'Return too many steps.',
    steps: Array.from({ length: 13 }, (_, index) => ({
      stepId: `step-${index}`,
      summary: `Step ${index}`,
      action: 'respond',
    })),
  };

  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision,
  }), [
    'semantic_plan.steps must contain 12 entries or fewer',
  ]);
});

test('provider-agent semantic plans reject malformed step dependencies', () => {
  const nonArrayDependencies: ProviderAgentDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'semantic_plan',
    decisionId: 'decision-bad-dependencies',
    planId: 'plan-bad-dependencies',
    confidence: 'medium',
    rationaleSummary: 'Return malformed dependencies.',
    steps: [
      {
        stepId: 'step-one',
        summary: 'Malformed dependency list.',
        action: 'respond',
        dependsOn: 'step-zero' as never,
      },
    ],
  };
  const oversizedDependencies: ProviderAgentDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'semantic_plan',
    decisionId: 'decision-many-dependencies',
    planId: 'plan-many-dependencies',
    confidence: 'medium',
    rationaleSummary: 'Return too many dependencies.',
    steps: [
      {
        stepId: 'step-one',
        summary: 'Oversized dependency list.',
        action: 'respond',
        dependsOn: [
          '',
          'x'.repeat(81),
          7 as never,
          'step-3',
          'step-4',
          'step-5',
          'step-6',
          'step-7',
          'step-8',
        ],
      },
    ],
  };

  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: nonArrayDependencies,
  }), [
    'step step-one.dependsOn must be an array',
  ]);
  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision: oversizedDependencies,
  }), [
    'step step-one.dependsOn must contain 8 entries or fewer',
    'step step-one.dependsOn[0] is required',
    'step step-one.dependsOn[1] must be 80 characters or less',
    'step step-one.dependsOn[2] must be a string',
  ]);
});

test('provider-agent semantic plans reject invalid dependency graph references', () => {
  const decision: ProviderAgentDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'semantic_plan',
    decisionId: 'decision-bad-dependency-graph',
    planId: 'plan-bad-dependency-graph',
    confidence: 'medium',
    rationaleSummary: 'Return invalid graph references.',
    steps: [
      {
        stepId: 'step-one',
        summary: 'First step.',
        action: 'respond',
        dependsOn: ['step-one', 'step-missing', 'step-two', 'step-two'],
      },
      {
        stepId: 'step-two',
        summary: 'Second step.',
        action: 'respond',
      },
    ],
  };

  assert.deepEqual(validateProviderAgentDecision({
    observation: observation(),
    decision,
  }), [
    'step step-one.dependsOn must not reference itself',
    'step step-one.dependsOn references unknown step step-missing',
    'step step-one.dependsOn must not repeat step-two',
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
