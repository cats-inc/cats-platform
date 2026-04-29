import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
  validateProviderAgentBoundedObservation,
  type ProviderAgentBoundedObservation,
  type ProviderAgentToolDescriptor,
} from '../src/platform/orchestration/index.ts';
import {
  DEFAULT_SUPERVISION_SCHEMA_VERSION,
  createProviderCapabilityBootstrapDiagnosticSink,
  parseProviderCapabilityBootstrapConfigDocument,
  resolveProviderCapabilityProfile,
  type ProviderCapabilityBootstrapConfig,
  type ProviderCapabilityBootstrapDiagnosticSink,
  type SupervisedToolManifest,
  type SupervisionPolicy,
} from '../src/platform/supervision/index.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import {
  appendMessage,
  createChannel,
  createParallelChatGroup,
  requireChannel,
  setChannelOrchestratorLease,
} from '../src/products/chat/state/model/index.ts';
import { buildChatProviderAgentObservation } from '../src/products/chat/state/providerAgentObservation.ts';
import {
  prepareDispatchTurn,
  type PreparedDispatchTurn,
} from '../src/products/chat/state/runtime-dispatch/turn.ts';
import { beginChannelMessageDispatch } from '../src/products/chat/state/runtime-dispatch/routing.ts';
import type { ChatState } from '../src/products/chat/api/contracts.ts';
import type { RuntimeClient } from '../src/platform/runtime/client.ts';
import {
  buildChannelDispatchOrchestratorSummaryFromBegun,
} from '../src/products/chat/api/orchestratorDispatchResponse.ts';

function policy(): SupervisionPolicy {
  return {
    autonomy: 'single_step',
    taskGranularity: 'tiny',
    toolScope: 'read_only',
    scaffolding: 'sop_template',
    validation: 'schema_required',
    checkpointCadence: 'every_step',
    approvalThreshold: 'low',
    fallbackPolicy: 'ask_human',
  };
}

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

function fixtureBootstrapConfig(): ProviderCapabilityBootstrapConfig {
  const parsed = parseProviderCapabilityBootstrapConfigDocument(
    {
      version: 1,
      profiles: [
        {
          id: 'claude-native-sonnet-strong-candidate',
          selector: {
            provider: 'claude',
            instance: 'native',
            model: 'sonnet',
            control: 'default',
          },
          initialTreatment: 'strong_agent',
          confidenceLevel: 'catalog_only',
          reason: 'Operator-approved strong Chat candidate.',
        },
      ],
    },
    { observedAt: '2026-04-28T00:00:00.000Z' },
  );

  if (!parsed.config) {
    throw new Error('Expected fixture bootstrap config to parse.');
  }

  return parsed.config;
}

function appendAndPrepare(input: {
  state: ChatState;
  channelId: string;
  body: string;
  now?: Date;
  messageMetadata?: {
    recipientParticipantIds?: string[];
    workflowShape?: 'sequential' | 'concurrent' | 'converge' | 'parallel' | null;
  };
  providerCapabilityBootstrapConfig?: ProviderCapabilityBootstrapConfig | null;
  providerCapabilityBootstrapDiagnosticSink?: ProviderCapabilityBootstrapDiagnosticSink;
}): { state: ChatState; prepared: PreparedDispatchTurn } {
  const now = input.now ?? new Date('2026-04-28T00:01:00.000Z');
  const appended = appendMessage(
    input.state,
    input.channelId,
    {
      senderKind: 'user',
      senderName: 'User',
      body: input.body,
    },
    now,
  );
  const prepared = prepareDispatchTurn(
    appended.state,
    input.channelId,
    {
      body: input.body,
      ...(input.messageMetadata ? { messageMetadata: input.messageMetadata } : {}),
    },
    now,
    undefined,
    {
      providerCapabilityBootstrapConfig: input.providerCapabilityBootstrapConfig,
      providerCapabilityBootstrapDiagnosticSink: input.providerCapabilityBootstrapDiagnosticSink,
    },
  );
  return {
    state: appended.state,
    prepared,
  };
}

function summaryValue(prepared: PreparedDispatchTurn, key: string): unknown {
  return prepared.providerAgentObservation?.summaries.find((summary) => summary.key === key)?.value;
}

function actorProvider(prepared: PreparedDispatchTurn): string | null {
  const target = prepared.providerAgentObservation?.actor.target;
  return target?.kind === 'execution_target' ? target.provider : null;
}

function runtimeStub(): RuntimeClient {
  return {
    async closeSession() {},
  } as RuntimeClient;
}

