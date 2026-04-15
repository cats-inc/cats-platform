import {
  collectParticipantLeaseAttachments,
  resolveParticipantCatId,
  resolveParticipantExecutionLease,
  resolveParticipantLeaseAttachment,
  resolvePrimaryParticipantExecutionAssignment,
} from '../../shared/channelParticipants.js';
import { isDirectLaneChannel } from '../../shared/channelTopology.js';
import { resolveVisibleOrchestratorLabel } from '../../../../shared/orchestratorLabel.js';
import { pushServerLiveTrace } from '../../../../shared/liveTrace.js';
import { requireChannel } from '../../state/model/index.js';
import type { ChatApiRouteContext } from '../routeSupport.js';
import {
  awaitNextStreamTarget,
  readStreamTargetSignalVersion,
} from './streamTargetSignal.js';
import { buildChatLaneId } from '../../../../shared/chatCoreIds.js';

export interface ChannelStreamTarget {
  sessionId: string | null;
  laneId: string | null;
  participantId: string | null;
  catId: string | null;
  speakerLabel: string | null;
  sessionStartedAt: string | null;
  requiresSessionStartConfirmation: boolean;
  targetStateId: string | null;
}

interface ResolvedChannelStreamTarget {
  target: ChannelStreamTarget | null;
  reason: string | null;
}

function resolveActiveTurn(
  channel: ReturnType<typeof requireChannel>,
) {
  return channel.roomRouting?.workflow?.activeTurn ?? null;
}

function resolveActiveTurnInitialTargetCount(
  channel: ReturnType<typeof requireChannel>,
): number {
  const activeTurn = resolveActiveTurn(channel);
  const lastOutcome = channel.roomRouting?.lastOutcome ?? null;
  if (activeTurn && lastOutcome?.turnId === activeTurn.id) {
    return lastOutcome.resolvedTargets.length;
  }

  const turnStartedEvent = activeTurn?.events.find((event) => event.kind === 'turn_started') ?? null;
  return turnStartedEvent?.targets.length ?? 0;
}

function resolveActiveParticipantCount(
  channel: ReturnType<typeof requireChannel>,
): number {
  const participantIds = new Set<string>();
  for (const assignment of channel.catAssignments) {
    if (assignment.status === 'active') {
      participantIds.add(assignment.participantId);
    }
  }
  for (const assignment of channel.participantAssignments ?? []) {
    if (assignment.status === 'active') {
      participantIds.add(assignment.participantId);
    }
  }
  return participantIds.size;
}

function normalizeVisibleSpeakerLabel(label: string | null | undefined): string | null {
  const normalized = label?.trim();
  if (!normalized) {
    return null;
  }
  return normalized;
}

function buildParticipantStreamTarget(
  channel: ReturnType<typeof requireChannel>,
  participantId: string,
  fallbackSpeakerLabel: string | null = null,
  sessionConfirmationFloorAt: string | null = null,
  expectedLaneId: string | null = null,
): ChannelStreamTarget {
  const assignment = resolvePrimaryParticipantExecutionAssignment(channel, participantId);
  const lease = resolveParticipantExecutionLease(channel, participantId);
  const attachment = resolveParticipantLeaseAttachment(
    channel,
    participantId,
    {
      laneId: expectedLaneId,
      statuses: ['ready', 'initializing'],
    },
  ) ?? (
    expectedLaneId
      ? null
      : resolveParticipantLeaseAttachment(channel, participantId, {
        statuses: ['ready', 'initializing'],
      })
  );
  const sessionStartedAt = attachment?.sessionId ? lease?.startedAt ?? null : null;
  return {
    sessionId: attachment?.sessionId ?? null,
    laneId: expectedLaneId ?? attachment?.laneId ?? (lease?.laneId?.trim() || null),
    participantId,
    catId: assignment ? resolveParticipantCatId(assignment) : null,
    speakerLabel: normalizeVisibleSpeakerLabel(assignment?.name ?? fallbackSpeakerLabel),
    sessionStartedAt,
    requiresSessionStartConfirmation: shouldRequireSessionStartConfirmation(
      channel,
      sessionStartedAt,
      sessionConfirmationFloorAt,
    ),
    targetStateId: null,
  };
}

