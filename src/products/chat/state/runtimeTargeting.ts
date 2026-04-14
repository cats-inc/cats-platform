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
import { isDirectLaneChannel } from '../shared/channelTopology.js';
import {
  buildChatConversationId,
  buildDirectLaneTransportBindingId,
} from '../../../shared/chatCoreIds.js';
import {
  readChatCoreMetadataString,
  resolveRawChatParticipantId,
} from './chatCoreInterop.js';
import {
  buildChannelView,
  requireChannel,
  requireCat,
  resolveOrchestratorDisplayName,
} from './model/index.js';
import type { RoutingTarget } from './mentionRouter.js';
import {
  buildOrchestratorPrompt,
  buildSoloChatBootstrapInstructions,
  buildCatPrompt,
  MAX_PROMPT_RECENT_MESSAGES,
} from './prompts.js';
import { resolveRoomRoutingState } from './room-routing/index.js';
import type { DispatchRequest } from './room-routing/runtime.js';
import { isAssistantTurnSegmentMessage } from './assistantTurnSegments.js';

export type RuntimeTransportContext = 'telegram' | 'web';

const MAX_RECENT_CONTEXT_MESSAGES = MAX_PROMPT_RECENT_MESSAGES;

export function isSoloChatChannel(
  channel: Pick<ChatChannelState | ChatChannelView, 'channelKind' | 'composerMode' | 'roomRouting'>,
): boolean {
  return channel.composerMode === 'solo'
    && !isDirectLaneChannel(channel);
}

