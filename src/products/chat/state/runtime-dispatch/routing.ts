import { randomUUID } from 'node:crypto';

import type {
  ChannelDispatchResult,
  SendChannelMessageInput,
  ChatMessage,
  ChatState,
  MessageOrigin,
  DirectSlashModePostureChangeMetadata,
  ProductIntentCommandMetadata,
  ProductIntentCommandSource,
} from '../../api/contracts.js';
import type { CatsCoreState } from '../../../../core/types.js';
import {
  upsertCoreLane,
  upsertCoreSegment,
  upsertCoreTurn,
} from '../../../../core/model/index.js';
import type { ProviderAgentDecision } from '../../../../platform/orchestration/index.js';
import type {
  ProviderCapabilityBootstrapConfig,
  ProviderCapabilityBootstrapDiagnosticSink,
} from '../../../../platform/supervision/index.js';
import type {
  RoomRoutingGuardReason,
} from '../../../../shared/roomRouting.js';
import type { RuntimeDispatchRecoveryPolicy } from '../../../../shared/runtimeRecovery.js';
import type {
  CompanionBoxStore,
} from '../companion-box/index.js';
import type { ChatStore } from '../store.js';
import type { CatsMemoryService } from '../../../../platform/memory/index.js';
import { bestEffortFlushRuntimeSessionMemory } from '../../../../platform/memory/runtimeMaintenance.js';
import type {
  RuntimeClient,
} from '../../../../platform/runtime/client.js';
import {
  appendMessage,
  requireChannel,
  resolveChannelCanonicalIdentity,
  setChannelPendingExecutionTarget,
  setChannelOrchestratorLease,
} from '../model/index.js';
import {
  sameProviderModelSelection,
} from '../../../../shared/providerSelection.js';
import { normalizeRuntimeDispatchRecoveryPolicy } from '../../../../shared/runtimeRecovery.js';
import {
  buildDirectLaneTransportBindingId,
  buildChatOwnerParticipantId,
} from '../../../../shared/chatCoreIds.js';
import {
  buildCanonicalChatUserMessage,
} from '../chatCoreInterop.js';
import { refreshDerivedMemoryLayers } from '../memoryLayers.js';
import {
  resolveNextPendingExecutionTarget,
} from '../pendingExecutionTarget.js';
import { isProviderDefaultChatChannel } from '../../shared/channelTopology.js';
import {
  type RuntimeTransportContext,
} from '../runtimeTargeting.js';
import {
  prepareDispatchTurn,
  prepareDispatchTurnForExistingUserMessage,
} from './turn.js';
import {
  buildDeterministicRoutingPlanMessageMetadata,
  type DeterministicChatRoutingPlan,
} from './deterministicPlan.js';
import type {
  ChannelDispatchCancellationRegistry,
} from './cancellation.js';
import {
  materializeInFlightDispatchState,
  persistInFlightDispatchState,
} from './persistence.js';
import {
  finalizeDispatchTurn,
} from './finalize.js';
import { processDispatchQueue } from './loop.js';
import { mergeCompletedDispatchState } from './merge.js';
import {
  addWorkflowCheckpoint,
  appendWorkflowEvent,
  createWorkflowEvent,
  finalizeWorkflowTurn,
} from '../room-routing/workflow.js';
import { applyRoomRoutingSnapshot } from '../runtime-session/state.js';
import { resolveOrchestratorLeaseAttachment } from '../../shared/channelParticipants.js';
import { parseProductIntentCommand } from '../../shared/productIntentCommands.js';

export type ProviderAgentDecisionRequester = (input: {
  state: ChatState;
  channelId: string;
  payload: SendChannelMessageInput;
  observation: NonNullable<import('./turn.js').PreparedDispatchTurn['providerAgentObservation']>;
  runtimeClient: RuntimeClient;
  now: Date;
}) => Promise<ProviderAgentDecision | null>;

interface RouteChannelMessageOptions {
  transport?: RuntimeTransportContext;
  transportBindingId?: string | null;
  companionStore?: CompanionBoxStore;
  memoryService?: CatsMemoryService;
  chatStore?: Pick<ChatStore, 'write' | 'readCore' | 'writeCore' | 'updateCore'>;
  latestState?: ChatState;
  runtimeRecovery?: Partial<RuntimeDispatchRecoveryPolicy>;
  chatStatePath?: string;
  runtimeDataDir?: string;
  cancellationRegistry?: ChannelDispatchCancellationRegistry;
  onStateWritten?: (channelId: string) => void;
  deterministicRoutingPlan?: DeterministicChatRoutingPlan | null;
  providerAgentDecisionRequester?: ProviderAgentDecisionRequester;
  providerCapabilityBootstrapConfig?: ProviderCapabilityBootstrapConfig | null;
  providerCapabilityBootstrapDiagnosticSink?: ProviderCapabilityBootstrapDiagnosticSink;
}