function buildOrchestratorStreamTarget(
  channel: ReturnType<typeof requireChannel>,
  fallbackSpeakerLabel: string | null = null,
  sessionConfirmationFloorAt: string | null = null,
  expectedLaneId: string | null = null,
): ChannelStreamTarget {
  const speakerLabel = resolveVisibleOrchestratorLabel({
    displayName: fallbackSpeakerLabel,
    provider: channel.pendingProvider ?? channel.orchestratorLease.provider ?? null,
    instance: channel.pendingProvider ? (channel.pendingInstance ?? null) : null,
  });
  const leaseLaneId = channel.orchestratorLease.laneId?.trim() || null;
  const laneMatches = !expectedLaneId || leaseLaneId === expectedLaneId;
  const sessionStartedAt = laneMatches ? channel.orchestratorLease.startedAt ?? null : null;
  return {
    sessionId: laneMatches
      ? channel.orchestratorLease?.sessionId?.trim() || null
      : null,
    laneId: expectedLaneId ?? leaseLaneId,
    participantId: 'orchestrator',
    catId: null,
    speakerLabel,
    sessionStartedAt,
    requiresSessionStartConfirmation: shouldRequireSessionStartConfirmation(
      channel,
      sessionStartedAt,
      sessionConfirmationFloorAt,
    ),
    targetStateId: null,
  };
}

function shouldRequireSessionStartConfirmation(
  channel: ReturnType<typeof requireChannel>,
  sessionStartedAt: string | null,
  sessionConfirmationFloorAt: string | null = null,
): boolean {
  if (!sessionStartedAt) {
    return false;
  }

  const activeTurnStartedAt = channel.roomRouting?.workflow?.activeTurn?.startedAt ?? null;
  const confirmationFloorAt = sessionConfirmationFloorAt ?? activeTurnStartedAt;
  if (!confirmationFloorAt) {
    return false;
  }

  const sessionTimestamp = Date.parse(sessionStartedAt);
  const confirmationFloorTimestamp = Date.parse(confirmationFloorAt);
  if (Number.isNaN(sessionTimestamp) || Number.isNaN(confirmationFloorTimestamp)) {
    return false;
  }

  return sessionTimestamp >= confirmationFloorTimestamp;
}

function buildWorkflowTargetStreamTarget(
  channel: ReturnType<typeof requireChannel>,
  turnId: string,
  targetStatus: {
    id: string;
    laneId?: string | null;
    queuedAt?: string | null;
    startedAt?: string | null;
    participant: {
      participantKind: 'orchestrator' | 'cat';
      participantId: string;
      participantName: string;
    };
  },
): ChannelStreamTarget {
  const participant = targetStatus.participant;
  const sessionConfirmationFloorAt = targetStatus.startedAt ?? targetStatus.queuedAt ?? null;
  const laneId = targetStatus.laneId?.trim() || buildChatLaneId(
    turnId,
    targetStatus.id,
    participant.participantId,
  );
  const target = participant.participantKind === 'orchestrator'
    ? buildOrchestratorStreamTarget(
        channel,
        participant.participantName,
        sessionConfirmationFloorAt,
        laneId,
      )
    : buildParticipantStreamTarget(
        channel,
        participant.participantId,
        participant.participantName,
        sessionConfirmationFloorAt,
        laneId,
      );
  return {
    ...target,
    laneId,
    targetStateId: targetStatus.id,
  };
}

function hasActiveWorkflowTurn(
  channel: ReturnType<typeof requireChannel>,
): boolean {
  const activeTurn = resolveActiveTurn(channel);
  return activeTurn?.status === 'running' || activeTurn?.status === 'pending';
}

function shouldAllowLegacyFallbackDuringActiveWorkflowTurn(
  channel: ReturnType<typeof requireChannel>,
): boolean {
  const activeTurn = resolveActiveTurn(channel);
  if (!activeTurn || activeTurn.targetStatuses.length > 0) {
    return false;
  }

  if (resolveActiveTurnInitialTargetCount(channel) > 1) {
    return false;
  }

  if (isDirectLaneChannel(channel)) {
    return Boolean(channel.roomRouting?.defaultRecipientId);
  }

  return resolveActiveParticipantCount(channel) <= 1;
}

