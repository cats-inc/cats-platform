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
import {
  createDefaultCoreState,
  upsertCoreProject,
  upsertCoreWorkItem,
} from '../src/core/model/index.ts';
import type { CatsCoreState } from '../src/core/types.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import {
  appendMessage,
  createChannel,
  createParallelChatGroup,
  requireChannel,
  resolveChannelCanonicalIdentity,
  setChannelOrchestratorLease,
} from '../src/products/chat/state/model/index.ts';
import { buildChatProviderAgentObservation } from '../src/products/chat/state/providerAgentObservation.ts';
import type { ChatNaturalProductIntentMode } from '../src/products/chat/shared/naturalProductIntentMode.ts';
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
import {
  WORK_EXTERNAL_LINK_ISSUE_TOOL,
  WORK_EXTERNAL_UNLINK_ISSUE_TOOL,
  WORK_ITEM_ASSIGN_PROJECT_TOOL,
  WORK_ITEM_CAPTURE_TOOL,
  WORK_ITEM_UPDATE_TOOL,
  WORK_ITEM_PREPARE_EXECUTION_TOOL,
  WORK_ITEM_PROPOSE_SPLIT_TOOL,
  WORK_PROJECT_CREATE_TOOL,
  WORK_PROJECT_LOOKUP_TOOL,
  WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL,
} from '../src/products/work/shared/workToolSurface.ts';

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
  core?: CatsCoreState;
  providerCapabilityBootstrapConfig?: ProviderCapabilityBootstrapConfig | null;
  providerCapabilityBootstrapDiagnosticSink?: ProviderCapabilityBootstrapDiagnosticSink;
  naturalProductIntentMode?: ChatNaturalProductIntentMode;
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
    input.core,
    {
      providerCapabilityBootstrapConfig: input.providerCapabilityBootstrapConfig,
      providerCapabilityBootstrapDiagnosticSink: input.providerCapabilityBootstrapDiagnosticSink,
      naturalProductIntentMode: input.naturalProductIntentMode,
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

function observationToolNames(
  observation: ProviderAgentBoundedObservation | null | undefined,
): string[] {
  return observation?.availableTools.map((descriptor) => descriptor.manifest.name) ?? [];
}

function observationToolDescriptor(
  observation: ProviderAgentBoundedObservation | null | undefined,
  toolName: string,
): ProviderAgentToolDescriptor | undefined {
  return observation?.availableTools.find((descriptor) =>
    descriptor.manifest.name === toolName);
}

function assertObservationToolHints(
  observation: ProviderAgentBoundedObservation | null | undefined,
  toolName: string,
  expectedPatterns: RegExp[],
): void {
  const descriptor = observationToolDescriptor(observation, toolName);
  assert.ok(descriptor, `${toolName} should be exposed in the observation`);
  assert.ok(
    descriptor.inputHints && descriptor.inputHints.length > 0,
    `${toolName} should carry input hints`,
  );

  const joinedHints = descriptor.inputHints.join('\n');
  for (const pattern of expectedPatterns) {
    assert.match(joinedHints, pattern);
  }
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
      roomMode: 'chat_channel',
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
      roomMode: 'chat_channel',
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
  assert.equal(
    prepared.providerAgentObservation?.contextRefs.includes('work-intake-surface:chat'),
    true,
  );
  assert.equal(
    prepared.providerAgentObservation?.contextRefs.some((ref) =>
      ref.startsWith('work-intake-transport-binding:')),
    false,
  );
  assert.equal(
    prepared.providerAgentObservation?.contextRefs.includes(
      `work-intake-source-message:${appended.message.id}`,
    ),
    true,
  );
});

test('Chat dispatch preparation annotates Telegram-origin turns for Work intake', () => {
  const rawMessage = 'telegram: capture a Work Item without exposing this raw body';
  let state = createChannel(
    createDefaultChatState(),
    {
      title: 'Telegram dispatch room',
      topic: 'Implementation',
      originSurface: 'chat',
      roomMode: 'chat_channel',
    },
    new Date('2026-05-13T00:00:00.000Z'),
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
    new Date('2026-05-13T00:01:00.000Z'),
  );
  state = appended.state;

  const prepared = prepareDispatchTurn(
    state,
    channel.id,
    { body: rawMessage },
    new Date('2026-05-13T00:01:00.000Z'),
    undefined,
    {
      transport: 'telegram',
      transportBindingId: 'telegram-binding-1',
    },
  );

  assert.equal(JSON.stringify(prepared.providerAgentObservation).includes(rawMessage), false);
  assert.equal(
    prepared.providerAgentObservation?.contextRefs.includes('work-intake-surface:telegram'),
    true,
  );
  assert.equal(
    prepared.providerAgentObservation?.contextRefs.includes(
      'work-intake-transport-binding:telegram-binding-1',
    ),
    true,
  );
  assert.equal(
    prepared.providerAgentObservation?.contextRefs.includes(
      `work-intake-source-message:${appended.message.id}`,
    ),
    true,
  );
});