function readMessageRetryMetadata(
  message: ChatMessage,
): SendChannelMessageInput['messageMetadata'] | undefined {
  const candidateMetadata = message.metadata ?? {};
  const recipientParticipantIds = Array.isArray(candidateMetadata.recipientParticipantIds)
    ? candidateMetadata.recipientParticipantIds.filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      )
    : [];
  const workflowShape = candidateMetadata.workflowShape;
  const normalizedWorkflowShape =
    workflowShape === 'sequential'
      || workflowShape === 'concurrent'
      || workflowShape === 'converge'
      || workflowShape === 'parallel'
      ? workflowShape
      : null;

  if (recipientParticipantIds.length === 0 && !normalizedWorkflowShape) {
    return undefined;
  }

  return {
    ...(recipientParticipantIds.length > 0
      ? {
          recipientParticipantIds,
        }
      : {}),
    ...(normalizedWorkflowShape
      ? {
          workflowShape: normalizedWorkflowShape,
        }
      : {}),
  };
}

function resolveUserMessageOrigin(transport: RuntimeTransportContext | undefined): MessageOrigin {
  return transport === 'telegram' ? 'telegram' : 'web';
}

function resolveProductIntentCommandSource(
  transport: RuntimeTransportContext | undefined,
): ProductIntentCommandSource {
  return transport === 'telegram' ? 'telegram' : 'web';
}

function resolveProductIntentCommandMetadata(
  body: string,
  source: ProductIntentCommandSource,
): ProductIntentCommandMetadata | null {
  const parsed = parseProductIntentCommand(body);
  if (!parsed || parsed.kind !== 'product_intent_command') {
    return null;
  }

  return {
    version: 1,
    source,
    command: parsed.command,
    posture: parsed.posture,
    targetProduct: parsed.targetProduct,
    argumentText: parsed.argumentText,
    rawCommandToken: parsed.rawCommandToken,
    botSuffix: parsed.botSuffix,
  };
}

function buildBaseUserMessageMetadata(input: {
  payload: SendChannelMessageInput;
  channelId: string;
  deterministicRoutingPlan: DeterministicChatRoutingPlan | null;
  transportBindingId?: string | null;
  productIntentCommand?: ProductIntentCommandMetadata | null;
}): Record<string, unknown> {
  return {
    ...(input.payload.messageMetadata ?? {}),
    ...(input.productIntentCommand
      ? {
          productIntentCommand: input.productIntentCommand,
        }
      : {}),
    ...buildDeterministicRoutingPlanMessageMetadata(
      input.deterministicRoutingPlan?.channelId === input.channelId
        ? input.deterministicRoutingPlan
        : null,
    ),
    ...(input.transportBindingId ? { transportBindingId: input.transportBindingId } : {}),
    ...(input.payload.choiceResponse
      ? {
          event: 'choice_response',
          sourceMessageId: input.payload.choiceResponse.sourceMessageId,
        }
      : {}),
  };
}

function readProductPostureChangeMetadata(
  value: unknown,
): DirectSlashModePostureChangeMetadata | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1
    || (
      record.posture !== 'chat'
      && record.posture !== 'work'
      && record.posture !== 'code'
    )
  ) {
    return null;
  }

  return record as unknown as DirectSlashModePostureChangeMetadata;
}

function resolvePreviousProductPosture(
  channel: ReturnType<typeof requireChannel>,
): DirectSlashModePostureChangeMetadata['posture'] | null {
  for (let index = channel.messages.length - 1; index >= 0; index -= 1) {
    const message = channel.messages[index]!;
    const postureChange = readProductPostureChangeMetadata(
      message.metadata.directSlashModePostureChange,
    );
    if (postureChange) {
      return postureChange.posture;
    }
  }
  return null;
}

function resolveDirectAudienceCatId(
  channel: ReturnType<typeof requireChannel>,
): string | null {
  if (
    channel.channelKind !== 'direct_message'
    && channel.roomRouting?.mode !== 'direct_message'
  ) {
    return null;
  }

  return channel.roomRouting?.defaultRecipientId?.trim()
    || channel.recoverableDirectLaneCatId?.trim()
    || null;
}