test('Chat provider-agent observation carries routing metadata without raw message content', () => {
  const rawMessage = 'please summarize the confidential roadmap';
  const state = createChannel(
    createDefaultChatState(),
    {
      title: 'Agent room',
      topic: 'Implementation',
      originSurface: 'chat',
      roomMode: 'boss_chat',
    },
    new Date('2026-04-28T00:00:00.000Z'),
  );
  const channel = state.channels[0]!;
  const profile = resolveProviderCapabilityProfile(
    {
      provider: 'ollama',
      model: 'qwen2.5-coder:7b',
    },
    {
      assessedAt: '2026-04-28T00:00:00.000Z',
    },
  );
  const availableTools: ProviderAgentToolDescriptor[] = [
    {
      manifest: manifest('chat.context.lookup'),
      reason: 'Read bounded chat context by reference.',
    },
  ];

  const observation = buildChatProviderAgentObservation({
    state,
    channelId: channel.id,
    actorRef: 'orchestrator',
    capabilityProfile: profile,
    policy: policy(),
    availableTools,
    messageCharacterCount: rawMessage.length,
    routing: {
      trigger: 'room_default',
      targetCount: 1,
      unresolvedCount: 0,
      mentionCount: 0,
      resolution: {
        routingMode: 'room_default',
        selectionKind: 'default_target',
        defaultTarget: {
          participantKind: 'orchestrator',
          participantId: 'orchestrator',
          participantName: 'Orchestrator',
        },
        defaultTargetReason: null,
        fallbackTarget: null,
        blockedReason: null,
        note: null,
      },
    },
    now: new Date('2026-04-28T00:01:00.000Z'),
  });

  assert.deepEqual(validateProviderAgentBoundedObservation(observation), []);
  assert.equal(observation.task.kind, 'chat_turn');
  assert.equal(observation.policy.dials.scaffolding, 'sop_template');
  assert.equal(
    observation.summaries.find((summary) => summary.key === 'input_character_count')?.value,
    rawMessage.length,
  );
  assert.equal(JSON.stringify(observation).includes(rawMessage), false);
  assert.equal(
    observation.contextRefs.includes(`chat-channel:${channel.id}`),
    true,
  );
});

test('Chat dispatch preparation builds a provider-agent observation for the user turn', () => {
  const rawMessage = 'route this without exposing raw body to the provider-agent seam';
  let state = createChannel(
    createDefaultChatState(),
    {
      title: 'Dispatch room',
      topic: 'Implementation',
      originSurface: 'chat',
      roomMode: 'boss_chat',
    },
    new Date('2026-04-28T00:00:00.000Z'),
  );
  const channel = state.channels[0]!;
  const appended = appendMessage(
    state,
    channel.id,
    {
      senderKind: 'user',
      senderName: 'User',
      body: rawMessage,
    },
    new Date('2026-04-28T00:01:00.000Z'),
  );
  state = appended.state;

  const prepared = prepareDispatchTurn(
    state,
    channel.id,
    { body: rawMessage },
    new Date('2026-04-28T00:01:00.000Z'),
  );

  assert.equal(prepared.providerAgentObservation?.task.kind, 'chat_turn');
  assert.equal(
    prepared.providerAgentObservation?.summaries.some((summary) =>
      summary.key === 'input_character_count' && summary.value === rawMessage.length),
    true,
  );
  assert.equal(JSON.stringify(prepared.providerAgentObservation).includes(rawMessage), false);
});

test('Chat direct-cat turns keep deterministic target selection before provider-agent observation', () => {
  const now = new Date('2026-04-28T00:00:00.000Z');
  const state = createChannel(
    createDefaultChatState(),
    {
      title: '',
      topic: 'Direct review',
      originSurface: 'chat',
      entryKind: 'direct',
      roomMode: 'direct_cat_chat',
      cats: [
        {
          name: 'DirectReviewer',
          provider: 'claude',
          instance: 'native',
          model: 'claude-sonnet',
        },
      ],
    },
    now,
  );
  const channelId = state.selectedChannelId;
  const directCatId = state.cats[0]?.id;
  if (!directCatId) {
    throw new Error('Expected direct cat id.');
  }

  const { prepared } = appendAndPrepare({
    state,
    channelId,
    body: 'Check this direct lane.',
  });

  assert.equal(prepared.initialResolution.trigger, 'room_default');
  assert.deepEqual(
    prepared.initialResolution.targets.map((target) => target.participantId),
    [directCatId],
  );
  assert.equal(summaryValue(prepared, 'routing_target_count'), 1);
  assert.equal(summaryValue(prepared, 'routing_selection_kind'), 'default_target');
  assert.equal(
    prepared.providerAgentObservation?.contextRefs.includes(`chat-room-mode:direct_cat_chat`),
    true,
  );
});