test('Chat provider-agent observation exposes read-only Work intake proposal hints', () => {
  const now = new Date('2026-05-13T09:30:00.000Z');
  const state = createChannel(
    createDefaultChatState(),
    {
      title: '',
      topic: 'Work intake',
      originSurface: 'chat',
      entryKind: 'direct',
      roomMode: 'direct_message',
      cats: [
        {
          name: 'Boss Cat',
          provider: 'claude',
          instance: 'native',
          model: 'sonnet',
        },
      ],
    },
    now,
  );

  const { prepared } = appendAndPrepare({
    state,
    channelId: state.selectedChannelId,
    body: 'Boss Cat 幫我記一個待辦：整理 Telegram 匯入的 work items',
    now: new Date('2026-05-13T09:31:00.000Z'),
    core: createDefaultCoreState(),
    providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
    naturalProductIntentMode: 'cat_tool',
  });
  const observation = prepared.providerAgentObservation;
  const toolNames = observationToolNames(observation);

  assert.equal(toolNames.includes(WORK_ITEM_PROPOSE_SPLIT_TOOL), true);
  assert.equal(toolNames.includes(WORK_ITEM_CAPTURE_TOOL), false);
  assertObservationToolHints(observation, WORK_ITEM_PROPOSE_SPLIT_TOOL, [
    /maxItems\?: number/u,
    /Read-only: propose candidate Work Items only/u,
  ]);
  assert.equal(
    observation?.contextRefs.includes('work-intake-surface:chat'),
    true,
  );
  assert.equal(JSON.stringify(observation).includes('整理 Telegram 匯入的 work items'), false);
  assert.deepEqual(validateProviderAgentBoundedObservation(observation!), []);
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
      roomMode: 'direct_message',
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
    prepared.providerAgentObservation?.contextRefs.includes(`chat-room-mode:direct_message`),
    true,
  );
});

test('Chat provider-agent observation exposes read-only Boss Cat execution preparation', () => {
  const now = new Date('2026-05-13T10:00:00.000Z');
  let state = createChannel(
    createDefaultChatState(),
    {
      title: '',
      topic: 'Work execution',
      originSurface: 'chat',
      entryKind: 'direct',
      roomMode: 'direct_message',
      cats: [
        {
          name: 'Boss Cat',
          provider: 'claude',
          instance: 'native',
          model: 'sonnet',
        },
      ],
    },
    now,
  );
  const bossCatId = state.cats[0]?.id;
  if (!bossCatId) {
    throw new Error('Expected Boss Cat id.');
  }
  state = {
    ...state,
    bossCatId,
  };
  const channelId = state.selectedChannelId;
  const { conversationId } = resolveChannelCanonicalIdentity(state, channelId);
  const core = upsertCoreWorkItem(
    createDefaultCoreState(),
    {
      id: 'work-item-intake-prepare-1',
      title: 'Prepare the work intake backlog',
      status: 'ready',
      projectId: null,
      conversationId,
      taskId: null,
      parentWorkItemId: null,
      ownerActorId: 'actor-owner',
      assignedActorIds: [],
      summary: null,
      metadata: {},
    },
    now,
  ).core;

  const { prepared } = appendAndPrepare({
    state,
    channelId,
    body: 'Boss Cat 幫忙逐一開工這些待辦事項',
    now: new Date('2026-05-13T10:01:00.000Z'),
    core,
    providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
  });
  const toolNames = observationToolNames(prepared.providerAgentObservation);

  assert.equal(toolNames.includes(WORK_ITEM_PREPARE_EXECUTION_TOOL), true);
  assert.equal(toolNames.includes(WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL), false);
  assertObservationToolHints(prepared.providerAgentObservation, WORK_ITEM_PREPARE_EXECUTION_TOOL, [
    /executionGoal\?: string/u,
    /do not create Tasks, Runs, or runtime sessions/u,
  ]);
  assert.equal(
    prepared.providerAgentObservation?.contextRefs.includes(
      'work-execution-preparation-scope:visible_selection',
    ),
    true,
  );
  assert.equal(
    prepared.providerAgentObservation?.contextRefs.includes(
      'work-execution-preparation-work-item:work-item-intake-prepare-1',
    ),
    true,
  );
  assert.equal(
    prepared.providerAgentObservation?.invariants.some((invariant) =>
      invariant.includes(WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL)
      && invariant.includes('Do not request')),
    true,
  );
});