function buildProductPostureChangeMetadata(input: {
  channel: ReturnType<typeof requireChannel>;
  channelId: string;
  productIntentCommand: ProductIntentCommandMetadata;
}): DirectSlashModePostureChangeMetadata {
  const previousPosture = resolvePreviousProductPosture(input.channel);
  return {
    version: 1,
    command: input.productIntentCommand.command,
    previousPosture,
    posture: input.productIntentCommand.posture,
    targetProduct: input.productIntentCommand.targetProduct,
    changed: previousPosture !== input.productIntentCommand.posture,
    sourceTransport: input.productIntentCommand.source,
    sourceChannelId: input.channelId,
    audienceCatId: resolveDirectAudienceCatId(input.channel),
    capabilityProfileKind: null,
  };
}

function describeProductIntentCommandAck(
  productIntentCommand: ProductIntentCommandMetadata,
  accepted: boolean,
): string {
  if (!accepted) {
    return 'Product mode commands are available in direct messages for this MVP.';
  }

  switch (productIntentCommand.command) {
    case 'chat':
      return 'Chat mode is active.';
    case 'work':
      return 'Work mode is active. I will clarify the work before creating an item.';
    case 'code':
      return 'Code mode is active. I will clarify the coding work before creating an item.';
  }
}

async function persistProductIntentCommandCoreSegment(input: {
  chatStore?: Pick<ChatStore, 'updateCore'>;
  state: ChatState;
  channelId: string;
  userMessage: ChatMessage;
  ackMessage: ChatMessage;
  productIntentCommand: ProductIntentCommandMetadata;
  postureChange: DirectSlashModePostureChangeMetadata | null;
  accepted: boolean;
  now: Date;
}): Promise<void> {
  if (!input.chatStore) {
    return;
  }

  const { conversationId, containerId } = resolveChannelCanonicalIdentity(
    input.state,
    input.channelId,
  );
  const turnId = `turn-product-intent-${input.userMessage.id}`;
  const laneId = `lane-product-intent-${input.userMessage.id}`;
  const segmentId = `segment-product-intent-${input.userMessage.id}`;
  const event = input.accepted
    ? 'product_intent_posture_changed'
    : 'product_intent_unsupported_context';
  const metadata = {
    event,
    version: 1,
    channelId: input.channelId,
    containerId,
    sourceMessageId: input.userMessage.id,
    ackMessageId: input.ackMessage.id,
    accepted: input.accepted,
    productIntentCommand: input.productIntentCommand,
    ...(input.postureChange
      ? {
          directSlashModePostureChange: input.postureChange,
        }
      : {}),
    activeProductPosture: input.productIntentCommand.posture,
    targetProduct: input.productIntentCommand.targetProduct,
    source: input.productIntentCommand.source,
  };

  await input.chatStore.updateCore((core) => {
    let nextCore = core;
    nextCore = upsertCoreTurn(
      nextCore,
      {
        id: turnId,
        conversationId,
        kind: 'system',
        status: 'completed',
        sourceParticipantId: buildChatOwnerParticipantId(input.channelId),
        createdAt: input.userMessage.createdAt,
        startedAt: input.userMessage.createdAt,
        completedAt: input.ackMessage.createdAt,
        metadata,
      },
      input.now,
    ).core;
    nextCore = upsertCoreLane(
      nextCore,
      {
        id: laneId,
        turnId,
        conversationId,
        participantId: buildChatOwnerParticipantId(input.channelId),
        agentId: null,
        orderIndex: 0,
        status: 'completed',
        createdAt: input.userMessage.createdAt,
        startedAt: input.userMessage.createdAt,
        completedAt: input.ackMessage.createdAt,
        metadata,
      },
      input.now,
    ).core;
    nextCore = upsertCoreSegment(
      nextCore,
      {
        id: segmentId,
        laneId,
        turnId,
        conversationId,
        sequence: 0,
        kind: 'system',
        status: 'complete',
        content: input.ackMessage.body,
        createdAt: input.ackMessage.createdAt,
        completedAt: input.ackMessage.createdAt,
        metadata,
      },
      input.now,
    ).core;
    return nextCore;
  });
}

function buildRetrySendPayload(message: ChatMessage): SendChannelMessageInput {
  const messageMetadata = readMessageRetryMetadata(message);
  return {
    body: message.body,
    senderName: message.senderName,
    ...(message.choiceResponse
      ? {
          choiceResponse: message.choiceResponse,
        }
      : {}),
    ...(messageMetadata
      ? {
          messageMetadata,
        }
      : {}),
  };
}

