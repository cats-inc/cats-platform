import type {
  ChatChannelCat,
  ChatChannelParticipant,
  ChatChannelState,
  ChatChannelView,
  ChatMessage,
  ChatState,
} from '../api/contracts.js';
import type { CatsCoreState } from '../../../core/types.js';
import type {
  RoomRoutingParticipantRef,
  RoomRoutingTrigger,
} from '../../../shared/roomRouting.js';
import type { CompanionBoxStore } from './companion-box/index.js';
import type { RuntimeSkillManifest } from '../../../platform/runtime/client.js';
import type { ProviderModelSelection } from '../../../shared/providerSelection.js';
import { shouldHydrateCompanionSession } from '../companion/hydration.js';
import {
  activeAssignedParticipants,
  findAssignedParticipant,
  resolvePrimaryParticipantExecutionAssignment,
  resolveParticipantCatId,
} from '../shared/channelParticipants.js';
import { resolveSkillProfileManifest } from '../../../shared/skillProfiles.js';
import {
  isDirectLaneChannel,
  isProviderDefaultChatChannel,
  isDefaultChatChannel,
} from '../shared/channelTopology.js';
import { resolveGlobalOrchestratorVisibleParticipant } from './orchestratorHats.js';
import {
  buildDirectLaneTransportBindingId,
} from '../../../shared/chatCoreIds.js';
import {
  parseMessageLocale,
  type MessageLocale,
} from '../../../shared/i18n/index.js';
import {
  resolveTranscriptOrCanonicalConversationMessages,
  readChatCoreMetadataString,
  resolveRawChatParticipantId,
} from './chatCoreInterop.js';
import {
  buildChannelView,
  requireChannel,
  requireCat,
  resolveChannelCanonicalIdentity,
  resolveOrchestratorDisplayName,
} from './model/index.js';
import type { RoutingTarget } from './mentionRouter.js';
import {
  buildOrchestratorPrompt,
  buildDefaultChatContinuityTransplantPackage,
  buildTargetedChatHandoffPackage,
  buildCatPrompt,
  MAX_BOUNDED_RECENT_CONTEXT_MESSAGES,
} from './prompts.js';
import { resolveRoomRoutingState } from './room-routing/index.js';
import type { DispatchRequest } from './room-routing/runtime.js';
import { isAssistantTurnSegmentMessage } from './assistantTurnSegments.js';

export type RuntimeTransportContext = 'telegram' | 'web';

const MAX_RECENT_CONTEXT_MESSAGES = MAX_BOUNDED_RECENT_CONTEXT_MESSAGES;

export function isDefaultChatRuntimeChannel(
  channel: Pick<
    ChatChannelState | ChatChannelView,
    'channelKind' | 'roomRouting' | 'participantAssignments' | 'catAssignments'
  > | Pick<
    ChatChannelView,
    'channelKind' | 'roomRouting' | 'assignedParticipants' | 'assignedCats'
  >,
): boolean {
  return isDefaultChatChannel(channel);
}

export function buildOrchestratorTarget(
  state: ChatState,
  channel: ChatChannelView,
): RoutingTarget {
  return {
    participantKind: 'orchestrator',
    participantId: 'orchestrator',
    participantName: isDefaultChatRuntimeChannel(channel) ? 'Orchestrator' : resolveOrchestratorDisplayName(state),
    laneId: null,
    sessionId: null,
  };
}

export function resolveOrchestratorExecutionTarget(
  state: ChatState,
  channel: ChatChannelState,
): {
  provider: string;
  model: string | null;
  instance: string | null;
  modelSelection?: ProviderModelSelection | null;
} {
  if (isProviderDefaultChatChannel(channel) && channel.pendingProvider) {
    return {
      provider: channel.pendingProvider,
      instance: channel.pendingInstance ?? null,
      model: channel.pendingModel ?? null,
      modelSelection: channel.pendingModelSelection ?? null,
    };
  }

  const participant = resolveGlobalOrchestratorVisibleParticipant(state.globalOrchestrator);
  return {
    provider: participant.executionTarget.provider,
    instance: participant.executionTarget.instance,
    model: participant.executionTarget.model,
    modelSelection: participant.executionModelSelection ?? null,
  };
}