test('Chat provider-agent observation exposes local external tracker binding for explicit requests', () => {
  const now = new Date('2026-05-13T10:10:00.000Z');
  let state = createChannel(
    createDefaultChatState(),
    {
      title: '',
      topic: 'External tracker binding',
      originSurface: 'chat',
      entryKind: 'direct',
      roomMode: 'direct_message',
      cats: [
        {
          name: 'Boss Cat',
          provider: 'claude',
          instance: 'native',
          model: 'sonnet',
        },
      ],
    },
    now,
  );
  const bossCatId = state.cats[0]?.id;
  if (!bossCatId) {
    throw new Error('Expected Boss Cat id.');
  }
  state = {
    ...state,
    bossCatId,
  };
  const channelId = state.selectedChannelId;
  const { conversationId } = resolveChannelCanonicalIdentity(state, channelId);
  const core = upsertCoreWorkItem(
    createDefaultCoreState(),
    {
      id: 'work-item-external-1',
      title: 'Bind issue tracker',
      status: 'planned',
      projectId: null,
      conversationId,
      taskId: null,
      parentWorkItemId: null,
      ownerActorId: 'actor-owner',
      assignedActorIds: [],
      summary: null,
      metadata: {},
    },
    now,
  ).core;
  const externalUrl = 'https://github.com/cats-inc/cats-platform/issues/123';

  const { prepared } = appendAndPrepare({
    state,
    channelId,
    body: `Boss Cat link work-item-external-1 to ${externalUrl}`,
    now: new Date('2026-05-13T10:11:00.000Z'),
    core,
    providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
  });
  const observation = prepared.providerAgentObservation;
  const toolNames = observationToolNames(observation);

  assert.equal(observation?.policy.dials.toolScope, 'narrow_write');
  assert.equal(toolNames.includes(WORK_EXTERNAL_LINK_ISSUE_TOOL), true);
  assert.equal(toolNames.includes(WORK_EXTERNAL_UNLINK_ISSUE_TOOL), true);
  assertObservationToolHints(observation, WORK_EXTERNAL_LINK_ISSUE_TOOL, [
    /Cats re-resolves local Work refs/u,
    /Do not call external tracker APIs/u,
  ]);
  assert.equal(
    observation?.contextRefs.includes('work-external-binding-operation:link'),
    true,
  );
  assert.equal(
    observation?.contextRefs.includes('work-external-binding-local-id:work-item-external-1'),
    true,
  );
  assert.equal(
    observation?.contextRefs.includes('work-external-binding-provider:github'),
    true,
  );
  assert.equal(
    observation?.contextRefs.includes('work-external-binding-external-id:123'),
    true,
  );
  assert.equal(JSON.stringify(observation).includes(externalUrl), false);
  assert.deepEqual(validateProviderAgentBoundedObservation(observation!), []);
});

test('Chat provider-agent observation exposes read-only Work triage lookup for explicit refs', () => {
  const now = new Date('2026-05-13T10:20:00.000Z');
  let state = createChannel(
    createDefaultChatState(),
    {
      title: '',
      topic: 'Work triage',
      originSurface: 'chat',
      entryKind: 'direct',
      roomMode: 'direct_message',
      cats: [
        {
          name: 'Boss Cat',
          provider: 'claude',
          instance: 'native',
          model: 'sonnet',
        },
      ],
    },
    now,
  );
  const bossCatId = state.cats[0]?.id;
  if (!bossCatId) {
    throw new Error('Expected Boss Cat id.');
  }
  state = {
    ...state,
    bossCatId,
  };
  const channelId = state.selectedChannelId;
  const { conversationId } = resolveChannelCanonicalIdentity(state, channelId);
  const core = upsertCoreWorkItem(
    createDefaultCoreState(),
    {
      id: 'work-item-triage-1',
      title: 'Find a project home',
      status: 'planned',
      projectId: null,
      conversationId,
      taskId: null,
      parentWorkItemId: null,
      ownerActorId: 'actor-owner',
      assignedActorIds: [],
      summary: null,
      metadata: {},
    },
    now,
  ).core;

  const { prepared } = appendAndPrepare({
    state,
    channelId,
    body: 'Boss Cat triage work-item-triage-1 and find a project for it',
    now: new Date('2026-05-13T10:21:00.000Z'),
    core,
    providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
  });
  const observation = prepared.providerAgentObservation;
  const toolNames = observationToolNames(observation);

  assert.equal(observation?.policy.dials.toolScope, 'read_only');
  assert.equal(toolNames.includes(WORK_PROJECT_LOOKUP_TOOL), true);
  assert.equal(toolNames.includes(WORK_ITEM_UPDATE_TOOL), false);
  assert.equal(toolNames.includes(WORK_PROJECT_CREATE_TOOL), false);
  assertObservationToolHints(observation, WORK_PROJECT_LOOKUP_TOOL, [
    /query\?: string/u,
    /Read-only/u,
  ]);
  assert.equal(
    observation?.contextRefs.includes('work-triage-work-item:work-item-triage-1'),
    true,
  );
  assert.deepEqual(validateProviderAgentBoundedObservation(observation!), []);
});

