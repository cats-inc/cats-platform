import type {
  ChannelActivationResult,
  ChatState,
} from '../../api/contracts.js';
import type { RuntimeClient } from '../../../../platform/runtime/client.js';
import { isDirectLaneChannel } from '../../shared/channelTopology.js';
import { resolveChannelParticipantAssignments } from '../../shared/channelParticipants.js';
import { ORCHESTRATOR_NAME, buildChannelView, requireChannel, setChannelStatus, setChannelRoomRouting } from '../model/index.js';
import { resolveRoomDefaultRoutingTarget } from '../mentionRouter.js';
import { resolveRoomRoutingState } from '../room-routing/index.js';
import { createRecordedWakeRequest } from '../room-routing/wake.js';
import { buildCatTarget, buildOrchestratorTarget } from '../runtimeTargeting.js';
import { ensureTargetSession } from './wake.js';
import {
  activeAssignedParticipants,
  buildChannelActivationResult,
  resolveTargetLeaseAttachment,
  type RuntimeSessionRoutingOptions,
} from './shared.js';
import { ensureChannelMarkedActive } from './state.js';

export async function activateChannelSessions(
  state: ChatState,
  channelId: string,
  runtimeClient: RuntimeClient,
  now: Date = new Date(),
  options: RuntimeSessionRoutingOptions = {},
): Promise<{ state: ChatState; results: ChannelActivationResult[] }> {
  let nextState = state;
  const results: ChannelActivationResult[] = [];
  const initialChannel = buildChannelView(nextState, channelId);
  const roomRouting = resolveRoomRoutingState(initialChannel.roomRouting);
  const activationTargets = isDirectLaneChannel(initialChannel)
    ? activeAssignedParticipants(initialChannel)
        .filter((participant) => participant.participantId === roomRouting.defaultRecipientId)
        .map((participant) => buildCatTarget(participant))
    : [
        buildOrchestratorTarget(nextState, initialChannel),
        ...activeAssignedParticipants(initialChannel).map((participant) => buildCatTarget(participant)),
      ];

  for (const target of activationTargets) {
    const ensured = await ensureTargetSession(
      nextState,
      channelId,
      target,
      runtimeClient,
      now,
      {
        ...options,
        forceReviveClosedSessions: true,
      },
    );
    nextState = ensured.state;
    results.push(buildChannelActivationResult({
      target,
      ensured,
    }));
  }

  const channelState = requireChannel(nextState, channelId);
  const hasStartedSession = results.some(
    (result) => result.status === 'started' || result.status === 'already_started',
  );
  const hasConfiguredParticipants = resolveChannelParticipantAssignments(channelState).length > 0;
  nextState = setChannelStatus(
    nextState,
    channelId,
    hasStartedSession ? 'active' : hasConfiguredParticipants ? 'configured' : 'planned',
    now,
  );

  return { state: nextState, results };
}

export async function wakeChannelEntryParticipant(
  state: ChatState,
  channelId: string,
  runtimeClient: RuntimeClient,
  now: Date = new Date(),
  options: RuntimeSessionRoutingOptions = {},
): Promise<{
  state: ChatState;
  result: ChannelActivationResult | null;
}> {
  let nextState = state;
  const roomRouting = resolveRoomRoutingState(requireChannel(nextState, channelId).roomRouting);
  const defaultTarget = resolveRoomDefaultRoutingTarget(nextState, channelId);

  if (!defaultTarget.target) {
    if (defaultTarget.participant) {
      createRecordedWakeRequest(
        roomRouting,
        defaultTarget.participant,
        'room_entry',
        'room_entry',
        null,
        now.toISOString(),
        'failed',
        defaultTarget.note ?? `No ${ORCHESTRATOR_NAME} room entry participant could be woken.`,
      );
      nextState = setChannelRoomRouting(nextState, channelId, roomRouting, now);
    }
    return {
      state: nextState,
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

  const target = defaultTarget.target;
  const existingAttachment = resolveTargetLeaseAttachment(
    nextState,
    channelId,
    target,
    {
      preferredLaneId: target.laneId?.trim() || null,
    },
  );
  if (existingAttachment.sessionId) {
    nextState = ensureChannelMarkedActive(nextState, channelId, now);
    return {
      state: nextState,
      result: {
        targetKind: target.participantKind,
        targetId: target.participantId,
        targetName: target.participantName,
        laneId: existingAttachment.laneId,
        status: 'already_started',
        sessionId: existingAttachment.sessionId,
      },
    };
  }

  const ensured = await ensureTargetSession(
    nextState,
    channelId,
    target,
    runtimeClient,
    now,
    {
      companionStore: options.companionStore,
      memoryService: options.memoryService,
      forceReviveClosedSessions: options.forceReviveClosedSessions,
      roomRouting,
      wakeTrigger: 'room_entry',
      wakeReason: 'room_entry',
    },
  );
  nextState = ensured.state;
  nextState = setChannelRoomRouting(nextState, channelId, roomRouting, now);

  if (ensured.error) {
    return {
      state: nextState,
      result: buildChannelActivationResult({
        target,
        ensured,
      }),
    };
  }

  nextState = ensureChannelMarkedActive(nextState, channelId, now);
  return {
    state: nextState,
    result: buildChannelActivationResult({
      target,
      ensured,
    }),
  };
}
