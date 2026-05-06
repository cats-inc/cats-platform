import { randomUUID } from 'node:crypto';

import type {
  ChannelDispatchResult,
  SendChannelMessageInput,
  ChatChannelState,
  ChatMessage,
  ChatState,
  MessageOrigin,
  DirectSlashModePostureChangeMetadata,
  ProductIntentCommandMetadata,
  ProductIntentCommandSource,
} from '../../api/contracts.js';
import { createCatActorId } from '../../../../core/actors.js';
import type { CatsCoreState } from '../../../../core/types.js';
import {
  upsertCoreLane,
  upsertCoreSegment,
  upsertCoreTurn,
  upsertCoreWorkItem,
} from '../../../../core/model/index.js';
import type { ProviderAgentDecision } from '../../../../platform/orchestration/index.js';
import {
  resolveProviderCapabilityProfile,
  type ProviderCapabilityBootstrapConfig,
  type ProviderCapabilityBootstrapDiagnosticSink,
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
import {
  resolveOrchestratorLeaseAttachment,
  resolvePrimaryParticipantExecutionAssignment,
} from '../../shared/channelParticipants.js';
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

interface ProductIntentAudienceResolution {
  accepted: boolean;
  audienceCatId: string | null;
  participantId: string | null;
  rejectionReason: 'non_direct_channel' | 'missing_direct_audience_cat' | null;
}

function resolveProductIntentAudience(
  channel: ReturnType<typeof requireChannel>,
): ProductIntentAudienceResolution {
  if (
    channel.channelKind !== 'direct_message'
    && channel.roomRouting?.mode !== 'direct_message'
  ) {
    return {
      accepted: false,
      audienceCatId: null,
      participantId: null,
      rejectionReason: 'non_direct_channel',
    };
  }

  const activeCatAssignments = channel.catAssignments.filter((assignment) =>
    assignment.status === 'active');
  if (activeCatAssignments.length !== 1) {
    return {
      accepted: false,
      audienceCatId: null,
      participantId: null,
      rejectionReason: 'missing_direct_audience_cat',
    };
  }
  const defaultRecipientId = channel.roomRouting?.defaultRecipientId?.trim()
    || channel.recoverableDirectLaneCatId?.trim()
    || null;
  const matchedAssignment = defaultRecipientId
    ? activeCatAssignments.find((assignment) =>
        assignment.participantId === defaultRecipientId
        || assignment.catId === defaultRecipientId)
      ?? null
    : activeCatAssignments[0]!;
  if (!matchedAssignment) {
    return {
      accepted: false,
      audienceCatId: null,
      participantId: null,
      rejectionReason: 'missing_direct_audience_cat',
    };
  }

  return {
    accepted: true,
    audienceCatId: matchedAssignment.catId,
    participantId: matchedAssignment.participantId,
    rejectionReason: null,
  };
}

function resolveDirectAudienceCapabilityProfileKind(input: {
  channel: ReturnType<typeof requireChannel>;
  audience: ProductIntentAudienceResolution;
  assessedAt: string;
  providerCapabilityBootstrapConfig?: ProviderCapabilityBootstrapConfig | null;
  providerCapabilityBootstrapDiagnosticSink?: ProviderCapabilityBootstrapDiagnosticSink;
}): DirectSlashModePostureChangeMetadata['capabilityProfileKind'] {
  if (!input.audience.accepted || !input.audience.participantId) {
    return null;
  }

  const assignment = resolvePrimaryParticipantExecutionAssignment(
    input.channel,
    input.audience.participantId,
  );
  const target = assignment?.execution.target ?? null;
  if (!target?.provider) {
    return 'unknown';
  }

  const capabilityProfile = resolveProviderCapabilityProfile(
    {
      provider: target.provider,
      instance: target.instance,
      model: target.model,
      modelSelection: assignment?.execution.modelSelection ?? null,
    },
    {
      assessedAt: input.assessedAt,
      bootstrapConfig: input.providerCapabilityBootstrapConfig,
    },
  );
  input.providerCapabilityBootstrapDiagnosticSink?.emitMany(capabilityProfile.diagnostics);
  return capabilityProfile.kind;
}

function buildProductPostureChangeMetadata(input: {
  channel: ReturnType<typeof requireChannel>;
  channelId: string;
  productIntentCommand: ProductIntentCommandMetadata;
  audience: ProductIntentAudienceResolution;
  capabilityProfileKind: DirectSlashModePostureChangeMetadata['capabilityProfileKind'];
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
    audienceCatId: input.audience.audienceCatId,
    capabilityProfileKind: input.capabilityProfileKind,
  };
}

function resolveProductIntentCoreIds(userMessageId: string): {
  turnId: string;
  laneId: string;
  segmentId: string;
  workItemId: string;
} {
  return {
    turnId: `turn-product-intent-${userMessageId}`,
    laneId: `lane-product-intent-${userMessageId}`,
    segmentId: `segment-product-intent-${userMessageId}`,
    workItemId: `work-item-direct-intake-${userMessageId}`,
  };
}

function shouldCreateProductIntentWorkItemAnchor(input: {
  productIntentCommand: ProductIntentCommandMetadata;
  postureChange: DirectSlashModePostureChangeMetadata | null;
  activeAnchorClear: DirectSlashModeClearMetadata | null;
}): boolean {
  return (
    input.productIntentCommand.command === 'work'
    || input.productIntentCommand.command === 'code'
  ) && (
    input.postureChange?.changed === true
    || input.activeAnchorClear?.clearReason === 'work_item_terminal'
  )
    && input.postureChange?.capabilityProfileKind === 'strong_agent';
}

function shouldRequireHumanWorkItemGate(input: {
  productIntentCommand: ProductIntentCommandMetadata;
  postureChange: DirectSlashModePostureChangeMetadata | null;
}): boolean {
  return (
    input.productIntentCommand.command === 'work'
    || input.productIntentCommand.command === 'code'
  ) && (
    input.postureChange?.capabilityProfileKind === 'weak_worker'
    || input.postureChange?.capabilityProfileKind === 'unknown'
  );
}

function normalizeWorkItemTitle(value: string, fallback: string): string {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if (!normalized) {
    return fallback;
  }
  return normalized.length <= 72 ? normalized : `${normalized.slice(0, 69)}...`;
}

interface DirectSlashModeActiveAnchorMetadata {
  workItemId: string;
  targetProduct: 'work' | 'code';
  establishedBySegmentId: string;
  establishedAt: string;
}

interface DirectSlashModeHumanGateMetadata {
  kind: 'human_gate_required';
  reason: 'direct_audience_not_strong';
  targetProduct: 'work' | 'code';
  capabilityProfileKind: 'weak_worker' | 'unknown';
  draftSummary: string;
  suggestedActions: Array<{
    kind: 'continue_clarifying' | 'open_work_items' | 'switch_cat';
    label: string;
    path?: string;
  }>;
}

interface DirectSlashModeClearMetadata {
  clearedActiveAnchor: DirectSlashModeActiveAnchorMetadata;
  clearReason: 'chat_posture' | 'work_item_terminal';
}

function buildDirectSlashModeActiveAnchor(input: {
  workItemId: string;
  targetProduct: 'work' | 'code';
  segmentId: string;
  establishedAt: string;
}): DirectSlashModeActiveAnchorMetadata {
  return {
    workItemId: input.workItemId,
    targetProduct: input.targetProduct,
    establishedBySegmentId: input.segmentId,
    establishedAt: input.establishedAt,
  };
}

function buildDirectSlashModeHumanGate(input: {
  productIntentCommand: ProductIntentCommandMetadata;
  postureChange: DirectSlashModePostureChangeMetadata | null;
}): DirectSlashModeHumanGateMetadata | null {
  if (!shouldRequireHumanWorkItemGate(input)) {
    return null;
  }

  const capabilityProfileKind = input.postureChange?.capabilityProfileKind;
  if (capabilityProfileKind !== 'weak_worker' && capabilityProfileKind !== 'unknown') {
    return null;
  }

  return {
    kind: 'human_gate_required',
    reason: 'direct_audience_not_strong',
    targetProduct: input.productIntentCommand.targetProduct === 'code' ? 'code' : 'work',
    capabilityProfileKind,
    draftSummary: input.productIntentCommand.argumentText
      || `Clarify this ${input.productIntentCommand.targetProduct} request before creating work.`,
    suggestedActions: [
      {
        kind: 'continue_clarifying',
        label: 'Continue clarifying in this direct chat',
      },
      {
        kind: 'open_work_items',
        label: 'Create or confirm a Work Item in Work',
        path: '/work/work-items',
      },
      {
        kind: 'switch_cat',
        label: 'Switch to a Cat that can own durable work',
      },
    ],
  };
}

function buildDirectSlashModeStateMetadata(input: {
  activeAnchor?: DirectSlashModeActiveAnchorMetadata | null;
  clear?: DirectSlashModeClearMetadata | null;
  humanGate: DirectSlashModeHumanGateMetadata | null;
}): Record<string, unknown> | null {
  if (input.activeAnchor === undefined && !input.clear && !input.humanGate) {
    return null;
  }

  return {
    ...(input.activeAnchor !== undefined ? { activeAnchor: input.activeAnchor } : {}),
    ...(input.clear
      ? {
          clearedActiveAnchor: input.clear.clearedActiveAnchor,
          clearReason: input.clear.clearReason,
        }
      : {}),
    ...(input.humanGate ? { humanGate: input.humanGate } : {}),
  };
}

function readDirectSlashModeActiveAnchor(
  value: unknown,
): DirectSlashModeActiveAnchorMetadata | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.workItemId === 'string'
    && (candidate.targetProduct === 'work' || candidate.targetProduct === 'code')
    && typeof candidate.establishedBySegmentId === 'string'
    && typeof candidate.establishedAt === 'string'
    ? {
        workItemId: candidate.workItemId,
        targetProduct: candidate.targetProduct,
        establishedBySegmentId: candidate.establishedBySegmentId,
        establishedAt: candidate.establishedAt,
      }
    : null;
}