function restoreMissingTranscriptMessage(
  state: ChatState,
  channelId: string,
  message: ChatMessage,
  now: Date,
): ChatState {
  const existingChannel = requireChannel(state, channelId);
  if (existingChannel.messages.some((candidate) => candidate.id === message.id)) {
    return state;
  }

  const nextState = structuredClone(state);
  const nextChannel = requireChannel(nextState, channelId);
  const insertIndex = nextChannel.messages.findIndex((candidate) =>
    candidate.createdAt.localeCompare(message.createdAt) > 0);
  const nextIndex = insertIndex >= 0 ? insertIndex : nextChannel.messages.length;
  nextChannel.messages.splice(nextIndex, 0, structuredClone(message));
  nextChannel.lastMessageAt = nextChannel.messages.at(-1)?.createdAt ?? nextChannel.lastMessageAt;
  return refreshDerivedMemoryLayers(nextState, channelId, now);
}

function applyDeterministicPlanMetadataToExistingUserMessage(
  state: ChatState,
  channelId: string,
  messageId: string,
  plan: DeterministicChatRoutingPlan | null,
  now: Date,
): {
  state: ChatState;
  userMessage: ChatMessage | null;
} {
  if (plan && plan.channelId !== channelId) {
    return { state, userMessage: null };
  }

  const planMetadata = buildDeterministicRoutingPlanMessageMetadata(plan);
  if (Object.keys(planMetadata).length === 0) {
    return { state, userMessage: null };
  }

  const channel = requireChannel(state, channelId);
  const messageIndex = channel.messages.findIndex((message) => message.id === messageId);
  if (messageIndex < 0) {
    return { state, userMessage: null };
  }

  const nextState = structuredClone(state);
  const nextChannel = requireChannel(nextState, channelId);
  const nextMessage = nextChannel.messages[messageIndex]!;
  nextMessage.metadata = {
    ...(nextMessage.metadata ?? {}),
    ...planMetadata,
  };
  return {
    state: refreshDerivedMemoryLayers(nextState, channelId, now),
    userMessage: nextMessage,
  };
}

function buildPreparedTurnDeterministicRoutingPlan(
  channelId: string,
  preparedTurn: import('./turn.js').PreparedDispatchTurn,
): DeterministicChatRoutingPlan {
  return {
    planId:
      preparedTurn.providerAgentObservation?.observationId
      ?? `chat-deterministic:${channelId}:${preparedTurn.userMessage.id}`,
    channelId,
    metadata: {
      planner: preparedTurn.providerAgentObservation
        ? 'provider_agent_observation'
        : 'chat_deterministic_router',
      loopMode: 'agent_driven',
      dispatchBoundary: 'supervised_runtime_boundary',
      runtimeToolBoundary: 'runtime_mcp_facade',
    },
    routing: {
      trigger: preparedTurn.initialResolution.trigger,
      resolution: structuredClone(preparedTurn.initialResolution.resolution),
      mentionNames: [...preparedTurn.initialResolution.mentionNames],
      unresolvedMentions: [...preparedTurn.initialResolution.unresolved],
      initialTargets: preparedTurn.initialResolution.targets.map((target) => {
        const targetStatus = preparedTurn.activeTurn.targetStatuses.find((candidate) =>
          candidate.participant.participantKind === target.participantKind
          && candidate.participant.participantId === target.participantId
          && candidate.laneId === (target.laneId ?? null));
        return {
          participantKind: target.participantKind,
          participantId: target.participantId,
          participantName: target.participantName,
          laneId: target.laneId,
          sessionId: target.sessionId,
          trigger: targetStatus?.trigger ?? preparedTurn.initialResolution.trigger,
          plannedDepth: targetStatus?.depth ?? 0,
        };
      }),
    },
  };
}

function describeGuardReason(reason: Exclude<RoomRoutingGuardReason, null>): string {
  switch (reason) {
    case 'max_continuations':
      return 'the continuation depth limit';
    case 'max_dispatches':
      return 'the per-turn dispatch limit';
    case 'max_target_visits':
      return 'the per-target revisit limit';
    case 'anti_ping_pong':
      return 'anti-ping-pong protection';
    default:
      return 'a routing guard';
  }
}

export interface BegunChannelMessageDispatch {
  state: ChatState;
  results: ChannelDispatchResult[];
  preparedTurn: import('./turn.js').PreparedDispatchTurn | null;
  userMessage: ChatMessage;
  providerAgentDecision: ProviderAgentDecision | null;
}

