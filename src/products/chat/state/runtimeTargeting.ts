import type {
  ChatChannelCat,
  ChatChannelState,
  ChatChannelView,
  ChatMessage,
  ChatState,
} from '../api/contracts.js';
import type {
  RoomRoutingParticipantRef,
  RoomRoutingTrigger,
} from '../../../shared/roomRouting.js';
import type { CompanionBoxStore } from './companionBoxStore.js';
import type { RuntimeSkillManifest } from '../../../platform/runtime/client.js';
import { shouldHydrateCompanionSession } from '../companion/hydration.js';
import { resolveSkillProfileManifest } from '../../../shared/skillProfiles.js';
import {
  buildChannelView,
  requireChannel,
  requireCat,
  resolveOrchestratorDisplayName,
} from './model.js';
import type { RoutingTarget } from './mentionRouter.js';
import {
  buildOrchestratorPrompt,
  buildCatPrompt,
  MAX_PROMPT_RECENT_MESSAGES,
} from './prompts.js';
import { resolveRoomRoutingState } from './roomRouting.js';
import type { DispatchRequest } from './roomRoutingRuntime.js';

export type RuntimeTransportContext = 'telegram' | 'web';

const MAX_RECENT_CONTEXT_MESSAGES = MAX_PROMPT_RECENT_MESSAGES;

function activeAssignedCats(channel: { assignedCats: ChatChannelCat[] }) {
  return channel.assignedCats.filter((cat) => cat.status === 'active');
}

export function buildOrchestratorTarget(
  state: ChatState,
  channel: ChatChannelView,
): RoutingTarget {
  return {
    participantKind: 'orchestrator',
    participantId: 'orchestrator',
    participantName: resolveOrchestratorDisplayName(state),
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
} {
  if (channel.composerMode === 'solo' && channel.pendingProvider) {
    return {
      provider: channel.pendingProvider,
      instance: channel.pendingInstance ?? null,
      model: channel.pendingModel ?? null,
    };
  }

  return {
    provider: state.globalOrchestrator.executionTarget.provider,
    instance: state.globalOrchestrator.executionTarget.instance,
    model: state.globalOrchestrator.executionTarget.model,
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
} {
  const channel = requireChannel(state, channelId);
  if (target.participantKind === 'orchestrator') {
    const executionTarget = resolveOrchestratorExecutionTarget(state, channel);
    return {
      provider: executionTarget.provider,
      model: executionTarget.model,
      instance: executionTarget.instance,
    };
  }

  const assignment = channel.catAssignments.find(
    (candidate) => candidate.catId === target.participantId && candidate.status === 'active',
  );
  return {
    provider: assignment?.execution.target.provider ?? null,
    model: assignment?.execution.target.model ?? null,
    instance: assignment?.execution.target.instance ?? null,
  };
}

export function buildCatTarget(cat: ChatChannelCat): RoutingTarget {
  return {
    participantKind: 'cat',
    participantId: cat.catId,
    participantName: cat.name,
    sessionId: cat.execution.lease.sessionId,
  };
}

export function resolveChoiceResponseTarget(
  state: ChatState,
  channel: ChatChannelView,
  sourceMessageId: string,
): RoutingTarget | null {
  const sourceMessage = channel.messages.find((message) => message.id === sourceMessageId);
  if (!sourceMessage) {
    return null;
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

  const cat = activeAssignedCats(channel).find((candidate) => candidate.catId === targetId);
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
  return {
    source: 'interactive',
    reason: `cats:${channel.roomRouting?.mode ?? 'boss_chat'}`,
    labels: [
      `channel:${channel.id}`,
      `room-mode:${channel.roomRouting?.mode ?? 'boss_chat'}`,
      `transport:${resolvedTransport}`,
      `target:${target.participantKind}:${target.participantId}`,
    ],
    metadata: {
      channelId: channel.id,
      channelTitle: channel.title,
      roomMode: channel.roomRouting?.mode ?? 'boss_chat',
      leadParticipantId: channel.roomRouting?.leadParticipantId ?? null,
      transport: resolvedTransport,
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

  const cat = channel.assignedCats.find((candidate) => candidate.catId === target.participantId);
  return resolveSkillProfileManifest({
    profileId: cat?.skillProfile,
    catId: cat?.catId ?? target.participantId,
    roomMode: channel.roomRouting?.mode ?? 'boss_chat',
    transport: resolvedTransport,
    labels: ['participant:cat'],
    metadata: {
      channelId: channel.id,
      catName: cat?.name ?? target.participantName,
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

  const cat = requireCat(state, target.participantId);
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
  sourceMessageId: string,
): ChatMessage[] {
  const sourceIndex = channel.messages.findIndex((message) => message.id === sourceMessageId);
  const boundedSourceIndex = sourceIndex === -1 ? channel.messages.length - 1 : sourceIndex;
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

function describeRoutingReason(
  channel: ChatChannelView,
  sourceParticipant: RoomRoutingParticipantRef | null,
  trigger: RoomRoutingTrigger,
): string {
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  switch (trigger) {
    case 'room_default':
      if (roomRouting.mode === 'direct_cat_chat') {
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

export function buildPromptForTarget(
  state: ChatState,
  channelId: string,
  request: DispatchRequest,
  transport?: RuntimeTransportContext,
): string {
  const channel = buildChannelView(state, channelId);
  const recentMessages = sliceRecentContextForTarget(
    channel,
    request.target,
    request.sourceMessage.id,
  );
  const routingContext = {
    reason: describeRoutingReason(channel, request.sourceParticipant, request.trigger),
    recentMessages,
    sourceParticipantName: request.sourceParticipant?.participantName ?? null,
    transport: resolveTransportContext(channel, transport),
  };

  if (request.target.participantKind === 'orchestrator') {
    return buildOrchestratorPrompt(
      channel,
      state.globalOrchestrator,
      request.sourceMessage,
      request.target.participantName,
      routingContext,
    );
  }

  const cat = channel.assignedCats.find(
    (candidate) => candidate.catId === request.target.participantId,
  );
  if (!cat) {
    throw new Error(`Target cat is no longer assigned to the selected chat: ${request.target.participantId}`);
  }

  return buildCatPrompt(
    channel,
    state.globalOrchestrator,
    cat,
    request.sourceMessage,
    routingContext,
  );
}