export function resolveExecutionMetadataForTarget(
  state: ChatState,
  channelId: string,
  target: RoutingTarget,
): {
  provider: string | null;
  model: string | null;
  instance: string | null;
  modelSelection?: ProviderModelSelection | null;
} {
  const channel = requireChannel(state, channelId);
  if (target.participantKind === 'orchestrator') {
    const executionTarget = resolveOrchestratorExecutionTarget(state, channel);
    return {
      provider: executionTarget.provider,
      model: executionTarget.model,
      instance: executionTarget.instance,
      modelSelection: executionTarget.modelSelection ?? null,
    };
  }

  const assignment = resolvePrimaryParticipantExecutionAssignment(
    channel,
    target.participantId,
  );
  return {
    provider: assignment?.execution.target.provider ?? null,
    model: assignment?.execution.target.model ?? null,
    instance: assignment?.execution.target.instance ?? null,
    modelSelection: assignment?.execution.modelSelection ?? null,
  };
}

export function buildCatTarget(cat: ChatChannelCat | ChatChannelParticipant): RoutingTarget {
  return {
    participantKind: 'cat',
    participantId: cat.participantId,
    participantName: cat.name,
    laneId: null,
    sessionId: null,
  };
}

export function resolveChoiceResponseTarget(
  state: ChatState,
  channel: ChatChannelView,
  sourceMessageId: string,
  core?: CatsCoreState,
): RoutingTarget | null {
  const sourceMessage = channel.messages.find((message) => message.id === sourceMessageId);
  const canonicalTarget = !sourceMessage && core
    ? resolveCanonicalChoiceResponseTarget(state, channel, sourceMessageId, core)
    : null;
  if (!sourceMessage) {
    return canonicalTarget;
  }

  const targetKind = sourceMessage.metadata.targetKind === 'orchestrator'
    || sourceMessage.metadata.targetKind === 'cat'
    ? sourceMessage.metadata.targetKind
    : sourceMessage.senderKind === 'orchestrator'
      ? 'orchestrator'
      : sourceMessage.senderKind === 'agent'
        ? 'cat'
        : null;

  if (targetKind === 'orchestrator') {
    return buildOrchestratorTarget(state, channel);
  }

  if (targetKind !== 'cat') {
    return null;
  }

  const targetId = typeof sourceMessage.metadata.targetId === 'string'
    ? sourceMessage.metadata.targetId
    : null;
  if (!targetId) {
    return null;
  }

  const cat = activeAssignedParticipants(channel).find((candidate) => candidate.participantId === targetId);
  return cat ? buildCatTarget(cat) : null;
}

