import {
  collectParticipantSessionIds,
  resolveParticipantCatId,
  resolveParticipantExecutionLease,
  resolveParticipantSessionId,
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

export interface ChannelStreamTarget {
  sessionId: string | null;
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
): ChannelStreamTarget {
  const assignment = resolvePrimaryParticipantExecutionAssignment(channel, participantId);
  const lease = resolveParticipantExecutionLease(channel, participantId);
  const sessionStartedAt = lease?.startedAt ?? null;
  return {
    sessionId: resolveParticipantSessionId(
      channel,
      participantId,
      { statuses: ['ready', 'initializing'] },
    ),
    participantId,
    catId: assignment ? resolveParticipantCatId(assignment) : null,
    speakerLabel: normalizeVisibleSpeakerLabel(assignment?.name ?? fallbackSpeakerLabel),
    sessionStartedAt,
    requiresSessionStartConfirmation: shouldRequireSessionStartConfirmation(
      channel,
      sessionStartedAt,
    ),
    targetStateId: null,
  };
}

function buildOrchestratorStreamTarget(
  channel: ReturnType<typeof requireChannel>,
  fallbackSpeakerLabel: string | null = null,
): ChannelStreamTarget {
  const speakerLabel = resolveVisibleOrchestratorLabel({
    displayName: fallbackSpeakerLabel,
    provider: channel.pendingProvider ?? channel.orchestratorLease.provider ?? null,
    instance: channel.pendingProvider ? (channel.pendingInstance ?? null) : null,
  });
  return {
    sessionId: channel.orchestratorLease?.sessionId?.trim() || null,
    participantId: 'orchestrator',
    catId: null,
    speakerLabel,
    sessionStartedAt: channel.orchestratorLease.startedAt ?? null,
    requiresSessionStartConfirmation: shouldRequireSessionStartConfirmation(
      channel,
      channel.orchestratorLease.startedAt ?? null,
    ),
    targetStateId: null,
  };
}

function shouldRequireSessionStartConfirmation(
  channel: ReturnType<typeof requireChannel>,
  sessionStartedAt: string | null,
): boolean {
  if (!sessionStartedAt) {
    return false;
  }

  const activeTurnStartedAt = channel.roomRouting?.workflow?.activeTurn?.startedAt ?? null;
  if (!activeTurnStartedAt) {
    return false;
  }

  const sessionTimestamp = Date.parse(sessionStartedAt);
  const activeTurnTimestamp = Date.parse(activeTurnStartedAt);
  if (Number.isNaN(sessionTimestamp) || Number.isNaN(activeTurnTimestamp)) {
    return false;
  }

  return sessionTimestamp >= activeTurnTimestamp;
}

function buildWorkflowTargetStreamTarget(
  channel: ReturnType<typeof requireChannel>,
  targetStatus: {
    id: string;
    participant: {
      participantKind: 'orchestrator' | 'cat';
      participantId: string;
      participantName: string;
    };
  },
): ChannelStreamTarget {
  const participant = targetStatus.participant;
  const target = participant.participantKind === 'orchestrator'
    ? buildOrchestratorStreamTarget(channel, participant.participantName)
    : buildParticipantStreamTarget(
        channel,
        participant.participantId,
        participant.participantName,
      );
  return {
    ...target,
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

  if (channel.roomRouting?.defaultRecipientId) {
    return true;
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
    const target = buildWorkflowTargetStreamTarget(channel, targetStatus);
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
      target: buildWorkflowTargetStreamTarget(channel, nextTarget),
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

export function resolveChannelStreamTarget(
  channel: ReturnType<typeof requireChannel>,
): ChannelStreamTarget | null {
  return resolveChannelStreamTargetWithReason(channel).target;
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

  const participantSessionId = collectParticipantSessionIds(channel, {
    statuses: ['ready', 'initializing'],
  })[0] ?? null;
  if (participantSessionId) {
    for (const assignment of channel.catAssignments) {
      const target = buildParticipantStreamTarget(channel, assignment.participantId);
      if (target.sessionId === participantSessionId) {
        return { target, reason: 'participant_session_fallback_cat_assignment' };
      }
    }
    for (const assignment of channel.participantAssignments ?? []) {
      const target = buildParticipantStreamTarget(channel, assignment.participantId);
      if (target.sessionId === participantSessionId) {
        return { target, reason: 'participant_session_fallback_assignment' };
      }
    }
    return {
      target: {
        sessionId: participantSessionId,
        participantId: null,
        catId: null,
        speakerLabel: null,
        sessionStartedAt: null,
        requiresSessionStartConfirmation: false,
        targetStateId: null,
      },
      reason: 'participant_session_fallback_unknown_assignment',
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
        });
      }
      return streamTarget;
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