test('Chat solo turns bind provider-agent observation to the selected execution target', () => {
  const state = createChannel(
    createDefaultChatState(),
    {
      title: 'Solo model room',
      topic: 'Solo',
      originSurface: 'chat',
      entryKind: 'solo',
      pendingProvider: 'claude',
      pendingInstance: 'native',
      pendingModel: 'sonnet',
    },
    new Date('2026-04-28T00:00:00.000Z'),
  );

  const { prepared } = appendAndPrepare({
    state,
    channelId: state.selectedChannelId,
    body: 'Use the selected solo model.',
  });

  assert.equal(prepared.initialResolution.targets[0]?.participantKind, 'orchestrator');
  assert.equal(actorProvider(prepared), 'claude');
  assert.equal(
    prepared.providerAgentObservation?.contextRefs.includes('chat-channel-intent:provider_solo_thread'),
    true,
  );
});

test('Chat provider-agent observation applies explicit capability bootstrap config', () => {
  const state = createChannel(
    createDefaultChatState(),
    {
      title: 'Configured solo model room',
      topic: 'Solo',
      originSurface: 'chat',
      entryKind: 'solo',
      pendingProvider: 'claude',
      pendingInstance: 'native',
      pendingModel: 'sonnet',
    },
    new Date('2026-04-28T00:00:00.000Z'),
  );

  const { prepared } = appendAndPrepare({
    state,
    channelId: state.selectedChannelId,
    body: 'Use the configured solo model.',
    providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
  });

  assert.equal(actorProvider(prepared), 'claude');
  assert.equal(
    prepared.providerAgentObservation?.actor.capabilityProfileRef,
    'provider-capability:claude:native:sonnet:default',
  );
  assert.equal(prepared.providerAgentObservation?.policy.dials.taskGranularity, 'step');
});

test('Chat provider-agent observation emits bootstrap matched-rule diagnostics', () => {
  const state = createChannel(
    createDefaultChatState(),
    {
      title: 'Diagnostic solo model room',
      topic: 'Solo',
      originSurface: 'chat',
      entryKind: 'solo',
      pendingProvider: 'claude',
      pendingInstance: 'native',
      pendingModel: 'sonnet',
    },
    new Date('2026-04-28T00:00:00.000Z'),
  );
  const sink = createProviderCapabilityBootstrapDiagnosticSink();

  appendAndPrepare({
    state,
    channelId: state.selectedChannelId,
    body: 'Record the bootstrap rule used for this turn.',
    providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
    providerCapabilityBootstrapDiagnosticSink: sink,
  });

  const records = sink.list();
  assert.equal(records.some((record) => record.code === 'matched_rule'), true);
  assert.deepEqual(records[0]?.ruleIds, ['claude-native-sonnet-strong-candidate']);
  assert.equal(records[0]?.target?.provider, 'claude');
  assert.equal(records[0]?.target?.model, 'sonnet');
});

test('Chat group explicit mentions become bounded provider-agent routing summaries', () => {
  const state = createChannel(
    createDefaultChatState(),
    {
      title: 'Group agent room',
      topic: 'Group',
      originSurface: 'chat',
      entryKind: 'group',
      temporaryParticipants: [
        {
          participantId: 'participant-reviewer',
          name: 'RuntimeReviewer',
          provider: 'claude',
          instance: 'native',
          model: 'claude-sonnet',
        },
        {
          participantId: 'participant-verifier',
          name: 'RuntimeVerifier',
          provider: 'codex',
          instance: 'default',
          model: 'gpt-5.4',
        },
      ],
    },
    new Date('2026-04-28T00:00:00.000Z'),
  );

  const { prepared } = appendAndPrepare({
    state,
    channelId: state.selectedChannelId,
    body: '@RuntimeVerifier verify the proposal.',
  });

  assert.equal(prepared.initialResolution.trigger, 'explicit_mention');
  assert.deepEqual(
    prepared.initialResolution.targets.map((target) => target.participantId),
    ['participant-verifier'],
  );
  assert.equal(summaryValue(prepared, 'routing_target_count'), 1);
  assert.equal(summaryValue(prepared, 'routing_mention_count'), 1);
  assert.equal(summaryValue(prepared, 'routing_selection_kind'), 'explicit_mentions');
});