function resolveCanonicalChoiceResponseTarget(
  state: ChatState,
  channel: ChatChannelView,
  sourceMessageId: string,
  core: CatsCoreState,
): RoutingTarget | null {
  const { conversationId } = resolveChannelCanonicalIdentity(state, channel.id);
  const segment = core.segments
    .filter((candidate) =>
      candidate.conversationId === conversationId
      && readChatCoreMetadataString(candidate.metadata, 'chatMessageId') === sourceMessageId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .at(-1);
  if (!segment) {
    return null;
  }

  const lane = core.lanes.find((candidate) =>
    candidate.id === segment.laneId
    && candidate.conversationId === conversationId) ?? null;
  const targetKind = readChatCoreMetadataString(segment.metadata, 'targetKind')
    ?? readChatCoreMetadataString(lane?.metadata ?? null, 'participantKind');

  if (targetKind === 'orchestrator') {
    return buildOrchestratorTarget(state, channel);
  }

  if (targetKind !== 'cat') {
    return null;
  }

  const targetId = readChatCoreMetadataString(segment.metadata, 'targetId')
    ?? resolveRawChatParticipantId(lane?.participantId ?? null, conversationId);
  if (!targetId) {
    return null;
  }

  const cat = activeAssignedParticipants(channel).find((candidate) => candidate.participantId === targetId);
  return cat ? buildCatTarget(cat) : null;
}

function resolveTransportContext(
  _channel: ChatChannelView,
  transport?: RuntimeTransportContext,
): RuntimeTransportContext {
  return transport ?? 'web';
}

export function supportsSameChatParticipantContinuity(
  channel: Pick<ChatChannelView, 'assignedParticipants' | 'assignedCats' | 'channelKind'>,
): boolean {
  return isDirectLaneChannel(channel) || activeAssignedParticipants(channel).length === 1;
}

function buildSessionContextForTarget(
  state: ChatState,
  channel: ChatChannelView,
  target: RoutingTarget,
  transport?: RuntimeTransportContext,
  transportBindingIdOverride?: string | null,
): {
  source: 'interactive';
  reason: string;
  labels: string[];
  metadata: Record<string, unknown>;
} {
  const resolvedTransport = resolveTransportContext(channel, transport);
  const { conversationId, containerId } = resolveChannelCanonicalIdentity(state, channel.id);
  const explicitTransportBindingId = typeof transportBindingIdOverride === 'string'
    && transportBindingIdOverride.trim().length > 0
    ? transportBindingIdOverride.trim()
    : null;
  const transportBindingId = explicitTransportBindingId
    ?? (isDirectLaneChannel(channel)
      ? buildDirectLaneTransportBindingId(channel.id)
      : null);
  return {
    source: 'interactive',
    reason: `cats:${channel.channelKind ?? channel.roomRouting?.mode ?? 'chat_channel'}`,
    labels: [
      `channel:${channel.id}`,
      `channel-kind:${channel.channelKind ?? 'chat_channel'}`,
      `room-mode:${channel.roomRouting?.mode ?? 'chat_channel'}`,
      `transport:${resolvedTransport}`,
      `target:${target.participantKind}:${target.participantId}`,
      ...(target.laneId ? [`lane:${target.laneId}`] : []),
    ],
    metadata: {
      channelId: channel.id,
      containerId,
      conversationId,
      channelTitle: channel.title,
      channelKind: channel.channelKind ?? 'chat_channel',
      roomMode: channel.roomRouting?.mode ?? 'chat_channel',
      defaultRecipientId: channel.roomRouting?.defaultRecipientId ?? null,
      transport: resolvedTransport,
      transportBindingId,
      targetKind: target.participantKind,
      targetId: target.participantId,
      laneId: target.laneId ?? null,
    },
  };
}

function resolveSessionSkillManifestForTarget(
  state: ChatState,
  channel: ChatChannelView,
  target: RoutingTarget,
  transport?: RuntimeTransportContext,
): RuntimeSkillManifest | undefined {
  const resolvedTransport = resolveTransportContext(channel, transport);
  if (target.participantKind === 'orchestrator') {
    return resolveSkillProfileManifest({
      profileId: state.globalOrchestrator.skillProfile,
      roomMode: channel.roomRouting?.mode ?? 'chat_channel',
      transport: resolvedTransport,
      labels: ['participant:orchestrator'],
      metadata: {
        channelId: channel.id,
      },
    });
  }

  const participant = findAssignedParticipant(channel, target.participantId);
  const catId = participant ? resolveParticipantCatId(participant) : null;
  return resolveSkillProfileManifest({
    profileId: participant?.skillProfile ?? null,
    catId: catId ?? target.participantId,
    roomMode: channel.roomRouting?.mode ?? 'chat_channel',
    transport: resolvedTransport,
    labels: [participant?.sourceKind === 'cat' ? 'participant:cat' : 'participant:temporary'],
    metadata: {
      channelId: channel.id,
      catName: participant?.name ?? target.participantName,
    },
  });
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index, list) => list.indexOf(value) === index);
}