test('Chat provider-agent observation exposes narrow-write Project create for explicit requests', () => {
  const state = createChannel(
    createDefaultChatState(),
    {
      title: '',
      topic: 'Project create',
      originSurface: 'chat',
      entryKind: 'direct',
      roomMode: 'direct_message',
      cats: [
        {
          name: 'Boss Cat',
          provider: 'claude',
          instance: 'native',
          model: 'sonnet',
        },
      ],
    },
    new Date('2026-05-13T10:30:00.000Z'),
  );
  const channelId = state.selectedChannelId;

  const { prepared } = appendAndPrepare({
    state,
    channelId,
    body: 'Boss Cat create project Cats Mobile',
    now: new Date('2026-05-13T10:31:00.000Z'),
    core: createDefaultCoreState(),
    providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
  });
  const observation = prepared.providerAgentObservation;
  const toolNames = observationToolNames(observation);

  assert.equal(observation?.policy.dials.toolScope, 'narrow_write');
  assert.equal(toolNames.includes(WORK_PROJECT_CREATE_TOOL), true);
  assert.equal(toolNames.includes(WORK_ITEM_UPDATE_TOOL), false);
  assertObservationToolHints(observation, WORK_PROJECT_CREATE_TOOL, [
    /title: string/u,
    /primaryConversationId/u,
  ]);
  assert.equal(
    observation?.contextRefs.includes('work-triage-action:create_project'),
    true,
  );
  assert.deepEqual(validateProviderAgentBoundedObservation(observation!), []);
});

test('Chat provider-agent observation exposes narrow-write Work Item update for explicit refs', () => {
  const now = new Date('2026-05-13T10:40:00.000Z');
  const state = createChannel(
    createDefaultChatState(),
    {
      title: '',
      topic: 'Work Item update',
      originSurface: 'chat',
      entryKind: 'direct',
      roomMode: 'direct_message',
      cats: [
        {
          name: 'Boss Cat',
          provider: 'claude',
          instance: 'native',
          model: 'sonnet',
        },
      ],
    },
    now,
  );
  const channelId = state.selectedChannelId;
  const { conversationId } = resolveChannelCanonicalIdentity(state, channelId);
  const core = upsertCoreWorkItem(
    createDefaultCoreState(),
    {
      id: 'work-item-update-1',
      title: 'Needs update',
      status: 'planned',
      projectId: null,
      conversationId,
      taskId: null,
      parentWorkItemId: null,
      ownerActorId: 'actor-owner',
      assignedActorIds: [],
      summary: null,
      metadata: {},
    },
    now,
  ).core;

  const { prepared } = appendAndPrepare({
    state,
    channelId,
    body: 'Boss Cat update work-item-update-1 and mark it ready',
    now: new Date('2026-05-13T10:41:00.000Z'),
    core,
    providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
  });
  const observation = prepared.providerAgentObservation;
  const toolNames = observationToolNames(observation);

  assert.equal(observation?.policy.dials.toolScope, 'narrow_write');
  assert.equal(toolNames.includes(WORK_ITEM_UPDATE_TOOL), true);
  assert.equal(toolNames.includes(WORK_PROJECT_CREATE_TOOL), false);
  assertObservationToolHints(observation, WORK_ITEM_UPDATE_TOOL, [
    /status\?: "draft" \| "planned" \| "ready" \| "blocked"/u,
    /re-resolves workItemId/u,
  ]);
  assert.equal(
    observation?.contextRefs.includes('work-triage-action:update_work_item'),
    true,
  );
  assert.equal(
    observation?.contextRefs.includes('work-triage-work-item:work-item-update-1'),
    true,
  );
  assert.deepEqual(validateProviderAgentBoundedObservation(observation!), []);
});

