import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
  PROVIDER_AGENT_DECISION_PROMPT_SCHEMA,
  ProviderAgentAdapterError,
  buildProviderAgentDecisionPrompt,
  requestProviderAgentDecision,
  type ProviderAgentBoundedObservation,
  type ProviderAgentDecision,
} from '../src/platform/orchestration/index.ts';
import {
  DEFAULT_SUPERVISION_SCHEMA_VERSION,
  RUNTIME_SUPERVISION_BOUNDARY,
  createInMemoryToolEvidenceSink,
  type SupervisedToolManifest,
} from '../src/platform/supervision/index.ts';
import type { RuntimeClient, RuntimeMessageResult } from '../src/platform/runtime/client.ts';

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
        toolScope: 'read_only',
        scaffolding: 'few_shot',
        validation: 'best_effort',
        checkpointCadence: 'milestone',
        approvalThreshold: 'low',
        fallbackPolicy: 'retry',
      },
      allowedFallbacks: ['retry', 'ask_human'],
    },
    availableTools: [
      {
        manifest: manifest('work.context.lookup'),
        reason: 'Read scoped work context.',
        inputHints: [
          'input.key must be one of the lookup keys exposed by the product.',
          'Return a compact tool_request; do not invent Work ids.',
        ],
      },
    ],
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
    invariants: ['no direct runtime call', 'respect tool surface'],
  };
}

function semanticPlanDecision(): ProviderAgentDecision {
  return {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'semantic_plan',
    decisionId: 'decision-1',
    planId: 'plan-1',
    confidence: 'medium',
    rationaleSummary: 'Read bounded context.',
    steps: [
      {
        stepId: 'step-lookup',
        summary: 'Read context.',
        action: 'call_tool',
        toolName: 'work.context.lookup',
        input: { key: 'goal' },
      },
    ],
  };
}

function createRuntimeStub(decision: ProviderAgentDecision): RuntimeClient & {
  createdSessions: unknown[];
  sentMessages: Array<{ sessionId: string; content: string; input: unknown }>;
} {
  return {
    createdSessions: [],
    sentMessages: [],
    async getHealth() {
      return {
        baseUrl: 'http://127.0.0.1:3110',
        reachable: true,
        status: 'ok',
      };
    },
    async getSetupState() {
      return {
        status: 'ready',
        providers: [],
        availableCount: 0,
        providerCount: 0,
        providersReadyToApply: [],
        providersNeedingAttention: [],
      };
    },
    async getProviderConfig() {
      return {};
    },
    async getProviderDiagnostics() {
      return {
        probe: 'light',
        providers: [],
      };
    },
    async getProviderModels(provider) {
      return {
        provider,
        backend: 'cli',
        instance: 'default',
        defaultModel: `${provider}-default`,
        source: 'config',
        cache: null,
        models: [],
        warnings: [],
      };
    },
    async getAdvancedProviderModels(provider) {
      return {
        provider,
        backend: 'cli',
        instance: 'default',
        defaultModel: `${provider}-default`,
        source: 'config',
        cache: null,
        models: [],
        presets: [],
        controls: [],
        warnings: [],
      };
    },
    async createSession(input) {
      this.createdSessions.push(input);
      return {
        id: 'runtime-session-1',
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? null,
      };
    },
    async sendMessage(sessionId, content, input): Promise<RuntimeMessageResult> {
      this.sentMessages.push({ sessionId, content, input });
      return {
        segments: [
          {
            kind: 'text',
            text: JSON.stringify(decision),
            toolName: null,
            toolId: null,
          },
        ],
        inputTokens: 1,
        outputTokens: 1,
        tokensUsed: 2,
      };
    },
    async observeSession() {
      return { session: {} };
    },
    async streamSession() {},
    async createWakeup() {
      return {
        request: { id: 'wakeup-1' },
        coalesced: false,
      };
    },
    async callMcp() {
      return null;
    },
    async cancelSession() {},
    async closeSession() {},
    async deleteSession(sessionId) {
      return {
        sessionId,
        status: 'deleted',
      };
    },
  };
}

