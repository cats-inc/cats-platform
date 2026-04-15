import type {
  ChannelActivationResult,
  ChatState,
} from '../../api/contracts.js';
import { isDirectLaneChannel } from '../../shared/channelTopology.js';
import {
  activeAssignedParticipants,
  resolveChannelParticipantAssignments,
} from '../../shared/channelParticipants.js';
import type { RoutingTarget } from '../mentionRouter.js';
import {
  ORCHESTRATOR_NAME,
  buildChannelView,
  requireChannel,
  setChannelStatus,
  setChannelRoomRouting,
} from '../model/index.js';
import { resolveRoomDefaultRoutingTarget } from '../mentionRouter.js';
import { resolveRoomRoutingState } from '../room-routing/index.js';
import { createRecordedWakeRequest } from '../room-routing/wake.js';
import { buildCatTarget, buildOrchestratorTarget } from '../runtimeTargeting.js';

export function resolveChannelActivationTargets(
  state: ChatState,
  channelId: string,
): RoutingTarget[] {
  const channel = buildChannelView(state, channelId);
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  return isDirectLaneChannel(channel)
    ? activeAssignedParticipants(channel)
        .filter((participant) => participant.participantId === roomRouting.defaultRecipientId)
        .map((participant) => buildCatTarget(participant))
    : [
        buildOrchestratorTarget(state, channel),
        ...activeAssignedParticipants(channel).map((participant) => buildCatTarget(participant)),
      ];
}

export function applyChannelActivationStatus(input: {
  state: ChatState;
  channelId: string;
  results: ChannelActivationResult[];
  now: Date;
}): ChatState {
  const channelState = requireChannel(input.state, input.channelId);
  const hasStartedSession = input.results.some(
    (result) => result.status === 'started' || result.status === 'already_started',
  );
  const hasConfiguredParticipants = resolveChannelParticipantAssignments(channelState).length > 0;
  return setChannelStatus(
    input.state,
    input.channelId,
    hasStartedSession ? 'active' : hasConfiguredParticipants ? 'configured' : 'planned',
    input.now,
  );
}

export function resolveRoomEntryWakeTarget(input: {
  state: ChatState;
  channelId: string;
  now: Date;
}): {
  state: ChatState;
  roomRouting: ReturnType<typeof resolveRoomRoutingState>;
  target: RoutingTarget | null;
  result: ChannelActivationResult | null;
} {
  const roomRouting = resolveRoomRoutingState(
    requireChannel(input.state, input.channelId).roomRouting,
  );
  const defaultTarget = resolveRoomDefaultRoutingTarget(input.state, input.channelId);

  if (!defaultTarget.target) {
    let nextState = input.state;
    if (defaultTarget.participant) {
      createRecordedWakeRequest(
        roomRouting,
        defaultTarget.participant,
        'room_entry',
        'room_entry',
        null,
        input.now.toISOString(),
        'failed',
        defaultTarget.note ?? `No ${ORCHESTRATOR_NAME} room entry participant could be woken.`,
      );
      nextState = setChannelRoomRouting(nextState, input.channelId, roomRouting, input.now);
    }
    return {
      state: nextState,
      roomRouting,
      target: null,
      result: defaultTarget.participant
        ? {
            targetKind: defaultTarget.participant.participantKind,
            targetId: defaultTarget.participant.participantId,
            targetName: defaultTarget.participant.participantName,
            laneId: null,
            status: 'error',
            sessionId: null,
            error: defaultTarget.note ?? 'No room entry participant could be woken.',
          }
        : null,
    };
  }

  return {
    state: input.state,
    roomRouting,
    target: defaultTarget.target,
    result: null,
  };
}