function readMessageDirectSlashModeMetadata(
  message: ChatMessage,
): Record<string, unknown> | null {
  const candidate = message.metadata.directSlashMode;
  return candidate && typeof candidate === 'object'
    ? candidate as Record<string, unknown>
    : null;
}

function resolveLatestDirectSlashModeActiveAnchor(
  channel: ChatChannelState,
): DirectSlashModeActiveAnchorMetadata | null {
  for (let index = channel.messages.length - 1; index >= 0; index -= 1) {
    const directSlashMode = readMessageDirectSlashModeMetadata(channel.messages[index]!);
    if (!directSlashMode || !Object.hasOwn(directSlashMode, 'activeAnchor')) {
      continue;
    }
    return readDirectSlashModeActiveAnchor(directSlashMode.activeAnchor);
  }

  return null;
}

function isTerminalDirectSlashModeWorkItemStatus(status: unknown): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'archived';
}

function resolveDirectSlashModeActiveAnchorState(input: {
  channel: ChatChannelState;
  core: CatsCoreState | null;
}): {
  activeAnchor: DirectSlashModeActiveAnchorMetadata | null;
  clear: DirectSlashModeClearMetadata | null;
} {
  const activeAnchor = resolveLatestDirectSlashModeActiveAnchor(input.channel);
  if (!activeAnchor) {
    return { activeAnchor: null, clear: null };
  }

  const workItem = input.core?.workItems.find((candidate) =>
    candidate.id === activeAnchor.workItemId) ?? null;
  if (workItem && isTerminalDirectSlashModeWorkItemStatus(workItem.status)) {
    return {
      activeAnchor: null,
      clear: {
        clearedActiveAnchor: activeAnchor,
        clearReason: 'work_item_terminal',
      },
    };
  }

  return { activeAnchor, clear: null };
}

