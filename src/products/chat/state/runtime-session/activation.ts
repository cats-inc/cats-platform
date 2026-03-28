import type {
  ChannelActivationResult,
  ChatState,
} from '../../api/contracts.js';
import type { RuntimeClient } from '../../../../platform/runtime/client.js';
import { isDirectLaneChannel } from '../../shared/channelTopology.js';
import { buildChannelView, requireChannel, setChannelStatus } from '../model/index.js';
import { resolveRoomRoutingState } from '../room-routing/index.js';
import { buildCatTarget, buildOrchestratorTarget } from '../runtimeTargeting.js';
import { ensureTargetSession } from './wake.js';
import {
  activeAssignedCats,
  type RuntimeSessionRoutingOptions,
} from './shared.js';

function toActivationResult(input: {
  target: {
    participantKind: 'orchestrator' | 'cat';
    participantId: string;
    participantName: string;
    sessionId: string | null;
  };
  ensured: Awaited<ReturnType<typeof ensureTargetSession>>;
}): ChannelActivationResult {
  const { ensured, target } = input;
  if (ensured.error) {
    return {
      targetKind: target.participantKind,
      targetId: target.participantId,
      targetName: target.participantName,
      status: 'error',
      sessionId: null,
      error: ensured.error,
    };
  }

  return {
    targetKind: target.participantKind,
    targetId: target.participantId,
    targetName: target.participantName,
    status:
      target.sessionId && target.sessionId === ensured.target.sessionId
        ? 'already_started'
        : 'started',
    sessionId: ensured.target.sessionId,
  };
}

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
    ? activeAssignedCats(initialChannel)
        .filter((cat) => cat.catId === roomRouting.leadParticipantId)
        .map((cat) => buildCatTarget(cat))
    : [
        buildOrchestratorTarget(nextState, initialChannel),
        ...activeAssignedCats(initialChannel).map((cat) => buildCatTarget(cat)),
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
    results.push(toActivationResult({
      target,
      ensured,
    }));
  }

  const channelState = requireChannel(nextState, channelId);
  const hasStartedSession = results.some(
    (result) => result.status === 'started' || result.status === 'already_started',
  );
  nextState = setChannelStatus(
    nextState,
    channelId,
    hasStartedSession ? 'active' : channelState.catAssignments.length > 0 ? 'configured' : 'planned',
    now,
  );

  return { state: nextState, results };
}