test('provider-agent adapter creates a supervised runtime session and validates the decision', async () => {
  const runtimeClient = createRuntimeStub(semanticPlanDecision());
  const evidenceSink = createInMemoryToolEvidenceSink();
  const result = await requestProviderAgentDecision({
    runtimeClient,
    target: {
      provider: 'codex',
      model: 'gpt-5.4',
    },
    observation: observation(),
    supervision: {
      product: 'cats-work',
      surface: 'provider-agent',
      runId: 'run-1',
      actionId: 'action-1',
      actorRef: 'agent:codex',
      reason: 'semantic_decision',
      evidenceSink,
    },
  });

  assert.equal(result.sessionId, 'runtime-session-1');
  assert.equal(result.decision.kind, 'semantic_plan');
  assert.equal(runtimeClient.createdSessions.length, 1);
  assert.equal(runtimeClient.sentMessages.length, 1);
  assert.equal(evidenceSink.read().length, 2);

  const createInput = runtimeClient.createdSessions[0] as {
    context?: { metadata?: Record<string, unknown> };
  };
  const sendInput = runtimeClient.sentMessages[0]?.input as {
    context?: { metadata?: Record<string, unknown> };
  };
  const prompt = JSON.parse(runtimeClient.sentMessages[0]?.content ?? '{}') as {
    schema?: string;
    observation?: {
      observationId?: string;
      availableTools?: Array<{
        inputHints?: string[];
        manifest?: { name?: string };
      }>;
    };
  };

  assert.equal(prompt.schema, PROVIDER_AGENT_DECISION_PROMPT_SCHEMA);
  assert.equal(prompt.observation?.observationId, 'observation-1');
  assert.equal(prompt.observation?.availableTools?.[0]?.manifest?.name, 'work.context.lookup');
  assert.deepEqual(prompt.observation?.availableTools?.[0]?.inputHints, [
    'input.key must be one of the lookup keys exposed by the product.',
    'Return a compact tool_request; do not invent Work ids.',
  ]);
  assert.equal(createInput.context?.metadata?.supervisionBoundary, RUNTIME_SUPERVISION_BOUNDARY);
  assert.equal(sendInput.context?.metadata?.supervisionBoundary, RUNTIME_SUPERVISION_BOUNDARY);
  assert.equal(sendInput.context?.metadata?.providerAgentPromptSchema, PROVIDER_AGENT_DECISION_PROMPT_SCHEMA);
});

test('provider-agent adapter can use an existing runtime session', async () => {
  const runtimeClient = createRuntimeStub(semanticPlanDecision());

  await requestProviderAgentDecision({
    runtimeClient,
    target: {
      provider: 'codex',
      model: 'gpt-5.4',
      sessionId: 'existing-session',
    },
    observation: observation(),
    supervision: {
      product: 'cats-work',
      surface: 'provider-agent',
      runId: 'run-1',
      actionId: 'action-1',
      actorRef: 'agent:codex',
      reason: 'semantic_decision',
    },
  });

  assert.equal(runtimeClient.createdSessions.length, 0);
  assert.equal(runtimeClient.sentMessages[0]?.sessionId, 'existing-session');
});

test('provider-agent adapter preserves the provider-authored semantic plan', async () => {
  const providerAuthoredDecision: ProviderAgentDecision = {
    ...semanticPlanDecision(),
    decisionId: 'decision-provider-authored',
    planId: 'plan-provider-authored',
    rationaleSummary: 'Provider chose to look up scoped context before responding.',
    steps: [
      {
        stepId: 'provider-step-lookup',
        summary: 'Provider-selected lookup.',
        action: 'call_tool',
        toolName: 'work.context.lookup',
        input: {
          selectedBy: 'provider-agent',
          detailLevel: 'brief',
        },
      },
      {
        stepId: 'provider-step-respond',
        summary: 'Provider-selected response.',
        action: 'respond',
        dependsOn: ['provider-step-lookup'],
      },
    ],
  };
  const runtimeClient = createRuntimeStub(providerAuthoredDecision);

  const result = await requestProviderAgentDecision({
    runtimeClient,
    target: {
      provider: 'codex',
      model: 'gpt-5.4',
      sessionId: 'existing-session',
    },
    observation: observation(),
    supervision: {
      product: 'cats-work',
      surface: 'provider-agent',
      runId: 'run-1',
      actionId: 'action-1',
      actorRef: 'agent:codex',
      reason: 'semantic_decision',
    },
  });

  assert.deepEqual(result.decision, providerAuthoredDecision);
});