export async function beginChannelMessageDispatch(
  state: ChatState,
  channelId: string,
  payload: SendChannelMessageInput,
  runtimeClient: RuntimeClient,
  now: Date = new Date(),
  options: RouteChannelMessageOptions = {},
): Promise<BegunChannelMessageDispatch> {
  let nextState = state;
  const channelBeforeMessage = requireChannel(nextState, channelId);
  const deterministicRoutingPlan = options.deterministicRoutingPlan ?? null;
  const productIntentCommand = resolveProductIntentCommandMetadata(
    payload.body,
    resolveProductIntentCommandSource(options.transport),
  );
  if (productIntentCommand) {
    const userAppend = appendMessage(
      nextState,
      channelId,
      {
        senderKind: 'user',
        senderName: payload.senderName?.trim() || 'User',
        body: payload.body,
      },
      now,
      {
        metadata: buildBaseUserMessageMetadata({
          payload,
          channelId,
          deterministicRoutingPlan,
          transportBindingId: options.transportBindingId,
          productIntentCommand,
        }),
        choiceResponse: payload.choiceResponse,
        origin: resolveUserMessageOrigin(options.transport),
        sourceTransportBindingId: options.transport === 'telegram'
          ? options.transportBindingId ?? null
          : null,
      },
    );
    nextState = userAppend.state;
    const accepted = channelBeforeMessage.channelKind === 'direct_message'
      || channelBeforeMessage.roomRouting?.mode === 'direct_message';
    const postureChange = accepted
      ? buildProductPostureChangeMetadata({
          channel: channelBeforeMessage,
          channelId,
          productIntentCommand,
        })
      : null;
    const ackAppend = appendMessage(
      nextState,
      channelId,
      {
        senderKind: 'system',
        senderName: 'Cats',
        body: describeProductIntentCommandAck(productIntentCommand, accepted),
      },
      now,
      {
        metadata: {
          event: accepted
            ? 'product_intent_posture_changed'
            : 'product_intent_unsupported_context',
          productIntentCommand,
          ...(postureChange
            ? {
                directSlashModePostureChange: postureChange,
              }
            : {}),
          sourceMessageId: userAppend.message.id,
          activeProductPosture: productIntentCommand.posture,
          targetProduct: productIntentCommand.targetProduct,
          accepted,
        },
        incrementUnread: false,
      },
    );
    nextState = refreshDerivedMemoryLayers(ackAppend.state, channelId, now);
    if (options.chatStore) {
      nextState = await options.chatStore.write(nextState);
    }
    await persistProductIntentCommandCoreSegment({
      chatStore: options.chatStore,
      state: nextState,
      channelId,
      userMessage: userAppend.message,
      ackMessage: ackAppend.message,
      productIntentCommand,
      postureChange,
      accepted,
      now,
    });
    options.onStateWritten?.(channelId);
    return {
      state: nextState,
      results: [],
      preparedTurn: null,
      userMessage: userAppend.message,
      providerAgentDecision: null,
    };
  }
  const nextTarget = resolveNextPendingExecutionTarget(channelBeforeMessage, payload);
  const pendingTargetChanged = isProviderDefaultChatChannel(channelBeforeMessage)
    && (
      nextTarget.provider !== channelBeforeMessage.pendingProvider
      || nextTarget.model !== channelBeforeMessage.pendingModel
      || nextTarget.instance !== channelBeforeMessage.pendingInstance
      || !sameProviderModelSelection(
        channelBeforeMessage.pendingModelSelection,
        nextTarget.modelSelection,
      )
    );
  const orchestratorSessionAttachment = resolveOrchestratorLeaseAttachment(channelBeforeMessage);
  const orchestratorSessionId = orchestratorSessionAttachment?.sessionId ?? null;
  if (
    pendingTargetChanged
    && orchestratorSessionId
  ) {
    await bestEffortFlushRuntimeSessionMemory({
      runtimeClient,
      sessionId: orchestratorSessionId,
      requestedPhase: 'pre_reset',
      memoryService: options.memoryService,
      companionStore: options.companionStore,
      coreStore: options.chatStore,
      now,
    });
    await runtimeClient.closeSession(orchestratorSessionId);
    nextState = setChannelOrchestratorLease(
      nextState,
      channelId,
      {
        sessionId: null,
        status: 'not_started',
        lastError: null,
        provider: nextTarget.provider,
        instance: nextTarget.instance,
        model: nextTarget.model,
        modelSelection: nextTarget.modelSelection,
        startedAt: null,
      },
      now,
    );
  }

  nextState = setChannelPendingExecutionTarget(
    nextState,
    channelId,
    {
      provider: nextTarget.provider,
      model: nextTarget.model,
      instance: nextTarget.instance,
      modelSelection: nextTarget.modelSelection,
    },
    now,
  );
  nextState = appendMessage(
    nextState,
    channelId,
    {
      senderKind: 'user',
      senderName: payload.senderName?.trim() || 'User',
      body: payload.body,
    },
    now,
    {
      metadata: {
        ...buildBaseUserMessageMetadata({
          payload,
          channelId,
          deterministicRoutingPlan,
          transportBindingId: options.transportBindingId,
        }),
      },
      choiceResponse: payload.choiceResponse,
      origin: resolveUserMessageOrigin(options.transport),
      sourceTransportBindingId: options.transport === 'telegram'
        ? options.transportBindingId ?? null
        : null,
    },
  ).state;
  nextState = refreshDerivedMemoryLayers(nextState, channelId, now);

  const choiceResponseCore = payload.choiceResponse && options.chatStore
    ? await options.chatStore.readCore()
    : undefined;
  const preparedTurn = prepareDispatchTurn(
    nextState,
    channelId,
    payload,
    now,
    choiceResponseCore,
    {
      deterministicRoutingPlan,
      providerCapabilityBootstrapConfig: options.providerCapabilityBootstrapConfig,
      providerCapabilityBootstrapDiagnosticSink:
        options.providerCapabilityBootstrapDiagnosticSink,
    },
  );
  const effectiveDeterministicRoutingPlan =
    deterministicRoutingPlan ?? buildPreparedTurnDeterministicRoutingPlan(channelId, preparedTurn);
  const metadataApplied = applyDeterministicPlanMetadataToExistingUserMessage(
    preparedTurn.state,
    channelId,
    preparedTurn.userMessage.id,
    effectiveDeterministicRoutingPlan,
    now,
  );
  if (metadataApplied.userMessage) {
    preparedTurn.state = metadataApplied.state;
    preparedTurn.userMessage = metadataApplied.userMessage;
  }
  const providerAgentDecision = preparedTurn.providerAgentObservation
    && options.providerAgentDecisionRequester
    ? await options.providerAgentDecisionRequester({
        state: preparedTurn.state,
        channelId,
        payload,
        observation: preparedTurn.providerAgentObservation,
        runtimeClient,
        now,
      })
    : null;
  nextState = materializeInFlightDispatchState(
    preparedTurn.state,
    channelId,
    preparedTurn.baseRoomRouting,
    preparedTurn.workflow,
    preparedTurn.outcome,
    preparedTurn.latestCheckpoint,
    now,
  );
  nextState = await persistInFlightDispatchState(options.chatStore, nextState);
  options.onStateWritten?.(channelId);

  return {
    state: nextState,
    results: preparedTurn.results,
    preparedTurn: preparedTurn.terminalResult ? null : preparedTurn,
    userMessage: preparedTurn.userMessage,
    providerAgentDecision,
  };
}