function resolveWorkflowStreamTargetWithReason(
  channel: ReturnType<typeof requireChannel>,
): ResolvedChannelStreamTarget {
  const activeTurn = channel.roomRouting?.workflow?.activeTurn ?? null;
  if (!hasActiveWorkflowTurn(channel) || !activeTurn) {
    return { target: null, reason: 'no_active_workflow_turn' };
  }

  const prioritizedTargetStatuses = [
    ...activeTurn.targetStatuses.filter((target) => target.status === 'running'),
    ...activeTurn.targetStatuses.filter((target) => target.status === 'pending'),
  ];

  for (const targetStatus of prioritizedTargetStatuses) {
    const target = buildWorkflowTargetStreamTarget(channel, activeTurn.id, targetStatus);
    if (target.sessionId) {
      return {
        target,
        reason: targetStatus.status === 'running'
          ? 'active_workflow_running_target'
          : 'active_workflow_pending_target',
      };
    }
  }

  if (prioritizedTargetStatuses.length > 0) {
    const nextTarget = prioritizedTargetStatuses[0]!;
    return {
      target: buildWorkflowTargetStreamTarget(channel, activeTurn.id, nextTarget),
      reason: nextTarget.status === 'running'
        ? 'active_workflow_running_target_waiting_for_session'
        : 'active_workflow_pending_target_waiting_for_session',
    };
  }

  return {
    target: null,
    reason: activeTurn.targetStatuses.length === 0
      ? 'active_workflow_waiting_for_target'
      : 'active_workflow_without_stream_target',
  };
}

function resolveWorkflowStreamTargets(
  channel: ReturnType<typeof requireChannel>,
): ChannelStreamTarget[] {
  const activeTurn = channel.roomRouting?.workflow?.activeTurn ?? null;
  if (!hasActiveWorkflowTurn(channel) || !activeTurn) {
    return [];
  }

  const runningTargets = activeTurn.targetStatuses.filter((target) => target.status === 'running');
  const pendingTargets = activeTurn.targetStatuses.filter((target) => target.status === 'pending');
  const attachableTargets = activeTurn.workflowShape === 'concurrent'
    ? [...runningTargets, ...pendingTargets]
    : runningTargets.length > 0
      ? runningTargets
      : pendingTargets.slice(0, 1);

  return attachableTargets.map((targetStatus) =>
    buildWorkflowTargetStreamTarget(channel, activeTurn.id, targetStatus));
}

export function resolveChannelStreamTarget(
  channel: ReturnType<typeof requireChannel>,
): ChannelStreamTarget | null {
  return resolveChannelStreamTargetWithReason(channel).target;
}

export function resolveChannelStreamTargets(
  channel: ReturnType<typeof requireChannel>,
): ChannelStreamTarget[] {
  const workflowTargets = resolveWorkflowStreamTargets(channel);
  if (workflowTargets.length > 0) {
    return workflowTargets;
  }

  const fallbackTarget = resolveChannelStreamTarget(channel);
  return fallbackTarget ? [fallbackTarget] : [];
}

export function resolveChannelReadyStreamTargets(
  channel: ReturnType<typeof requireChannel>,
): ChannelStreamTarget[] {
  return resolveChannelStreamTargets(channel)
    .filter((target) => Boolean(target.sessionId));
}

function resolveChannelStreamTargetWithReason(
  channel: ReturnType<typeof requireChannel>,
): ResolvedChannelStreamTarget {
  const workflowTarget = resolveWorkflowStreamTargetWithReason(channel);
  if (hasActiveWorkflowTurn(channel) && (workflowTarget.target || !shouldAllowLegacyFallbackDuringActiveWorkflowTurn(channel))) {
    return workflowTarget;
  }

  const defaultRecipientId = channel.roomRouting?.defaultRecipientId ?? null;
  if (isDirectLaneChannel(channel)) {
    if (!defaultRecipientId) {
      return { target: null, reason: 'direct_lane_without_default_recipient' };
    }
    const leadTarget = buildParticipantStreamTarget(channel, defaultRecipientId);
    if (leadTarget.sessionId) {
      return { target: leadTarget, reason: 'direct_lane_default_recipient' };
    }
    return { target: null, reason: 'direct_lane_default_recipient_without_session' };
  }

  if (defaultRecipientId) {
    const leadTarget = buildParticipantStreamTarget(channel, defaultRecipientId);
    if (leadTarget.sessionId) {
      return { target: leadTarget, reason: 'room_default_recipient' };
    }
  }

  const participantAttachment = collectParticipantLeaseAttachments(channel, {
    statuses: ['ready', 'initializing'],
  })[0] ?? null;
  if (participantAttachment?.sessionId) {
    const target = buildParticipantStreamTarget(
      channel,
      participantAttachment.participantId,
      null,
      null,
      participantAttachment.laneId,
    );
    const assignment = resolvePrimaryParticipantExecutionAssignment(
      channel,
      participantAttachment.participantId,
    );
    if (target.sessionId) {
      return {
        target,
        reason: assignment?.sourceKind === 'cat'
          ? 'participant_lease_fallback_cat_assignment'
          : 'participant_lease_fallback_assignment',
      };
    }
    return {
      target: {
        sessionId: participantAttachment.sessionId,
        laneId: participantAttachment.laneId,
        participantId: participantAttachment.participantId,
        catId: assignment ? resolveParticipantCatId(assignment) : null,
        speakerLabel: normalizeVisibleSpeakerLabel(assignment?.name ?? null),
        sessionStartedAt: null,
        requiresSessionStartConfirmation: false,
        targetStateId: null,
      },
      reason: 'participant_lease_fallback_unknown_assignment',
    };
  }

  const orchestratorTarget = buildOrchestratorStreamTarget(channel);
  return orchestratorTarget.sessionId
    ? { target: orchestratorTarget, reason: 'orchestrator_fallback' }
    : { target: null, reason: 'no_stream_target' };
}