function enrichInvocationContextWithCompanionSession(
  context: ReturnType<typeof buildSessionContextForTarget>,
  companionSession: Awaited<ReturnType<CompanionBoxStore['buildSessionContext']>> | null,
) {
  if (!companionSession) {
    return context;
  }

  return {
    ...context,
    labels: uniqueStrings([
      ...(context.labels ?? []),
      'companion-session',
      `companion-box:${companionSession.boxId}`,
    ]),
    metadata: {
      ...(context.metadata ?? {}),
      companionSession,
    },
  };
}

function enrichSkillManifestWithCompanionSession(
  manifest: RuntimeSkillManifest | undefined,
  companionSession: Awaited<ReturnType<CompanionBoxStore['buildSessionContext']>> | null,
): RuntimeSkillManifest | undefined {
  if (!manifest || !companionSession) {
    return manifest;
  }

  return {
    ...manifest,
    context: {
      ...manifest.context,
      labels: uniqueStrings([
        ...(manifest.context?.labels ?? []),
        'companion-session',
        `companion-box:${companionSession.boxId}`,
      ]),
      metadata: {
        ...(manifest.context?.metadata ?? {}),
        companionSession,
      },
    },
  };
}

async function resolveCompanionSessionForTarget(
  state: ChatState,
  channel: ChatChannelView,
  target: RoutingTarget,
  skillManifest: RuntimeSkillManifest | undefined,
  companionStore: CompanionBoxStore | undefined,
  transport: RuntimeTransportContext | undefined,
  now: Date,
) {
  if (!companionStore || target.participantKind !== 'cat') {
    return null;
  }

  const participant = findAssignedParticipant(channel, target.participantId);
  const catId = participant ? resolveParticipantCatId(participant) : null;
  if (!catId) {
    return null;
  }

  const cat = requireCat(state, catId);
  const summary = await companionStore.getBoxSummary(cat.id, now);
  if (!shouldHydrateCompanionSession(cat, summary.box, channel)) {
    return null;
  }

  return companionStore.buildSessionContext({
    cat,
    channel: {
      id: channel.id,
      title: channel.title,
      topic: channel.topic,
      workingMemory: channel.workingMemory,
      roomRouting: channel.roomRouting,
    },
    requestedSkills: skillManifest?.requestedSkills ?? [],
    transport: resolveTransportContext(channel, transport),
    now,
  });
}

export async function resolveRuntimeEnvelopeForTarget(
  state: ChatState,
  channel: ChatChannelView,
  target: RoutingTarget,
  transport: RuntimeTransportContext | undefined,
  transportBindingId: string | null | undefined,
  now: Date,
  companionStore?: CompanionBoxStore,
) {
  const baseContext = buildSessionContextForTarget(
    state,
    channel,
    target,
    transport,
    transportBindingId,
  );
  const baseSkills = resolveSessionSkillManifestForTarget(
    state,
    channel,
    target,
    transport,
  );
  const companionSession = await resolveCompanionSessionForTarget(
    state,
    channel,
    target,
    baseSkills,
    companionStore,
    transport,
    now,
  );

  return {
    context: enrichInvocationContextWithCompanionSession(baseContext, companionSession),
    skills: enrichSkillManifestWithCompanionSession(baseSkills, companionSession),
    companionSession,
  };
}