export async function beginChannelMessageRetryDispatch(
  state: ChatState,
  channelId: string,
  sourceMessageId: string,
  _runtimeClient: RuntimeClient,
  now: Date = new Date(),
  options: RouteChannelMessageOptions = {},
): Promise<BegunChannelMessageDispatch> {
  let nextState = state;
  const channel = requireChannel(nextState, channelId);
  let core: CatsCoreState | undefined;
  let sourceMessage = channel.messages.find((message) => message.id === sourceMessageId) ?? null;
  const sourceWasMissingFromTranscript = !sourceMessage;
  if (!sourceMessage && options.chatStore) {
    core = await options.chatStore.readCore();
    sourceMessage = buildCanonicalChatUserMessage(core, channelId, sourceMessageId);
  }
  if (!sourceMessage) {
    throw new Error(`Channel message not found: ${sourceMessageId}`);
  }
  if (sourceMessage.senderKind !== 'user') {
    throw new Error(`Only user messages can be retried: ${sourceMessageId}`);
  }

  const choiceResponseCore = sourceMessage.choiceResponse && options.chatStore
    ? (core ?? await options.chatStore.readCore())
    : core;
  if (sourceWasMissingFromTranscript) {
    nextState = restoreMissingTranscriptMessage(nextState, channelId, sourceMessage, now);
  }
  const deterministicRoutingPlan = options.deterministicRoutingPlan ?? null;
  const metadataApplied = applyDeterministicPlanMetadataToExistingUserMessage(
    nextState,
    channelId,
    sourceMessageId,
    deterministicRoutingPlan,
    now,
  );
  nextState = metadataApplied.state;
  if (metadataApplied.userMessage) {
    sourceMessage = metadataApplied.userMessage;
  }
  const preparedTurn = prepareDispatchTurnForExistingUserMessage(
    nextState,
    channelId,
    buildRetrySendPayload(sourceMessage),
    sourceMessageId,
    now,
    choiceResponseCore,
    {
      deterministicRoutingPlan,
      providerCapabilityBootstrapConfig: options.providerCapabilityBootstrapConfig,
      providerCapabilityBootstrapDiagnosticSink:
        options.providerCapabilityBootstrapDiagnosticSink,
    },
  );
  const effectiveDeterministicRoutingPlan =
    deterministicRoutingPlan ?? buildPreparedTurnDeterministicRoutingPlan(channelId, preparedTurn);
  const preparedMetadataApplied = applyDeterministicPlanMetadataToExistingUserMessage(
    preparedTurn.state,
    channelId,
    preparedTurn.userMessage.id,
    effectiveDeterministicRoutingPlan,
    now,
  );
  if (preparedMetadataApplied.userMessage) {
    preparedTurn.state = preparedMetadataApplied.state;
    preparedTurn.userMessage = preparedMetadataApplied.userMessage;
    sourceMessage = preparedMetadataApplied.userMessage;
  }
  const providerAgentDecision = preparedTurn.providerAgentObservation
    && options.providerAgentDecisionRequester
    ? await options.providerAgentDecisionRequester({
        state: preparedTurn.state,
        channelId,
        payload: buildRetrySendPayload(sourceMessage),
        observation: preparedTurn.providerAgentObservation,
        runtimeClient: _runtimeClient,
        now,
      })
    : null;
  nextState = await persistInFlightDispatchState(
    options.chatStore,
    materializeInFlightDispatchState(
      preparedTurn.state,
      channelId,
      preparedTurn.baseRoomRouting,
      preparedTurn.workflow,
      preparedTurn.outcome,
      preparedTurn.latestCheckpoint,
      now,
    ),
  );
  options.onStateWritten?.(channelId);

  return {
    state: nextState,
    results: preparedTurn.results,
    preparedTurn: preparedTurn.terminalResult ? null : preparedTurn,
    userMessage: sourceMessage,
    providerAgentDecision,
  };
}

