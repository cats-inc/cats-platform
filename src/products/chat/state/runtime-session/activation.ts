import type {
  ChannelActivationResult,
  ChatState,
} from '../../api/contracts.js';
import type { RuntimeClient } from '../../../../platform/runtime/client.js';
import { isDirectLaneChannel } from '../../shared/channelTopology.js';
import { resolveChannelParticipantAssignments } from '../../shared/channelParticipants.js';
import { buildChannelView, requireChannel, setChannelStatus } from '../model/index.js';
import { resolveRoomRoutingState } from '../room-routing/index.js';
import { buildCatTarget, buildOrchestratorTarget } from '../runtimeTargeting.js';
import { ensureTargetSession } from './wake.js';
import {
  activeAssignedParticipants,
  buildChannelActivationResult,
  type RuntimeSessionRoutingOptions,
} from './shared.js';

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
