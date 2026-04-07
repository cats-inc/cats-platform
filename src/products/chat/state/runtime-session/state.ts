import type {
  ChatChannelCat,
  ChatChannelState,
  ChatState,
} from '../../api/contracts.js';
import type {
  ParticipantSessionStatus,
  RoomRoutingCheckpoint,
  RoomRoutingOutcome,
  RoomRoutingParticipantRef,
  RoomWorkflowState,
} from '../../../../shared/roomRouting.js';
import {
  createCatActorId,
  GLOBAL_ORCHESTRATOR_ACTOR_ID,
} from '../../../../core/actors.js';
import {
  requireChannel,
  setChannelParticipantLease,
  setChannelOrchestratorLease,
  setChannelRoomRouting,
  setChannelStatus,
} from '../model/index.js';
import type { RoutingTarget } from '../mentionRouter.js';
import { resolveRoomRoutingState } from '../room-routing/index.js';
import { createRoomRoutingSnapshot } from '../room-routing/wake.js';
import type { RuntimeSessionInfo } from '../../../../platform/runtime/client.js';
import { resolveChannelSpawnCwd } from '../workspace.js';

export function normalizeRuntimeStatus(status: string | undefined): ParticipantSessionStatus {
  switch (status) {
    case 'ready':
      return 'ready';
    case 'closed':
      return 'closed';
    case 'error':
      return 'error';
    default:
      return 'initializing';
  }
}

export function spawnCwdFor(channel: ChatChannelState): string | null {
  return resolveChannelSpawnCwd(channel.repoPath, channel.chatCwd);
}

export function participantKey(participant: RoomRoutingParticipantRef | RoutingTarget): string {
  return `${participant.participantKind}:${participant.participantId}`;
}

export function toParticipantRef(target: RoutingTarget): RoomRoutingParticipantRef {
  return {
    participantKind: target.participantKind,
    participantId: target.participantId,
    participantName: target.participantName,
  };
}

export function resolveActorIdForTarget(target: RoutingTarget): string {
  return target.participantKind === 'orchestrator'
    ? GLOBAL_ORCHESTRATOR_ACTOR_ID
    : createCatActorId(target.participantId);
}

export function setStartedSession(
  state: ChatState,
  channelId: string,
  target: 'orchestrator' | { participantId: string },
  session: RuntimeSessionInfo,
  now: Date,
): ChatState {
  const timestamp = now.toISOString();
  if (typeof target !== 'string') {
    return setChannelParticipantLease(
      state,
      channelId,
      target.participantId,
      {
        sessionId: session.id,
        status: normalizeRuntimeStatus(session.status),
        cwd: session.cwd,
        lastError: null,
        provider: session.provider,
        model: session.model,
        startedAt: timestamp,
        lastUsedAt: timestamp,
      },
      now,
    );
  }

  return setChannelOrchestratorLease(
    state,
    channelId,
    {
      sessionId: session.id,
      status: normalizeRuntimeStatus(session.status),
      cwd: session.cwd,
      lastError: null,
      provider: session.provider,
      model: session.model,
      startedAt: timestamp,
      lastUsedAt: timestamp,
    },
    now,
  );
}

export function setErroredSession(
  state: ChatState,
  channelId: string,
  target: 'orchestrator' | { participantId: string },
  message: string,
  now: Date,
): ChatState {
  if (typeof target !== 'string') {
    return setChannelParticipantLease(
      state,
      channelId,
      target.participantId,
      {
        status: 'error',
        lastError: message,
      },
      now,
    );
  }

  return setChannelOrchestratorLease(
    state,
    channelId,
    {
      status: 'error',
      lastError: message,
    },
    now,
  );
}

export function markTargetWaking(
  state: ChatState,
  channelId: string,
  target: RoutingTarget,
  now: Date,
): ChatState {
  if (target.participantKind === 'cat') {
    return setChannelParticipantLease(
      state,
      channelId,
      target.participantId,
      { status: 'initializing', lastError: null },
      now,
    );
  }

  return setChannelOrchestratorLease(
    state,
    channelId,
    { status: 'initializing', lastError: null },
    now,
  );
}

export function ensureChannelMarkedActive(
  state: ChatState,
  channelId: string,
  now: Date,
): ChatState {
  const channel = requireChannel(state, channelId);
  return channel.status === 'active'
    ? state
    : setChannelStatus(state, channelId, 'active', now);
}

export function setReadyAfterMessage(
  state: ChatState,
  channelId: string,
  target: 'orchestrator' | { participantId: string },
  now: Date,
): ChatState {
  if (typeof target !== 'string') {
    return setChannelParticipantLease(
      state,
      channelId,
      target.participantId,
      { status: 'ready', lastUsedAt: now.toISOString() },
      now,
    );
  }

  return setChannelOrchestratorLease(
    state,
    channelId,
    { status: 'ready', lastUsedAt: now.toISOString() },
    now,
  );
}

export function clearTargetSessionLease(
  state: ChatState,
  channelId: string,
  target: 'orchestrator' | { participantId: string },
  now: Date,
): ChatState {
  const clearedLease = {
    sessionId: null,
    cwd: null,
    status: 'not_started' as const,
    lastError: null,
    startedAt: null,
  };

  if (typeof target !== 'string') {
    return setChannelParticipantLease(
      state,
      channelId,
      target.participantId,
      clearedLease,
      now,
    );
  }

  return setChannelOrchestratorLease(
    state,
    channelId,
    clearedLease,
    now,
  );
}

export function applyRoomRoutingSnapshot(
  state: ChatState,
  channelId: string,
  baseRoomRouting: ReturnType<typeof resolveRoomRoutingState>,
  workflow: RoomWorkflowState,
  outcome: RoomRoutingOutcome | null,
  checkpoint: RoomRoutingCheckpoint | null,
  now: Date,
): ChatState {
  return setChannelRoomRouting(
    state,
    channelId,
    createRoomRoutingSnapshot(baseRoomRouting, workflow, outcome, checkpoint),
    now,
  );
}