export async function continueBegunChannelMessageDispatch(
  begun: BegunChannelMessageDispatch,
  channelId: string,
  runtimeClient: RuntimeClient,
  now: Date = new Date(),
  options: RouteChannelMessageOptions = {},
): Promise<{ state: ChatState; results: ChannelDispatchResult[] }> {
  if (!begun.preparedTurn) {
    return { state: begun.state, results: begun.results };
  }

  const runtimeRecovery = normalizeRuntimeDispatchRecoveryPolicy(options.runtimeRecovery);
  let nextState = begun.state;
  const {
    activeTurn,
    baseRoomRouting,
    initialResolution,
    latestCheckpoint: initialCheckpoint,
    maxContinuations,
    maxDispatches,
    maxTargetVisits,
    nowIso,
    outcome,
    results,
    userMessage,
    workflow,
  } = begun.preparedTurn;
  let latestCheckpoint = initialCheckpoint;
  const loopResult = await processDispatchQueue({
    state: nextState,
    channelId,
    runtimeClient,
    now,
    nowIso,
    baseRoomRouting,
    workflow,
    activeTurn,
    outcome,
    latestCheckpoint,
    initialResolution,
    userMessage,
    results,
    maxContinuations,
    maxDispatches,
    maxTargetVisits,
    describeGuardReason,
    transport: options.transport,
    transportBindingId: options.transportBindingId,
    companionStore: options.companionStore,
    memoryService: options.memoryService,
    chatStore: options.chatStore,
    chatStatePath: options.chatStatePath,
    runtimeDataDir: options.runtimeDataDir,
    runtimeRecovery,
    cancellationRegistry: options.cancellationRegistry,
    onStateWritten: options.onStateWritten,
  });
  nextState = loopResult.state;
  latestCheckpoint = loopResult.latestCheckpoint;
  const guardReason = loopResult.guardReason;
  const blockedResolution = loopResult.blockedResolution;

  nextState = finalizeDispatchTurn(nextState, channelId, now, {
    nowIso,
    baseRoomRouting,
    workflow,
    activeTurn,
    outcome,
    latestCheckpoint,
    guardReason,
    blockedResolution,
    userMessageId: userMessage.id,
    describeGuardReason,
  });
  nextState = await persistInFlightDispatchState(options.chatStore, nextState);
  options.onStateWritten?.(channelId);

  return { state: nextState, results };
}

