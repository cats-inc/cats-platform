import {
  collectParticipantSessionIds,
  resolveParticipantCatId,
  resolveParticipantSessionId,
  resolvePrimaryParticipantExecutionAssignment,
} from '../../shared/channelParticipants.js';
import { isDirectLaneChannel } from '../../shared/channelTopology.js';
import { buildExecutionLabel } from '../../../../shared/executionLabel.js';
import { pushServerLiveTrace } from '../../../../shared/liveTrace.js';
import { requireChannel } from '../../state/model/index.js';
import type { ChatApiRouteContext } from '../routeSupport.js';

const CHANNEL_STREAM_SESSION_WAIT_MS = 1500;
const CHANNEL_STREAM_SESSION_POLL_MS = 75;

export interface ChannelStreamTarget {
  sessionId: string | null;
  participantId: string | null;
  catId: string | null;
  speakerLabel: string | null;
}

interface ResolvedChannelStreamTarget {
  target: ChannelStreamTarget | null;
  reason: string | null;
}

function normalizeVisibleSpeakerLabel(label: string | null | undefined): string | null {
  const normalized = label?.trim();
  if (!normalized || normalized === 'Chat') {
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
  return {
    sessionId: resolveParticipantSessionId(
      channel,
      participantId,
      { statuses: ['ready', 'initializing'] },
    ),
    participantId,
    catId: assignment ? resolveParticipantCatId(assignment) : null,
    speakerLabel: normalizeVisibleSpeakerLabel(assignment?.name ?? fallbackSpeakerLabel),
  };
}

function buildOrchestratorStreamTarget(
  channel: ReturnType<typeof requireChannel>,
  fallbackSpeakerLabel: string | null = null,
): ChannelStreamTarget {
  const speakerLabel = normalizeVisibleSpeakerLabel(fallbackSpeakerLabel)
    ?? (
      channel.pendingProvider
        ? buildExecutionLabel(
            channel.pendingProvider,
            channel.pendingInstance ?? null,
            null,
          )
        : channel.orchestratorLease.provider
          ? buildExecutionLabel(
              channel.orchestratorLease.provider,
              null,
              null,
            )
          : null
    );
  return {
    sessionId: channel.orchestratorLease?.sessionId?.trim() || null,
    participantId: 'orchestrator',
    catId: null,
    speakerLabel,
  };
}

function buildWorkflowTargetStreamTarget(
  channel: ReturnType<typeof requireChannel>,
  participant: {
    participantKind: 'orchestrator' | 'cat';
    participantId: string;
    participantName: string;
  },
): ChannelStreamTarget {
  return participant.participantKind === 'orchestrator'
    ? buildOrchestratorStreamTarget(channel, participant.participantName)
    : buildParticipantStreamTarget(
        channel,
        participant.participantId,
        participant.participantName,
      );
}

export function resolveChannelStreamTarget(
  channel: ReturnType<typeof requireChannel>,
): ChannelStreamTarget | null {
  return resolveChannelStreamTargetWithReason(channel).target;
}

function resolveChannelStreamTargetWithReason(
  channel: ReturnType<typeof requireChannel>,
): ResolvedChannelStreamTarget {
  const activeTurn = channel.roomRouting?.workflow?.activeTurn ?? null;
  if (activeTurn?.status === 'running') {
    const prioritizedTargetStatuses = [
      ...activeTurn.targetStatuses.filter((target) => target.status === 'running'),
      ...activeTurn.targetStatuses.filter((target) => target.status === 'pending'),
    ];

    for (const targetStatus of prioritizedTargetStatuses) {
      const target = buildWorkflowTargetStreamTarget(channel, targetStatus.participant);
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
        target: buildWorkflowTargetStreamTarget(channel, nextTarget.participant),
        reason: nextTarget.status === 'running'
          ? 'active_workflow_running_target_waiting_for_session'
          : 'active_workflow_pending_target_waiting_for_session',
      };
    }
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

function waitForStreamLease(
  durationMs: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, durationMs);

    function onAbort(): void {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve();
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function waitForChannelStreamTarget(
  context: ChatApiRouteContext,
  channelId: string,
  signal: AbortSignal,
): Promise<ChannelStreamTarget | null> {
  const deadline = Date.now() + CHANNEL_STREAM_SESSION_WAIT_MS;
  let lastObservedTarget: ChannelStreamTarget | null = null;
  let lastObservedReason: string | null = null;

  while (!signal.aborted) {
    const state = await context.dependencies.chatStore.read();
    const channel = requireChannel(state, channelId);
    const resolvedStreamTarget = resolveChannelStreamTargetWithReason(channel);
    const streamTarget = resolvedStreamTarget.target;
    if (streamTarget) {
      lastObservedTarget = streamTarget;
      lastObservedReason = resolvedStreamTarget.reason;
    }
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
    if (Date.now() >= deadline) {
      if (context.dependencies.config.debugLiveTrace) {
        pushServerLiveTrace({
          event: 'stream_target_timeout',
          channelId,
          sessionId: lastObservedTarget?.sessionId ?? null,
          participantId: lastObservedTarget?.participantId ?? null,
          catId: lastObservedTarget?.catId ?? null,
          speakerLabel: lastObservedTarget?.speakerLabel ?? null,
          reason: lastObservedReason ?? resolvedStreamTarget.reason,
        });
      }
      return lastObservedTarget;
    }
    await waitForStreamLease(CHANNEL_STREAM_SESSION_POLL_MS, signal);
  }

  return lastObservedTarget;
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