test('Chat provider-agent observation exposes narrow-write Work Item Project assignment for explicit refs', () => {
  const now = new Date('2026-05-13T10:50:00.000Z');
  const state = createChannel(
    createDefaultChatState(),
    {
      title: '',
      topic: 'Work Item assign Project',
      originSurface: 'chat',
      entryKind: 'direct',
      roomMode: 'direct_message',
      cats: [
        {
          name: 'Boss Cat',
          provider: 'claude',
          instance: 'native',
          model: 'sonnet',
        },
      ],
    },
    now,
  );
  const channelId = state.selectedChannelId;
  const { conversationId } = resolveChannelCanonicalIdentity(state, channelId);
  const withProject = upsertCoreProject(
    createDefaultCoreState(),
    {
      id: 'project-assign-1',
      title: 'Assign Project',
      status: 'active',
      ownerActorId: 'actor-owner',
      primaryConversationId: conversationId,
      summary: 'Project used by assignment observation tests.',
    },
    now,
  ).core;
  const core = upsertCoreWorkItem(
    withProject,
    {
      id: 'work-item-assign-1',
      title: 'Needs a Project',
      status: 'planned',
      projectId: null,
      conversationId,
      taskId: null,
      parentWorkItemId: null,
      ownerActorId: 'actor-owner',
      assignedActorIds: [],
      summary: null,
      metadata: {},
    },
    now,
  ).core;

  const { prepared } = appendAndPrepare({
    state,
    channelId,
    body: 'Boss Cat assign work-item-assign-1 to project-assign-1',
    now: new Date('2026-05-13T10:51:00.000Z'),
    core,
    providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
  });
  const observation = prepared.providerAgentObservation;
  const toolNames = observationToolNames(observation);

  assert.equal(observation?.policy.dials.toolScope, 'narrow_write');
  assert.equal(toolNames.includes(WORK_ITEM_ASSIGN_PROJECT_TOOL), true);
  assert.equal(toolNames.includes(WORK_PROJECT_CREATE_TOOL), false);
  assertObservationToolHints(observation, WORK_ITEM_ASSIGN_PROJECT_TOOL, [
    /note\?: string/u,
    /workItemId and projectId/u,
  ]);
  assert.equal(
    observation?.contextRefs.includes('work-triage-action:assign_project'),
    true,
  );
  assert.equal(
    observation?.contextRefs.includes('work-triage-work-item:work-item-assign-1'),
    true,
  );
  assert.equal(
    observation?.contextRefs.includes('work-triage-project:project-assign-1'),
    true,
  );
  assert.deepEqual(validateProviderAgentBoundedObservation(observation!), []);
});

test('Chat default turns bind provider-agent observation to the selected execution target', () => {
  const state = createChannel(
    createDefaultChatState(),
    {
      title: 'Default model room',
      topic: 'Default',
      originSurface: 'chat',
      entryKind: 'default',
      pendingProvider: 'claude',
      pendingInstance: 'native',
      pendingModel: 'sonnet',
    },
    new Date('2026-04-28T00:00:00.000Z'),
  );

  const { prepared } = appendAndPrepare({
    state,
    channelId: state.selectedChannelId,
    body: 'Use the selected default model.',
  });

  assert.equal(prepared.initialResolution.targets[0]?.participantKind, 'orchestrator');
  assert.equal(actorProvider(prepared), 'claude');
  assert.equal(
    prepared.providerAgentObservation?.contextRefs.includes('chat-channel-intent:provider_default_chat'),
    true,
  );
});

test('Chat provider-agent observation applies explicit capability bootstrap config', () => {
  const state = createChannel(
    createDefaultChatState(),
    {
      title: 'Configured default model room',
      topic: 'Default',
      originSurface: 'chat',
      entryKind: 'default',
      pendingProvider: 'claude',
      pendingInstance: 'native',
      pendingModel: 'sonnet',
    },
    new Date('2026-04-28T00:00:00.000Z'),
  );

  const { prepared } = appendAndPrepare({
    state,
    channelId: state.selectedChannelId,
    body: 'Use the configured default model.',
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
      title: 'Diagnostic default model room',
      topic: 'Default',
      originSurface: 'chat',
      entryKind: 'default',
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

test('Chat parallel member turns keep default execution targets inside the provider-agent seam', () => {
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
    prepared.providerAgentObservation?.contextRefs.includes('chat-channel-intent:provider_default_chat'),
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
      entryKind: 'default',
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
      title: 'Default dispatch target clear',
      topic: 'Dispatch should clear the old explicit model selection.',
      originSurface: 'code',
      entryKind: 'default',
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