export async function settleBegunChannelMessageDispatchFailure(
  begun: BegunChannelMessageDispatch,
  channelId: string,
  error: unknown,
  now: Date = new Date(),
  options: RouteChannelMessageOptions = {},
): Promise<{ state: ChatState; results: ChannelDispatchResult[] }> {
  if (!begun.preparedTurn) {
    return { state: begun.state, results: begun.results };
  }

  const errorMessage = error instanceof Error
    ? error.message
    : 'Runtime dispatch failed before completion.';
  const {
    activeTurn,
    baseRoomRouting,
    latestCheckpoint: initialCheckpoint,
    outcome,
    results,
    userMessage,
    workflow,
  } = begun.preparedTurn;
  const nowIso = now.toISOString();

  const latestState = options.latestState ?? begun.state;
  const latestChannel = requireChannel(latestState, channelId);
  const canonicalIdentity = resolveChannelCanonicalIdentity(latestState, channelId);
  const { conversationId, containerId } = canonicalIdentity;
  const transportBindingId = options.transportBindingId
    ?? (latestChannel.channelKind === 'direct_message'
      ? buildDirectLaneTransportBindingId(channelId)
      : null);
  let nextState = appendMessage(
    latestState,
    channelId,
    {
      senderKind: 'system',
      senderName: 'Runtime',
      body: `Failed to continue the message dispatch: ${errorMessage}`,
    },
    now,
    {
      metadata: {
        event: 'runtime_error',
        phase: 'dispatch_continue',
        conversationId,
        containerId,
        ...(transportBindingId ? { transportBindingId } : {}),
      },
    },
  ).state;

  outcome.status = 'error';
  outcome.completedAt = nowIso;
  activeTurn.status = 'failed';
  activeTurn.stageId = 'runtime_error';
  activeTurn.completedAt = nowIso;
  activeTurn.updatedAt = nowIso;
  const plannedTargets = activeTurn.targetStatuses.map((target) => structuredClone(target.participant));

  const latestCheckpoint = addWorkflowCheckpoint(
    outcome,
    workflow,
    activeTurn,
    'runtime_error',
    `Room workflow failed before completion: ${errorMessage}`,
    nowIso,
    null,
    plannedTargets,
    {
      error: errorMessage,
      checkpointSeed: randomUUID(),
    },
  );
  appendWorkflowEvent(
    workflow,
    activeTurn,
    createWorkflowEvent(
      activeTurn.id,
      'outcome',
      'failed',
      `Room workflow failed before completion: ${errorMessage}`,
      nowIso,
      null,
      userMessage.id,
      plannedTargets,
      {
        outcomeId: randomUUID(),
        checkpointId: latestCheckpoint.id,
        targetIdentities: activeTurn.targetStatuses.map((target) => ({
          participantKind: target.participant.participantKind,
          participantId: target.participant.participantId,
          laneId: target.laneId,
          sessionId: target.sessionId,
        })),
        metadata: {
          workflowStageId: activeTurn.stageId,
          workflowShape: activeTurn.workflowShape,
          workflowLastCheckpointId: latestCheckpoint.id,
          failedBeforeCompletion: true,
          previousCheckpointId: initialCheckpoint?.id ?? null,
        },
      },
    ),
  );
  finalizeWorkflowTurn(workflow, activeTurn);

  nextState = applyRoomRoutingSnapshot(
    nextState,
    channelId,
    baseRoomRouting,
    workflow,
    outcome,
    latestCheckpoint,
    now,
  );
  if (options.latestState) {
    nextState = mergeCompletedDispatchState(
      latestState,
      begun.state,
      nextState,
      channelId,
      now,
    );
  }
  nextState = await persistInFlightDispatchState(options.chatStore, nextState);
  options.onStateWritten?.(channelId);

  return { state: nextState, results };
}

export async function routeChannelMessage(
  state: ChatState,
  channelId: string,
  payload: SendChannelMessageInput,
  runtimeClient: RuntimeClient,
  now: Date = new Date(),
  options: RouteChannelMessageOptions = {},
): Promise<{ state: ChatState; results: ChannelDispatchResult[] }> {
  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    payload,
    runtimeClient,
    now,
    options,
  );
  return continueBegunChannelMessageDispatch(
    begun,
    channelId,
    runtimeClient,
    now,
    options,
  );
}
