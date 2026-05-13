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