export function buildOrchestratorTarget(
  state: ChatState,
  channel: ChatChannelView,
): RoutingTarget {
  return {
    participantKind: 'orchestrator',
    participantId: 'orchestrator',
    participantName: isSoloChatChannel(channel) ? 'Orchestrator' : resolveOrchestratorDisplayName(state),
    sessionId: channel.orchestratorLease.sessionId,
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
  if (channel.composerMode === 'solo' && channel.pendingProvider) {
    return {
      provider: channel.pendingProvider,
      instance: channel.pendingInstance ?? null,
      model: channel.pendingModel ?? null,
      modelSelection: channel.pendingModelSelection ?? null,
    };
  }

  return {
    provider: state.globalOrchestrator.executionTarget.provider,
    instance: state.globalOrchestrator.executionTarget.instance,
    model: state.globalOrchestrator.executionTarget.model,
    modelSelection: state.globalOrchestrator.executionModelSelection ?? null,
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
    sessionId: cat.execution.lease.sessionId,
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
  const conversationId = buildChatConversationId(channel.id);
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

function buildSessionContextForTarget(
  channel: ChatChannelView,
  target: RoutingTarget,
  transport?: RuntimeTransportContext,
): {
  source: 'interactive';
  reason: string;
  labels: string[];
  metadata: Record<string, unknown>;
} {
  const resolvedTransport = resolveTransportContext(channel, transport);
  const conversationId = buildChatConversationId(channel.id);
  const transportBindingId = isDirectLaneChannel(channel)
    ? buildDirectLaneTransportBindingId(channel.id)
    : null;
  return {
    source: 'interactive',
    reason: `cats:${channel.channelKind ?? channel.roomRouting?.mode ?? 'boss_chat'}`,
    labels: [
      `channel:${channel.id}`,
      `channel-kind:${channel.channelKind ?? 'boss_thread'}`,
      `room-mode:${channel.roomRouting?.mode ?? 'boss_chat'}`,
      `transport:${resolvedTransport}`,
      `target:${target.participantKind}:${target.participantId}`,
    ],
    metadata: {
      channelId: channel.id,
      conversationId,
      channelTitle: channel.title,
      channelKind: channel.channelKind ?? 'boss_thread',
      roomMode: channel.roomRouting?.mode ?? 'boss_chat',
      defaultRecipientId: channel.roomRouting?.defaultRecipientId ?? null,
      transport: resolvedTransport,
      transportBindingId,
      targetKind: target.participantKind,
      targetId: target.participantId,
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
      roomMode: channel.roomRouting?.mode ?? 'boss_chat',
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
    roomMode: channel.roomRouting?.mode ?? 'boss_chat',
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
  now: Date,
  companionStore?: CompanionBoxStore,
) {
  const baseContext = buildSessionContextForTarget(channel, target, transport);
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

function messageMatchesTarget(message: ChatMessage, target: RoutingTarget): boolean {
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
  channel: ChatChannelView,
  target: RoutingTarget,
  sourceMessage: Pick<ChatMessage, 'id' | 'createdAt'>,
): ChatMessage[] {
  const boundedSourceIndex = resolveSourceBoundaryIndex(channel, sourceMessage);
  if (boundedSourceIndex < 0) {
    return [];
  }
  let lastOwnReplyIndex = -1;

  for (let index = boundedSourceIndex - 1; index >= 0; index -= 1) {
    if (messageMatchesTarget(channel.messages[index], target)) {
      lastOwnReplyIndex = index;
      break;
    }
  }

  const startIndex = Math.max(lastOwnReplyIndex + 1, 0);
  const relevantMessages = channel.messages.slice(startIndex, boundedSourceIndex + 1);
  return relevantMessages.slice(-MAX_RECENT_CONTEXT_MESSAGES);
}

function messagesBeforeSource(
  channel: ChatChannelView,
  sourceMessage: Pick<ChatMessage, 'id' | 'createdAt'>,
): ChatMessage[] {
  const sourceIndex = resolveSourceBoundaryIndex(channel, sourceMessage);
  if (sourceIndex <= 0) {
    return [];
  }

  return channel.messages.slice(0, sourceIndex);
}

function resolveSourceBoundaryIndex(
  channel: ChatChannelView,
  sourceMessage: Pick<ChatMessage, 'id' | 'createdAt'>,
): number {
  const sourceIndex = channel.messages.findIndex((message) => message.id === sourceMessage.id);
  if (sourceIndex !== -1) {
    return sourceIndex;
  }

  for (let index = channel.messages.length - 1; index >= 0; index -= 1) {
    const candidate = channel.messages[index]!;
    if (candidate.createdAt.localeCompare(sourceMessage.createdAt) <= 0) {
      return index;
    }
  }

  return -1;
}

function hasVisibleResponseFromCurrentSession(
  channel: ChatChannelView,
  target: RoutingTarget,
  sourceMessage: Pick<ChatMessage, 'id' | 'createdAt'>,
): boolean {
  if (!target.sessionId) {
    return false;
  }

  return messagesBeforeSource(channel, sourceMessage).some((message) => {
    if (message.senderKind === 'system') {
      return false;
    }

    if (message.metadata.sessionId !== target.sessionId) {
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

function resolveSoloChatBootstrapInstructions(
  channel: ChatChannelView,
  request: DispatchRequest,
): string | null {
  if (hasVisibleResponseFromCurrentSession(channel, request.target, request.sourceMessage)) {
    return null;
  }

  return buildSoloChatBootstrapInstructions(
    messagesBeforeSource(channel, request.sourceMessage),
  );
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
        return 'System routing selected you because you are the lead cat for this room.';
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
}

export function buildPromptForTarget(
  state: ChatState,
  channelId: string,
  request: DispatchRequest,
  transport?: RuntimeTransportContext,
): DispatchPrompt {
  const channel = buildChannelView(state, channelId);
  const promptSourceMessage = request.promptSourceMessage ?? request.sourceMessage;
  const recentMessages = sliceRecentContextForTarget(
    channel,
    request.target,
    promptSourceMessage,
  );
  const routingContext = {
    reason: describeRoutingReason(channel, request.sourceParticipant, request.trigger),
    recentMessages,
    sourceParticipantName: request.sourceParticipant?.participantName ?? null,
    transport: resolveTransportContext(channel, transport),
  };

  if (request.target.participantKind === 'orchestrator') {
    if (isSoloChatChannel(channel)) {
      return {
        message: request.sourceMessage.body,
        instructions: resolveSoloChatBootstrapInstructions(channel, request),
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

  return {
      message: buildCatPrompt(
        channel,
        state.globalOrchestrator,
        participant,
        promptSourceMessage,
        routingContext,
      ),
  };
}
