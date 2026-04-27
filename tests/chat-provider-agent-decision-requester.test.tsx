import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
  type ProviderAgentBoundedObservation,
  type ProviderAgentDecision,
} from '../src/platform/orchestration/index.ts';
import type { RuntimeClient } from '../src/platform/runtime/client.ts';
import { createChatProviderAgentDecisionRequester } from '../src/products/chat/state/providerAgentDecisionRequester.ts';

function policy() {
  return {
    autonomy: 'single_step',
    taskGranularity: 'tiny',
    toolScope: 'read_only',
    scaffolding: 'few_shot',
    validation: 'best_effort',
    checkpointCadence: 'every_step',
    approvalThreshold: 'low',
    fallbackPolicy: 'retry',
  } as const;
}

function decision(): ProviderAgentDecision {
  return {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'semantic_plan',
    decisionId: 'chat-decision-1',
    planId: 'chat-plan-1',
    confidence: 'medium',
    rationaleSummary: 'Respond to the routed Chat turn.',
    steps: [
      {
        stepId: 'respond',
        summary: 'Respond to the routed Chat turn.',
        action: 'respond',
      },
    ],
  };
}

function observation(
  target: ProviderAgentBoundedObservation['actor']['target'] = {
    kind: 'execution_target',
    provider: 'claude',
    model: 'claude-sonnet',
  },
): ProviderAgentBoundedObservation {
  return {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    observationId: 'chat-observation-1',
    runId: 'chat:channel-1',
    goal: 'Handle the next Chat turn using bounded routing metadata.',
    task: {
      kind: 'chat_turn',
      risk: 'low',
    },
    actor: {
      actorRef: 'chat-orchestrator',
      target,
      capabilityProfileRef: 'provider-capability:claude:native:sonnet',
      providerRef: 'provider-capability:claude:native:sonnet',
    },
    policy: {
      dials: policy(),
      allowedFallbacks: ['retry'],
    },
    availableTools: [],
    contextRefs: ['chat-channel:channel-1'],
    summaries: [
      {
        key: 'routing_target_count',
        kind: 'count',
        value: 1,
      },
    ],
    budget: {
      maxDurationMs: 30_000,
      hardStop: true,
    },
    invariants: ['Chat deterministic routing stays product-owned.'],
  };
}

function createRuntimeStub(options: { responseText?: string } = {}): RuntimeClient & {
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
    async getProviderConfig() {
      return {};
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
    async createSession(input) {
      this.createdSessions.push(input);
      return {
        id: 'provider-agent-session-1',
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? null,
      };
    },
    async sendMessage(sessionId, content, input) {
      this.sentMessages.push({ sessionId, content, input });
      return {
        segments: [
          {
            kind: 'text',
            text: options.responseText ?? JSON.stringify(decision()),
            toolName: null,
            toolId: null,
          },
        ],
        inputTokens: 10,
        outputTokens: 8,
        tokensUsed: 18,
      };
    },
    async closeSession() {},
  } as RuntimeClient & {
    createdSessions: unknown[];
    sentMessages: Array<{ sessionId: string; content: string; input: unknown }>;
  };
}

test('Chat provider-agent decision requester calls the runtime adapter for execution targets', async () => {
  const runtimeClient = createRuntimeStub();
  const requester = createChatProviderAgentDecisionRequester();

  const result = await requester({
    state: {} as never,
    channelId: 'channel-1',
    payload: { body: 'hello' },
    observation: observation(),
    runtimeClient,
    now: new Date('2026-04-28T00:00:00.000Z'),
  });

  assert.equal(result?.kind, 'semantic_plan');
  assert.equal(result?.planId, 'chat-plan-1');
  assert.equal(runtimeClient.createdSessions.length, 1);
  const createdSession = runtimeClient.createdSessions[0] as {
    provider?: string;
    model?: string | null;
    instructions?: string;
    context?: { source?: string; reason?: string; metadata?: Record<string, unknown> };
  };
  assert.equal(createdSession.provider, 'claude');
  assert.equal(createdSession.model, 'claude-sonnet');
  assert.equal(createdSession.context?.source, 'automation');
  assert.equal(createdSession.context?.reason, 'chat-provider-agent-decision-session');
  assert.equal(createdSession.context?.metadata?.channelId, 'channel-1');
  assert.equal(createdSession.context?.metadata?.observationId, 'chat-observation-1');
  assert.equal(createdSession.context?.metadata?.providerAgentAdapterVersion, 1);
  assert.equal(createdSession.context?.metadata?.providerAgentPromptSchema, 'cats.provider_agent.decision.v1');
  assert.equal(createdSession.context?.metadata?.runId, 'chat:channel-1');
  assert.equal(
    createdSession.context?.metadata?.supervisionBoundary,
    'cats-supervision-runtime-boundary',
  );
  assert.match(createdSession.instructions ?? '', /Return exactly one JSON object/u);
  assert.equal(runtimeClient.sentMessages[0]?.sessionId, 'provider-agent-session-1');
  assert.equal(
    runtimeClient.sentMessages[0]?.content.includes('"observationId":"chat-observation-1"'),
    true,
  );
});

test('Chat provider-agent decision requester ignores non-execution targets', async () => {
  const runtimeClient = createRuntimeStub();
  const requester = createChatProviderAgentDecisionRequester();

  const result = await requester({
    state: {} as never,
    channelId: 'channel-1',
    payload: { body: 'hello' },
    observation: observation({
      kind: 'temporary_participant',
      participantId: 'participant-1',
    }),
    runtimeClient,
    now: new Date('2026-04-28T00:00:00.000Z'),
  });

  assert.equal(result, null);
  assert.equal(runtimeClient.createdSessions.length, 0);
  assert.equal(runtimeClient.sentMessages.length, 0);
});

test('Chat provider-agent decision requester can fail open for live route enablement', async () => {
  const runtimeClient = createRuntimeStub({ responseText: 'not json' });
  const requester = createChatProviderAgentDecisionRequester({ failureMode: 'return_null' });

  const result = await requester({
    state: {} as never,
    channelId: 'channel-1',
    payload: { body: 'hello' },
    observation: observation(),
    runtimeClient,
    now: new Date('2026-04-28T00:00:00.000Z'),
  });

  assert.equal(result, null);
  assert.equal(runtimeClient.createdSessions.length, 1);
  assert.equal(runtimeClient.sentMessages.length, 1);
});