test('Chat parallel member turns keep solo execution targets inside the provider-agent seam', () => {
  const state = createParallelChatGroup(
    createDefaultChatState(),
    {
      title: 'Parallel implementation',
      originSurface: 'chat',
      targets: [
        {
          provider: 'claude',
          instance: 'native',
          model: 'claude-sonnet',
        },
        {
          provider: 'codex',
          instance: 'default',
          model: 'gpt-5.4',
        },
      ],
    },
    new Date('2026-04-28T00:00:00.000Z'),
  );
  const codexMember = state.channels.find((channel) => channel.pendingProvider === 'codex');
  if (!codexMember) {
    throw new Error('Expected Codex parallel member channel.');
  }

  const { prepared } = appendAndPrepare({
    state,
    channelId: codexMember.id,
    body: 'Handle your branch of the parallel run.',
  });

  assert.equal(actorProvider(prepared), 'codex');
  assert.equal(prepared.initialResolution.targets[0]?.participantKind, 'orchestrator');
  assert.equal(summaryValue(prepared, 'routing_target_count'), 1);
  assert.equal(
    prepared.providerAgentObservation?.contextRefs.includes('chat-channel-intent:provider_solo_thread'),
    true,
  );
});

test('Chat dispatch can hand bounded observations to a provider-agent decision requester', async () => {
  const rawMessage = 'decide next step without leaking this raw text';
  let capturedObservation: ProviderAgentBoundedObservation | null = null;
  const state = createChannel(
    createDefaultChatState(),
    {
      title: 'Provider decision room',
      topic: 'Decision seam',
      originSurface: 'chat',
      entryKind: 'solo',
      pendingProvider: 'claude',
      pendingInstance: 'native',
      pendingModel: 'claude-sonnet',
    },
    new Date('2026-04-28T00:00:00.000Z'),
  );

  const begun = await beginChannelMessageDispatch(
    state,
    state.selectedChannelId,
    {
      body: rawMessage,
    },
    {} as RuntimeClient,
    new Date('2026-04-28T00:01:00.000Z'),
    {
      providerAgentDecisionRequester: async ({ observation }) => {
        capturedObservation = observation;
        return {
          contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
          kind: 'semantic_plan',
          decisionId: 'decision-chat-1',
          planId: 'provider-plan-chat-1',
          confidence: 'medium',
          rationaleSummary: 'Use the bounded Chat turn metadata.',
          steps: [
            {
              stepId: 'respond',
              summary: 'Respond to the routed Chat turn.',
              action: 'respond',
            },
          ],
        };
      },
    },
  );

  assert.equal(begun.providerAgentDecision?.kind, 'semantic_plan');
  const dispatchSummary = buildChannelDispatchOrchestratorSummaryFromBegun(
    state.selectedChannelId,
    begun,
  );
  assert.equal(dispatchSummary.planId, 'provider-plan-chat-1');
  assert.equal(dispatchSummary.planner, 'provider_agent_decision');
  assert.equal(capturedObservation?.task.kind, 'chat_turn');
  assert.equal(JSON.stringify(capturedObservation).includes(rawMessage), false);
  assert.equal(begun.userMessage.metadata.orchestratorPlanner, 'provider_agent_observation');
  assert.equal(begun.preparedTurn?.initialResolution.targets[0]?.participantKind, 'orchestrator');
});

test('Chat dispatch clears stale explicit model selections with the pending model', async () => {
  const now = new Date('2026-04-25T01:45:00.000Z');
  let state = createChannel(
    createDefaultChatState(),
    {
      title: 'Solo dispatch target clear',
      topic: 'Dispatch should clear the old explicit model selection.',
      originSurface: 'code',
      entryKind: 'solo',
      pendingProvider: 'openai',
      pendingModel: 'gpt-5.4',
      pendingModelSelection: { entryId: 'gpt-5.4', entryMode: 'explicit' },
      skipBossCatGreeting: true,
    },
    now,
  );
  const channelId = state.selectedChannelId;
  state = setChannelOrchestratorLease(state, channelId, {
    sessionId: 'session-dispatch-old-selection',
    status: 'running',
    provider: 'openai',
    model: 'gpt-5.4',
    modelSelection: { entryId: 'gpt-5.4', entryMode: 'explicit' },
    startedAt: now.toISOString(),
    lastError: null,
  }, now);

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: 'Use the provider default for this turn.',
      pendingModel: null,
      pendingModelSelection: null,
    },
    runtimeStub(),
    now,
  );

  const dispatchedChannel = requireChannel(begun.state, channelId);
  assert.equal(dispatchedChannel.pendingModel, null);
  assert.equal(dispatchedChannel.pendingModelSelection, null);
  assert.equal(dispatchedChannel.orchestratorLease.model, null);
  assert.equal(dispatchedChannel.orchestratorLease.modelSelection ?? null, null);
});