test('provider-agent adapter rejects invalid bounded observations before runtime calls', async () => {
  const runtimeClient = createRuntimeStub(semanticPlanDecision());
  const invalidObservation = observation();
  invalidObservation.summaries = [
    {
      key: 'raw_message_body',
      kind: 'opaque_ref',
      value: 'raw text must not cross the seam',
    },
  ];

  await assert.rejects(
    () => requestProviderAgentDecision({
      runtimeClient,
      target: {
        provider: 'codex',
        model: 'gpt-5.4',
      },
      observation: invalidObservation,
      supervision: {
        product: 'cats-work',
        surface: 'provider-agent',
        runId: 'run-1',
        actionId: 'action-1',
        actorRef: 'agent:codex',
        reason: 'semantic_decision',
      },
    }),
    (error) => error instanceof ProviderAgentAdapterError
      && error.code === 'INVALID_OBSERVATION',
  );
  assert.equal(runtimeClient.createdSessions.length, 0);
  assert.equal(runtimeClient.sentMessages.length, 0);
});

test('provider-agent adapter rejects runtime decisions outside the bounded tool surface', async () => {
  const invalidDecision: ProviderAgentDecision = {
    ...semanticPlanDecision(),
    steps: [
      {
        stepId: 'step-secret',
        summary: 'Try an unavailable tool.',
        action: 'call_tool',
        toolName: 'work.secret.write',
      },
    ],
  };
  const runtimeClient = createRuntimeStub(invalidDecision);

  await assert.rejects(
    () => requestProviderAgentDecision({
      runtimeClient,
      target: {
        provider: 'codex',
        model: 'gpt-5.4',
      },
      observation: observation(),
      supervision: {
        product: 'cats-work',
        surface: 'provider-agent',
        runId: 'run-1',
        actionId: 'action-1',
        actorRef: 'agent:codex',
        reason: 'semantic_decision',
      },
    }),
    (error) => error instanceof ProviderAgentAdapterError
      && error.code === 'INVALID_DECISION',
  );
});

test('provider-agent adapter rejects malformed runtime decision JSON without crashing', async () => {
  const malformedDecision = {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'semantic_plan',
    decisionId: 42,
    planId: null,
    confidence: 'medium',
    rationaleSummary: false,
    steps: [
      {
        stepId: 7,
        summary: null,
        action: 'respond',
      },
    ],
  } as unknown as ProviderAgentDecision;
  const runtimeClient = createRuntimeStub(malformedDecision);

  await assert.rejects(
    () => requestProviderAgentDecision({
      runtimeClient,
      target: {
        provider: 'codex',
        model: 'gpt-5.4',
      },
      observation: observation(),
      supervision: {
        product: 'cats-work',
        surface: 'provider-agent',
        runId: 'run-1',
        actionId: 'action-1',
        actorRef: 'agent:codex',
        reason: 'semantic_decision',
      },
    }),
    (error) => error instanceof ProviderAgentAdapterError
      && error.code === 'INVALID_DECISION',
  );
});

test('provider-agent adapter rejects non-array semantic-plan steps without crashing', async () => {
  const malformedDecision = {
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
  const runtimeClient = createRuntimeStub(malformedDecision);

  await assert.rejects(
    () => requestProviderAgentDecision({
      runtimeClient,
      target: {
        provider: 'codex',
        model: 'gpt-5.4',
      },
      observation: observation(),
      supervision: {
        product: 'cats-work',
        surface: 'provider-agent',
        runId: 'run-1',
        actionId: 'action-1',
        actorRef: 'agent:codex',
        reason: 'semantic_decision',
      },
    }),
    (error) => error instanceof ProviderAgentAdapterError
      && error.code === 'INVALID_DECISION',
  );
});

test('provider-agent adapter keeps direct runtime calls inside the supervision boundary', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'src/platform/orchestration/providerAgentAdapter.ts'),
    'utf8',
  );

  assert.equal(source.includes('runtimeClient.createSession('), false);
  assert.equal(source.includes('runtimeClient.sendMessage('), false);
  assert.equal(source.includes('./planner'), false);
  assert.equal(source.includes('./dispatch'), false);
  assert.equal(source.includes('buildOrchestratorTurnPlan'), false);
  assert.equal(source.includes('createSupervisedRuntimeSession'), true);
  assert.equal(source.includes('sendSupervisedRuntimeMessage'), true);
  assert.equal(buildProviderAgentDecisionPrompt(observation()).includes('raw_message_body'), false);
});