export function resolveChannelStreamSessionId(
  channel: ReturnType<typeof requireChannel>,
): string | null {
  const streamTarget = resolveChannelStreamTarget(channel);
  return streamTarget?.sessionId ?? null;
}

export async function waitForChannelStreamTarget(
  context: ChatApiRouteContext,
  channelId: string,
  signal: AbortSignal,
): Promise<ChannelStreamTarget | null> {
  while (!signal.aborted) {
    const observedSignalVersion = readStreamTargetSignalVersion(channelId);
    const state = await context.dependencies.chatStore.read();
    const channel = requireChannel(state, channelId);
    const resolvedStreamTarget = resolveChannelStreamTargetWithReason(channel);
    const streamTarget = resolvedStreamTarget.target;
    if (streamTarget?.sessionId) {
      if (context.dependencies.config.debugLiveTrace) {
        pushServerLiveTrace({
          event: 'stream_target_ready',
          channelId,
          sessionId: streamTarget.sessionId,
          participantId: streamTarget.participantId,
          catId: streamTarget.catId,
          speakerLabel: streamTarget.speakerLabel,
          reason: resolvedStreamTarget.reason,
          details: {
            laneId: streamTarget.laneId,
          },
        });
      }
      return streamTarget;
    }

    const suppressedDirectLaneFallback =
      !hasActiveWorkflowTurn(channel)
      && isDirectLaneChannel(channel)
      && resolvedStreamTarget.reason === 'direct_lane_default_recipient_without_session'
      && Boolean(channel.orchestratorLease.sessionId?.trim());
    if (suppressedDirectLaneFallback) {
      return null;
    }

    await awaitNextStreamTarget(channelId, observedSignalVersion, signal);
  }

  return null;
}

export async function waitForNextChannelStreamTarget(
  context: ChatApiRouteContext,
  channelId: string,
  previousTargetStateId: string | null,
  signal: AbortSignal,
): Promise<ChannelStreamTarget | null> {
  while (!signal.aborted) {
    const observedSignalVersion = readStreamTargetSignalVersion(channelId);
    const state = await context.dependencies.chatStore.read();
    const channel = requireChannel(state, channelId);
    if (!hasActiveWorkflowTurn(channel)) {
      return null;
    }

    const resolvedStreamTarget = resolveWorkflowStreamTargetWithReason(channel);
    const streamTarget = resolvedStreamTarget.target;
    if (streamTarget && streamTarget.targetStateId !== previousTargetStateId && streamTarget.sessionId) {
      if (context.dependencies.config.debugLiveTrace) {
        pushServerLiveTrace({
          event: 'stream_target_ready',
          channelId,
          sessionId: streamTarget.sessionId,
          participantId: streamTarget.participantId,
          catId: streamTarget.catId,
          speakerLabel: streamTarget.speakerLabel,
          reason: resolvedStreamTarget.reason,
          details: {
            laneId: streamTarget.laneId,
            targetStateId: streamTarget.targetStateId,
            previousTargetStateId,
          },
        });
      }
      return streamTarget;
    }

    await awaitNextStreamTarget(channelId, observedSignalVersion, signal);
  }

  return null;
}

export function writeSseEvent(
  context: ChatApiRouteContext,
  event: string,
  data: Record<string, unknown>,
): void {
  const payload = typeof data.type === 'string'
    ? data
    : { ...data, type: event };
  context.response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}