function buildDirectSlashModeIntakeRef(
  activeAnchor: DirectSlashModeActiveAnchorMetadata,
): Record<string, unknown> {
  return {
    workItemId: activeAnchor.workItemId,
    commandSegmentId: activeAnchor.establishedBySegmentId,
    targetProduct: activeAnchor.targetProduct,
  };
}

function describeProductIntentCommandAck(
  productIntentCommand: ProductIntentCommandMetadata,
  accepted: boolean,
  rejectionReason: ProductIntentAudienceResolution['rejectionReason'] = null,
  capabilityProfileKind: DirectSlashModePostureChangeMetadata['capabilityProfileKind'] = null,
): string {
  if (!accepted) {
    return rejectionReason === 'missing_direct_audience_cat'
      ? 'Product mode commands need exactly one direct audience Cat for this MVP.'
      : 'Product mode commands are available in direct messages for this MVP.';
  }

  switch (productIntentCommand.command) {
    case 'chat':
      return 'Chat mode is active.';
    case 'work':
      if (capabilityProfileKind === 'weak_worker' || capabilityProfileKind === 'unknown') {
        return 'Work mode is active. I can help clarify here, but a human must create or confirm the Work Item in Work or switch to a Cat that can own durable work.';
      }
      if (capabilityProfileKind === 'strong_agent') {
        return 'Work mode is active. Draft Work Item anchor created for clarification.';
      }
      return 'Work mode is active. I will clarify the work before creating an item.';
    case 'code':
      if (capabilityProfileKind === 'weak_worker' || capabilityProfileKind === 'unknown') {
        return 'Code mode is active. I can help clarify here, but a human must create or confirm the Work Item in Work before Code execution can start.';
      }
      if (capabilityProfileKind === 'strong_agent') {
        return 'Code mode is active. Draft Work Item anchor created with Code target.';
      }
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
  coreIds: ReturnType<typeof resolveProductIntentCoreIds>;
  activeAnchor: DirectSlashModeActiveAnchorMetadata | null;
  activeAnchorClear: DirectSlashModeClearMetadata | null;
  humanGate: DirectSlashModeHumanGateMetadata | null;
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
  const { turnId, laneId, segmentId, workItemId } = input.coreIds;
  const event = input.accepted
    ? 'product_intent_posture_changed'
    : 'product_intent_unsupported_context';
  const directSlashMode = buildDirectSlashModeStateMetadata({
    activeAnchor: input.activeAnchor ?? (input.activeAnchorClear ? null : undefined),
    clear: input.activeAnchorClear,
    humanGate: input.humanGate,
  });
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
    ...(directSlashMode ? { directSlashMode } : {}),
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
    if (input.activeAnchor && input.postureChange?.audienceCatId) {
      const targetProduct = input.productIntentCommand.targetProduct === 'code' ? 'code' : 'work';
      const goal = input.productIntentCommand.argumentText
        || `Clarify this ${targetProduct} request from the direct conversation.`;
      nextCore = upsertCoreWorkItem(
        nextCore,
        {
          id: workItemId,
          title: normalizeWorkItemTitle(
            input.productIntentCommand.argumentText,
            targetProduct === 'code'
              ? 'Direct code intake'
              : 'Direct work intake',
          ),
          status: 'draft',
          conversationId,
          assignedActorIds: [createCatActorId(input.postureChange.audienceCatId)],
          summary: `Draft ${targetProduct} intake created from direct chat for clarification.`,
          createdAt: input.ackMessage.createdAt,
          metadata: {
            directSlashModeIntake: {
              version: 1,
              targetProduct,
              source: {
                channelId: input.channelId,
                conversationId,
                commandTurnId: turnId,
                commandLaneId: laneId,
                commandSegmentId: segmentId,
                transport: input.productIntentCommand.source,
              },
              audience: {
                catId: input.postureChange.audienceCatId,
                capabilityProfileKind: input.postureChange.capabilityProfileKind,
              },
              command: {
                name: input.productIntentCommand.command,
                argumentText: input.productIntentCommand.argumentText,
                posture: input.productIntentCommand.posture,
              },
              draft: {
                goal,
                successCriteria: ['Clarify measurable success criteria with the owner.'],
                outOfScope: ['Unconfirmed until the owner and Cat finish clarification.'],
                openQuestions: ['What outcome should this work produce?'],
                proposedNextAction: 'clarify',
              },
            },
            directSlashMode: {
              activeAnchor: input.activeAnchor,
            },
            planning: {
              productHint: targetProduct,
            },
          },
        },
        input.now,
      ).core;
    }
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
    const audience = resolveProductIntentAudience(channelBeforeMessage);
    const capabilityProfileKind = resolveDirectAudienceCapabilityProfileKind({
      channel: channelBeforeMessage,
      audience,
      assessedAt: now.toISOString(),
      providerCapabilityBootstrapConfig: options.providerCapabilityBootstrapConfig,
      providerCapabilityBootstrapDiagnosticSink:
        options.providerCapabilityBootstrapDiagnosticSink,
    });
    const postureChange = audience.accepted
      ? buildProductPostureChangeMetadata({
          channel: channelBeforeMessage,
          channelId,
          productIntentCommand,
          audience,
          capabilityProfileKind,
        })
      : null;
    const coreBeforeProductIntent = options.chatStore
      ? await options.chatStore.readCore()
      : null;
    const activeAnchorState = resolveDirectSlashModeActiveAnchorState({
      channel: channelBeforeMessage,
      core: coreBeforeProductIntent,
    });
    const activeAnchorClear = productIntentCommand.command === 'chat'
      && activeAnchorState.activeAnchor
      ? {
          clearedActiveAnchor: activeAnchorState.activeAnchor,
          clearReason: 'chat_posture' as const,
        }
      : activeAnchorState.clear;
    const coreIds = resolveProductIntentCoreIds(userAppend.message.id);
    const activeAnchor = shouldCreateProductIntentWorkItemAnchor({
      productIntentCommand,
      postureChange,
      activeAnchorClear,
    })
      ? buildDirectSlashModeActiveAnchor({
          workItemId: coreIds.workItemId,
          targetProduct: productIntentCommand.targetProduct === 'code' ? 'code' : 'work',
          segmentId: coreIds.segmentId,
          establishedAt: now.toISOString(),
        })
      : null;
    const humanGate = buildDirectSlashModeHumanGate({
      productIntentCommand,
      postureChange,
    });
    const directSlashMode = buildDirectSlashModeStateMetadata({
      activeAnchor: activeAnchor ?? (activeAnchorClear ? null : undefined),
      clear: activeAnchorClear,
      humanGate,
    });
    const ackAppend = appendMessage(
      nextState,
      channelId,
      {
        senderKind: 'system',
        senderName: 'Cats',
        body: describeProductIntentCommandAck(
          productIntentCommand,
          audience.accepted,
          audience.rejectionReason,
          capabilityProfileKind,
        ),
      },
      now,
      {
        metadata: {
          event: audience.accepted
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
          ...(directSlashMode ? { directSlashMode } : {}),
          accepted: audience.accepted,
          audienceCatId: audience.audienceCatId,
          ...(audience.rejectionReason
            ? {
                rejectionReason: audience.rejectionReason,
              }
            : {}),
          ...(capabilityProfileKind
            ? {
                capabilityProfileKind,
              }
            : {}),
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
      coreIds,
      activeAnchor,
      activeAnchorClear,
      humanGate,
      accepted: audience.accepted,
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
  const coreBeforeUserMessage = options.chatStore
    ? await options.chatStore.readCore()
    : null;
  const followUpActiveAnchorState = resolveDirectSlashModeActiveAnchorState({
    channel: channelBeforeMessage,
    core: coreBeforeUserMessage,
  });
  const followUpDirectSlashMode = buildDirectSlashModeStateMetadata({
    activeAnchor: followUpActiveAnchorState.activeAnchor
      ?? (followUpActiveAnchorState.clear ? null : undefined),
    clear: followUpActiveAnchorState.clear,
    humanGate: null,
  });
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
        ...(followUpDirectSlashMode ? { directSlashMode: followUpDirectSlashMode } : {}),
        ...(followUpActiveAnchorState.activeAnchor
          ? {
              directSlashModeIntakeRef: buildDirectSlashModeIntakeRef(
                followUpActiveAnchorState.activeAnchor,
              ),
            }
          : {}),
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