function readMessageMetadataString(message: ChatMessage, key: string): string | null {
  const value = message.metadata[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function messageMatchesTargetAttachment(message: ChatMessage, target: RoutingTarget): boolean {
  const targetLaneId = target.laneId?.trim() || null;
  const targetSessionId = target.sessionId?.trim() || null;
  const messageLaneId = readMessageMetadataString(message, 'laneId');
  const messageSessionId = readMessageMetadataString(message, 'sessionId');
  if (targetLaneId) {
    if (messageLaneId) {
      if (messageLaneId === targetLaneId) {
        return true;
      }
      if (targetSessionId !== null && messageSessionId === targetSessionId) {
        return true;
      }
      return targetSessionId === null;
    }
    return targetSessionId !== null && messageSessionId === targetSessionId;
  }

  return targetSessionId === null || messageSessionId === targetSessionId;
}

function messageMatchesTarget(message: ChatMessage, target: RoutingTarget): boolean {
  if (!messageMatchesTargetAttachment(message, target)) {
    return false;
  }

  if (target.participantKind === 'orchestrator') {
    return message.senderKind === 'orchestrator'
      && (
        message.senderName === target.participantName
        || message.metadata.targetKind === 'orchestrator'
      );
  }

  return message.senderKind === 'agent'
    && (
      message.senderName === target.participantName
      || message.metadata.targetId === target.participantId
    );
}

function sliceRecentContextForTarget(
  messages: ReadonlyArray<ChatMessage>,
  target: RoutingTarget,
  sourceMessage: Pick<ChatMessage, 'id' | 'createdAt'>,
): ChatMessage[] {
  const boundedSourceIndex = resolveSourceBoundaryIndex(messages, sourceMessage);
  if (boundedSourceIndex < 0) {
    return [];
  }
  let lastOwnReplyIndex = -1;

  for (let index = boundedSourceIndex - 1; index >= 0; index -= 1) {
    if (messageMatchesTarget(messages[index]!, target)) {
      lastOwnReplyIndex = index;
      break;
    }
  }

  const startIndex = Math.max(lastOwnReplyIndex, 0);
  const relevantMessages = messages.slice(startIndex, boundedSourceIndex + 1);
  return relevantMessages.slice(-MAX_RECENT_CONTEXT_MESSAGES);
}

export function messagesBeforeSource(
  messages: ReadonlyArray<ChatMessage>,
  sourceMessage: Pick<ChatMessage, 'id' | 'createdAt'>,
): ChatMessage[] {
  const sourceIndex = resolveSourceBoundaryIndex(messages, sourceMessage);
  if (sourceIndex <= 0) {
    return [];
  }

  return messages.slice(0, sourceIndex);
}

export function applyDefaultChatContinuityBoundary(
  channel: Pick<ChatChannelView, 'continuityResetAt'>,
  messages: ReadonlyArray<ChatMessage>,
): ChatMessage[] {
  const resetAt = channel.continuityResetAt?.trim() || null;
  if (!resetAt) {
    return [...messages];
  }

  return messages.filter((message) => message.createdAt.localeCompare(resetAt) > 0);
}

function resolveSourceBoundaryIndex(
  messages: ReadonlyArray<ChatMessage>,
  sourceMessage: Pick<ChatMessage, 'id' | 'createdAt'>,
): number {
  const sourceIndex = messages.findIndex((message) => message.id === sourceMessage.id);
  if (sourceIndex !== -1) {
    return sourceIndex;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = messages[index]!;
    if (candidate.createdAt.localeCompare(sourceMessage.createdAt) <= 0) {
      return index;
    }
  }

  return -1;
}

function hasVisibleResponseFromCurrentTargetIdentity(
  messages: ReadonlyArray<ChatMessage>,
  target: RoutingTarget,
  sourceMessage: Pick<ChatMessage, 'id' | 'createdAt'>,
): boolean {
  return messagesBeforeSource(messages, sourceMessage).some((message) => {
    if (message.senderKind === 'system') {
      return false;
    }

    if (!isAssistantTurnSegmentMessage(message)) {
      return false;
    }

    if (!messageMatchesTargetAttachment(message, target)) {
      return false;
    }

    if (target.participantKind === 'orchestrator') {
      return message.metadata.targetKind === 'orchestrator';
    }

    return message.metadata.targetKind === 'cat'
      && message.metadata.targetId === target.participantId;
  });
}

export function hasVisibleResponseFromLogicalTarget(
  messages: ReadonlyArray<ChatMessage>,
  target: RoutingTarget,
  sourceMessage: Pick<ChatMessage, 'id' | 'createdAt'>,
): boolean {
  return messagesBeforeSource(messages, sourceMessage).some((message) => {
    if (message.senderKind === 'system') {
      return false;
    }

    if (!isAssistantTurnSegmentMessage(message)) {
      return false;
    }

    if (target.participantKind === 'orchestrator') {
      return message.metadata.targetKind === 'orchestrator';
    }

    return message.metadata.targetKind === 'cat'
      && message.metadata.targetId === target.participantId;
  });
}

function resolveSameChatContinuityPackage(
  messages: ReadonlyArray<ChatMessage>,
  request: DispatchRequest,
): ReturnType<typeof buildDefaultChatContinuityTransplantPackage> | null {
  const priorMessages = messagesBeforeSource(messages, request.sourceMessage);
  if (hasVisibleResponseFromCurrentTargetIdentity(messages, request.target, request.sourceMessage)) {
    return null;
  }
  return buildDefaultChatContinuityTransplantPackage(priorMessages);
}

function resolveSameChatContinuityMode(
  messages: ReadonlyArray<ChatMessage>,
  request: DispatchRequest,
  continuityPackage: ReturnType<typeof buildDefaultChatContinuityTransplantPackage> | null,
): 'fresh_start' | 'native_resume' | 'full_transplant' | 'semantic_transplant' {
  if (continuityPackage?.instructions) {
    return continuityPackage.mode;
  }

  return hasVisibleResponseFromCurrentTargetIdentity(messages, request.target, request.sourceMessage)
    ? 'native_resume'
    : 'fresh_start';
}

function describeRoutingReason(
  channel: ChatChannelView,
  sourceParticipant: RoomRoutingParticipantRef | null,
  trigger: RoomRoutingTrigger,
): string {
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  switch (trigger) {
    case 'room_default':
      if (isDirectLaneChannel(channel)) {
        return 'System routing selected you because you are the direct recipient for this room.';
      }
      return 'System routing selected you as the default room target for this turn.';
    case 'explicit_mention':
      return 'System routing selected you because the operator explicitly mentioned you.';
    case 'continuation_mention':
      return sourceParticipant
        ? `System routing selected you because ${sourceParticipant.participantName} explicitly mentioned you.`
        : 'System routing selected you because another participant explicitly mentioned you.';
    default:
      return 'System routing selected you for this turn.';
  }
}

export interface DispatchPrompt {
  message: string;
  instructions?: string | null;
  continuityMode?:
    | 'fresh_start'
    | 'native_resume'
    | 'full_transplant'
    | 'semantic_transplant'
    | 'targeted_handoff'
    | null;
  continuityDeliveryMode?: 'none' | 'turn_instructions' | null;
  continuityResetAt?: string | null;
}

interface ProductIntentFollowUpIntakeRef {
  workItemId: string;
  commandSegmentId: string;
  targetProduct: 'work' | 'code';
}

function asMetadataRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readProductIntentFollowUpIntakeRefValue(
  value: unknown,
): { workItemId: string; commandSegmentId: string; targetProduct: 'work' | 'code' } | null {
  const record = asMetadataRecord(value);
  if (!record) {
    return null;
  }

  return typeof record.workItemId === 'string'
    && typeof record.commandSegmentId === 'string'
    && (record.targetProduct === 'work' || record.targetProduct === 'code')
    ? {
        workItemId: record.workItemId,
        commandSegmentId: record.commandSegmentId,
        targetProduct: record.targetProduct,
      }
    : null;
}

function readProductIntentFollowUpIntakeRef(
  message: ChatMessage,
): ProductIntentFollowUpIntakeRef | null {
  return readProductIntentFollowUpIntakeRefValue(message.metadata.productIntentIntakeRef)
    ?? readProductIntentFollowUpIntakeRefValue(message.metadata.directSlashModeIntakeRef);
}

function resolveDirectSlashModeFollowUpIntakeRef(
  sourceMessage: ChatMessage,
  input: {
    state: ChatState;
    channelId: string;
    core?: CatsCoreState;
  },
): ProductIntentFollowUpIntakeRef | null {
  const intakeRef = readProductIntentFollowUpIntakeRef(sourceMessage);
  if (!intakeRef) {
    return null;
  }

  const workItem = input.core?.workItems.find((candidate) =>
    candidate.id === intakeRef.workItemId) ?? null;
  if (!workItem) {
    return null;
  }

  const { conversationId } = resolveChannelCanonicalIdentity(input.state, input.channelId);
  if (workItem.conversationId !== conversationId) {
    return null;
  }

  const productIntentIntake = asMetadataRecord(workItem.metadata.productIntentIntake);
  const sourceContext = asMetadataRecord(productIntentIntake?.sourceContext);
  const productIntentSource = asMetadataRecord(sourceContext?.source);
  if (
    productIntentIntake
    && (
      productIntentIntake.targetProduct !== intakeRef.targetProduct
      || productIntentSource?.segmentId !== intakeRef.commandSegmentId
      || productIntentSource?.conversationId !== conversationId
    )
  ) {
    return null;
  }
  if (productIntentIntake) {
    return intakeRef;
  }

  const intake = workItem.metadata.directSlashModeIntake;
  const intakeRecord = asMetadataRecord(intake);
  if (!intakeRecord) {
    return null;
  }

  const source = intakeRecord.source;
  const sourceRecord = asMetadataRecord(source);
  if (
    intakeRecord.targetProduct !== intakeRef.targetProduct
    || sourceRecord?.commandSegmentId !== intakeRef.commandSegmentId
    || sourceRecord?.conversationId !== conversationId
  ) {
    return null;
  }

  return intakeRef;
}

function resolveDirectSlashModePromptLocale(
  sourceMessage: ChatMessage,
  input: {
    state: ChatState;
    channelId: string;
  },
): MessageLocale | null {
  const metadataLocale = parseMessageLocale(
    typeof sourceMessage.metadata.productIntentLocale === 'string'
      ? sourceMessage.metadata.productIntentLocale
      : null,
  );
  if (metadataLocale) {
    return metadataLocale;
  }

  const channel = requireChannel(input.state, input.channelId);
  return parseMessageLocale(channel.responseLanguage)
    ?? parseMessageLocale(channel.language)
    ?? null;
}

function didProductIntentCommandOmitArgument(sourceMessage: ChatMessage): boolean {
  return sourceMessage.metadata.productIntentArgumentProvided === false;
}

function buildDirectSlashModeFollowUpInstructions(
  sourceMessage: ChatMessage,
  input: {
    state: ChatState;
    channelId: string;
    core?: CatsCoreState;
  },
): string | null {
  const intakeRef = resolveDirectSlashModeFollowUpIntakeRef(sourceMessage, input);
  if (!intakeRef) {
    return null;
  }

  const productLabel = intakeRef.targetProduct === 'code' ? 'Code' : 'Work';
  const locale = resolveDirectSlashModePromptLocale(sourceMessage, input);
  const responseLanguageInstruction = locale === 'zh-TW'
    ? [
        'Reply in Traditional Chinese unless the owner explicitly asks otherwise.',
        'Keep product names, code, paths, and technical identifiers in English.',
      ].join(' ')
    : locale === 'en'
      ? 'Reply in English unless the owner explicitly asks otherwise.'
      : null;
  const emptyArgumentInstruction = didProductIntentCommandOmitArgument(sourceMessage)
    ? 'The owner did not provide an argument after the slash command; do not treat the marker text as owner wording.'
    : null;
  return [
    responseLanguageInstruction,
    `Direct slash-mode ${productLabel} intake is active.`,
    emptyArgumentInstruction,
    `Use existing draft Work Item ${intakeRef.workItemId} as the durable anchor for this direct lane.`,
    `The source posture command segment is ${intakeRef.commandSegmentId}.`,
    'Concierge protocol: ask one focal clarifying question per assistant turn.',
    'Prioritize goal, then success criteria, then out-of-scope boundaries, then remaining open questions.',
    'Surface a brief current-understanding recap before proposing task or run follow-up.',
    'After three assistant clarification turns, either proceed with stated assumptions or ask the human to confirm creation with those assumptions.',
    'Do not create a second Work Item anchor for this turn.',
    intakeRef.targetProduct === 'code'
      ? 'Treat follow-up execution as Code-bound only after the Work Item remains the active anchor.'
      : 'Treat follow-up execution as Work-bound only after the Work Item remains the active anchor.',
  ].filter((line): line is string => Boolean(line)).join('\n');
}

function joinRuntimeInstructions(
  ...parts: Array<string | null | undefined>
): string | null {
  const normalized = parts
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0);
  return normalized.length > 0 ? normalized.join('\n\n') : null;
}

export function buildPromptForTarget(
  state: ChatState,
  channelId: string,
  request: DispatchRequest,
  transport?: RuntimeTransportContext,
  core?: CatsCoreState,
): DispatchPrompt {
  const channel = buildChannelView(state, channelId);
  const promptSourceMessage = request.promptSourceMessage ?? request.sourceMessage;
  const promptMessages = resolveTranscriptOrCanonicalConversationMessages({
    core,
    channelId,
    transcriptMessages: channel.messages,
  });
  const continuityMessages =
    request.target.participantKind === 'orchestrator' && isDefaultChatRuntimeChannel(channel)
      ? applyDefaultChatContinuityBoundary(channel, promptMessages)
      : promptMessages;
  const recentMessages = sliceRecentContextForTarget(
    continuityMessages,
    request.target,
    promptSourceMessage,
  );
  const routingContext = {
    reason: describeRoutingReason(channel, request.sourceParticipant, request.trigger),
    recentMessages,
    sourceParticipantName: request.sourceParticipant?.participantName ?? null,
    transport: resolveTransportContext(channel, transport),
  };
  const hasLogicalPriorResponse = hasVisibleResponseFromLogicalTarget(
    promptMessages,
    request.target,
    request.sourceMessage,
  );
  const participantContinuity = request.target.participantKind === 'cat'
    && (supportsSameChatParticipantContinuity(channel) || hasLogicalPriorResponse);

  if (request.target.participantKind === 'orchestrator') {
    if (isDefaultChatRuntimeChannel(channel)) {
      const continuityPackage = resolveSameChatContinuityPackage(continuityMessages, request);
      return {
        message: request.sourceMessage.body,
        instructions: continuityPackage?.instructions ?? null,
        continuityMode: resolveSameChatContinuityMode(
          continuityMessages,
          request,
          continuityPackage,
        ),
        continuityDeliveryMode: continuityPackage?.instructions ? 'turn_instructions' : 'none',
        continuityResetAt: channel.continuityResetAt?.trim() || null,
      };
    }
    return {
      message: buildOrchestratorPrompt(
        channel,
        state.globalOrchestrator,
        promptSourceMessage,
        request.target.participantName,
        routingContext,
      ),
    };
  }

  const participant = findAssignedParticipant(channel, request.target.participantId);
  if (!participant) {
    throw new Error(`Target participant is no longer assigned to the selected chat: ${request.target.participantId}`);
  }

  const sameChatContinuityPackage = participantContinuity
    ? resolveSameChatContinuityPackage(promptMessages, request)
    : null;
  const targetedHandoffPackage = participantContinuity
    ? null
    : buildTargetedChatHandoffPackage({
      priorMessages: messagesBeforeSource(recentMessages, promptSourceMessage),
      reason: routingContext.reason,
      sourceParticipantName: routingContext.sourceParticipantName ?? null,
    });
  const instructions = sameChatContinuityPackage?.instructions
    ?? targetedHandoffPackage?.instructions
    ?? null;
  const slashModeInstructions = buildDirectSlashModeFollowUpInstructions(
    request.sourceMessage,
    {
      state,
      channelId,
      core,
    },
  );
  const continuityMode = participantContinuity
    ? resolveSameChatContinuityMode(promptMessages, request, sameChatContinuityPackage)
    : targetedHandoffPackage?.instructions
      ? targetedHandoffPackage.mode
      : null;
  return {
    message: buildCatPrompt(
      channel,
      state.globalOrchestrator,
      participant,
      promptSourceMessage,
      routingContext,
    ),
    instructions: joinRuntimeInstructions(instructions, slashModeInstructions),
    continuityMode,
    continuityDeliveryMode: continuityMode == null
      ? null
      : instructions || slashModeInstructions ? 'turn_instructions' : 'none',
  };
}
