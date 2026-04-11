import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';

import type {
  ChatChannelState,
  ChatMessage,
  ChatState,
} from '../../api/contracts.js';
import type {
  RoomRouteDefaultTargetReason,
  RoomRoutingDispatch,
  RoomRoutingOutcome,
  RoomRoutingParticipantRef,
  RoomWorkflowTargetState,
  RoomWorkflowTurn,
} from '../../../../shared/roomRouting.js';
import { resolveVisibleOrchestratorLabel } from '../../../../shared/orchestratorLabel.js';
import { ORCHESTRATOR_NAME, requireChannel } from '../model/index.js';
import {
  appendWorkflowEvent,
  createWorkflowEvent,
} from '../room-routing/workflow.js';
import {
  resolveRoomRoutingState,
  resolveRoomWorkflowState,
} from '../room-routing/index.js';
import { finalizeDispatchTurn } from './finalize.js';
import { formatSessionStartedMessage } from '../runtimeMessages.js';

function describeGuardReason(): string {
  return 'a routing guard';
}

function readRuntimeResponseForTurn(
  channel: ChatChannelState,
  turnId: string,
): ChatMessage | null {
  for (let index = channel.messages.length - 1; index >= 0; index -= 1) {
    const message = channel.messages[index]!;
    if (
      (message.senderKind === 'agent' || message.senderKind === 'orchestrator')
      && message.metadata?.event === 'runtime_response'
      && message.metadata.turnId === turnId
    ) {
      return message;
    }
  }

  return null;
}

function buildParticipantRefFromResponse(
  message: ChatMessage,
): RoomRoutingParticipantRef | null {
  const targetKind = message.metadata?.targetKind;
  const targetId = typeof message.metadata?.targetId === 'string'
    ? message.metadata.targetId.trim()
    : '';

  if (targetKind === 'orchestrator') {
    return {
      participantKind: 'orchestrator',
      participantId: targetId || 'orchestrator',
      participantName: message.senderName,
    };
  }

  if (targetKind === 'cat' && targetId) {
    return {
      participantKind: 'cat',
      participantId: targetId,
      participantName: message.senderName,
    };
  }

  if (message.senderKind === 'orchestrator') {
    return {
      participantKind: 'orchestrator',
      participantId: 'orchestrator',
      participantName: message.senderName,
    };
  }

  return targetId
    ? {
        participantKind: 'cat',
        participantId: targetId,
        participantName: message.senderName,
      }
    : null;
}

function resolveDefaultTargetReason(
  channel: ChatChannelState,
  participant: RoomRoutingParticipantRef | null,
): RoomRouteDefaultTargetReason | null {
  if (!participant) {
    return null;
  }

  if (participant.participantKind === 'orchestrator') {
    return 'boss_chat_default';
  }

  return channel.roomRouting?.mode === 'direct_cat_chat'
    ? 'direct_chat_recipient'
    : 'boss_chat_default';
}

function createFallbackOutcome(
  channel: ChatChannelState,
  turn: RoomWorkflowTurn,
  participant: RoomRoutingParticipantRef | null,
): RoomRoutingOutcome {
  return {
    turnId: turn.id,
    mode: channel.roomRouting?.mode ?? 'boss_chat',
    sourceMessageId: turn.sourceMessageId,
    sourceSenderKind: turn.sourceSenderKind,
    sourceSenderName: turn.sourceSenderName,
    status: 'running',
    resolution: {
      routingMode: 'room_default',
      selectionKind: participant ? 'default_target' : 'blocked',
      defaultTarget: participant ? structuredClone(participant) : null,
      defaultTargetReason: resolveDefaultTargetReason(channel, participant),
      fallbackTarget: null,
      blockedReason: null,
      note: null,
    },
    resolvedTargets: participant ? [structuredClone(participant)] : [],
    unresolvedMentions: [],
    dispatches: [],
    checkpoints: [],
    continuationCount: turn.continuationCount,
    totalDispatchCount: turn.dispatchCount,
    guard: null,
    startedAt: turn.startedAt,
    completedAt: null,
  };
}

function ensureCompletedTargetStatus(
  turn: RoomWorkflowTurn,
  participant: RoomRoutingParticipantRef | null,
  responseMessage: ChatMessage,
): RoomWorkflowTargetState | null {
  if (!participant) {
    return null;
  }

  const completedAt = responseMessage.createdAt;
  const existing = turn.targetStatuses.find((target) =>
    target.responseMessageId === responseMessage.id)
    ?? turn.targetStatuses.find((target) =>
      target.participant.participantKind === participant.participantKind
      && target.participant.participantId === participant.participantId)
    ?? turn.targetStatuses.find((target) =>
      target.status === 'running' || target.status === 'pending');

  if (existing) {
    existing.participant = structuredClone(participant);
    existing.status = 'completed';
    existing.completedAt = existing.completedAt ?? completedAt;
    existing.responseMessageId = responseMessage.id;
    existing.error = null;
    existing.dispatchId = existing.dispatchId ?? randomUUID();
    existing.trigger = existing.trigger ?? 'room_default';
    existing.handoffReason = existing.handoffReason ?? 'room_default';
    existing.branchStrategy = existing.branchStrategy ?? 'fresh_no_parent';
    existing.startedAt = existing.startedAt ?? existing.queuedAt;
    return existing;
  }

  const targetStatus: RoomWorkflowTargetState = {
    id: randomUUID(),
    dispatchId: randomUUID(),
    participant: structuredClone(participant),
    source: null,
    sourceMessageId: turn.sourceMessageId,
    trigger: 'room_default',
    mentionNames: [],
    depth: 0,
    parentCheckpointId: turn.lastCheckpointId,
    branchStrategy: 'fresh_no_parent',
    handoffReason: 'room_default',
    wakeRequestId: null,
    status: 'completed',
    queuedAt: turn.startedAt,
    startedAt: turn.startedAt,
    completedAt,
    responseMessageId: responseMessage.id,
    error: null,
  };
  turn.targetStatuses.push(targetStatus);
  return targetStatus;
}

function ensureCompletedDispatch(
  outcome: RoomRoutingOutcome,
  participant: RoomRoutingParticipantRef | null,
  responseMessage: ChatMessage,
  targetStatus: RoomWorkflowTargetState | null,
): RoomRoutingDispatch | null {
  if (!participant) {
    return null;
  }

  const completedAt = responseMessage.createdAt;
  const existing = outcome.dispatches.find((dispatch) =>
    dispatch.responseMessageId === responseMessage.id)
    ?? outcome.dispatches.find((dispatch) =>
      dispatch.target.participantKind === participant.participantKind
      && dispatch.target.participantId === participant.participantId)
    ?? outcome.dispatches.find((dispatch) =>
      dispatch.status === 'running' || dispatch.status === 'pending');

  if (existing) {
    existing.target = structuredClone(participant);
    existing.status = 'completed';
    existing.completedAt = existing.completedAt ?? completedAt;
    existing.responseMessageId = responseMessage.id;
    existing.error = null;
    existing.trigger = existing.trigger ?? 'room_default';
    return existing;
  }

  const dispatch: RoomRoutingDispatch = {
    id: targetStatus?.dispatchId ?? randomUUID(),
    sourceMessageId: outcome.sourceMessageId,
    source: null,
    target: structuredClone(participant),
    trigger: targetStatus?.trigger ?? 'room_default',
    status: 'completed',
    mentionNames: [],
    responseMessageId: responseMessage.id,
    startedAt: targetStatus?.startedAt ?? outcome.startedAt,
    completedAt,
    error: null,
  };
  outcome.dispatches.push(dispatch);
  return dispatch;
}

function ensureResolvedTarget(
  outcome: RoomRoutingOutcome,
  participant: RoomRoutingParticipantRef | null,
): void {
  if (!participant) {
    return;
  }

  if (!outcome.resolvedTargets.some((target) =>
    target.participantKind === participant.participantKind
    && target.participantId === participant.participantId)) {
    outcome.resolvedTargets.push(structuredClone(participant));
  }

  if (!outcome.resolution.defaultTarget) {
    outcome.resolution.defaultTarget = structuredClone(participant);
    outcome.resolution.defaultTargetReason = outcome.resolution.defaultTargetReason ?? 'boss_chat_default';
  }
  if (outcome.resolution.selectionKind === 'blocked') {
    outcome.resolution.selectionKind = 'default_target';
    outcome.resolution.blockedReason = null;
    outcome.resolution.note = null;
  }
}

function appendRecoveredTargetCompletedEvent(
  turn: RoomWorkflowTurn,
  dispatch: RoomRoutingDispatch | null,
  participant: RoomRoutingParticipantRef | null,
  responseMessage: ChatMessage,
  workflow: ReturnType<typeof resolveRoomWorkflowState>,
): void {
  if (!dispatch || !participant) {
    return;
  }

  if (turn.events.some((event) =>
    event.kind === 'target_completed'
    && event.metadata?.responseMessageId === responseMessage.id)) {
    return;
  }

  appendWorkflowEvent(
    workflow,
    turn,
    createWorkflowEvent(
      turn.id,
      'target_completed',
      'completed',
      `${participant.participantName} completed this room dispatch.`,
      responseMessage.createdAt,
      null,
      turn.sourceMessageId,
      [structuredClone(participant)],
      {
        dispatchId: dispatch.id,
        metadata: {
          responseMessageId: responseMessage.id,
          recoveryPhase: 'orphaned_completed_turn_repair',
        },
      },
    ),
  );
}

function isStartupRecoveredBlockedTurn(turn: RoomWorkflowTurn): boolean {
  return turn.status === 'blocked'
    && turn.stageId === 'startup_recovery'
    && turn.events.some((event) => event.metadata?.recoverySource === 'server_restart');
}

function readStartupRecoveryInterruptMessage(turn: RoomWorkflowTurn): string {
  const targetError = turn.targetStatuses.find((target) =>
    typeof target.error === 'string' && target.error.trim().length > 0)?.error?.trim();
  if (targetError) {
    return `Previous room turn was interrupted because ${targetError.replace(/\.$/u, '')}.`;
  }

  const eventError = turn.events.find((event) =>
    typeof event.metadata?.interruptedError === 'string'
    && event.metadata.interruptedError.trim().length > 0)?.metadata?.interruptedError;
  if (typeof eventError === 'string' && eventError.trim().length > 0) {
    return `Previous room turn was interrupted because ${eventError.trim().replace(/\.$/u, '')}.`;
  }

  return 'Previous room turn was interrupted because Cats server restarted before room workflow cleanup completed.';
}

function readMessageSessionId(message: ChatMessage): string | null {
  return typeof message.metadata?.sessionId === 'string' && message.metadata.sessionId.trim().length > 0
    ? message.metadata.sessionId.trim()
    : null;
}

function resolveMissingSessionParticipantName(
  channel: ChatChannelState,
  responseMessage: ChatMessage,
): string {
  const targetKind = responseMessage.metadata?.targetKind;
  const targetId = typeof responseMessage.metadata?.targetId === 'string'
    ? responseMessage.metadata.targetId.trim()
    : '';
  const executionLabelSnapshot = typeof responseMessage.metadata?.executionLabelSnapshot === 'string'
    && responseMessage.metadata.executionLabelSnapshot.trim().length > 0
    ? responseMessage.metadata.executionLabelSnapshot.trim()
    : null;

  if (targetKind === 'orchestrator') {
    return resolveVisibleOrchestratorLabel({
      displayName: responseMessage.senderName,
      executionLabel: executionLabelSnapshot,
      provider: responseMessage.executionProvider,
      instance: responseMessage.executionInstance,
    }) ?? ORCHESTRATOR_NAME;
  }

  if (targetId) {
    const assignment = (channel.participantAssignments ?? []).find((candidate) =>
      candidate.participantId === targetId)
      ?? channel.catAssignments.find((candidate) =>
        candidate.participantId === targetId || candidate.catId === targetId);
    if (assignment?.name?.trim()) {
      return assignment.name;
    }
  }

  return responseMessage.senderName;
}

function resolveMissingSessionCwd(
  channel: ChatChannelState,
  responseMessage: ChatMessage,
  runtimeDataDir?: string | null,
): string | null {
  const sessionId = readMessageSessionId(responseMessage);
  if (!sessionId) {
    return null;
  }

  const targetId = typeof responseMessage.metadata?.targetId === 'string'
    ? responseMessage.metadata.targetId.trim()
    : '';

  if (runtimeDataDir?.trim()) {
    const sessionPath = path.join(path.resolve(runtimeDataDir), 'sessions', sessionId);
    if (existsSync(sessionPath)) {
      return sessionPath;
    }
  }

  if (channel.orchestratorLease.sessionId === sessionId && channel.orchestratorLease.cwd) {
    return channel.orchestratorLease.cwd;
  }

  if (targetId) {
    const assignment = (channel.participantAssignments ?? []).find((candidate) =>
      candidate.participantId === targetId)
      ?? channel.catAssignments.find((candidate) =>
        candidate.participantId === targetId || candidate.catId === targetId);
    if (assignment?.execution.lease.sessionId === sessionId && assignment.execution.lease.cwd) {
      return assignment.execution.lease.cwd;
    }
  }

  return channel.chatCwd;
}

export function repairMissingSessionStartedMessages(
  state: ChatState,
  channelId: string,
  options: {
    runtimeDataDir?: string | null;
    now?: Date;
  } = {},
): {
  repaired: boolean;
  state: ChatState;
} {
  const channel = state.channels.find((candidate) => candidate.id === channelId);
  if (!channel) {
    return { repaired: false, state };
  }

  const existingSessionStartedIds = new Set(
    channel.messages
      .filter((message) => message.metadata?.event === 'session_started')
      .map((message) => readMessageSessionId(message))
      .filter((sessionId): sessionId is string => Boolean(sessionId)),
  );
  const missingResponses = channel.messages.filter((message) => {
    const sessionId = readMessageSessionId(message);
    return message.metadata?.event === 'runtime_response'
      && Boolean(sessionId)
      && !existingSessionStartedIds.has(sessionId!);
  });

  if (missingResponses.length === 0) {
    return { repaired: false, state };
  }

  const nextState = structuredClone(state);
  const nextChannel = requireChannel(nextState, channelId);
  const nowIso = (options.now ?? new Date()).toISOString();
  let repaired = false;

  for (const responseMessage of missingResponses) {
    const sessionId = readMessageSessionId(responseMessage);
    if (!sessionId || existingSessionStartedIds.has(sessionId)) {
      continue;
    }

    const responseIndex = nextChannel.messages.findIndex((candidate) =>
      candidate.id === responseMessage.id);
    if (responseIndex < 0) {
      continue;
    }

    const cwd = resolveMissingSessionCwd(nextChannel, responseMessage, options.runtimeDataDir);
    const participantName = resolveMissingSessionParticipantName(nextChannel, responseMessage);
    const targetKind = responseMessage.metadata?.targetKind === 'cat' ? 'cat' : 'orchestrator';
    const targetId = typeof responseMessage.metadata?.targetId === 'string'
      && responseMessage.metadata.targetId.trim().length > 0
      ? responseMessage.metadata.targetId.trim()
      : undefined;

    nextChannel.messages.splice(responseIndex, 0, {
      id: randomUUID(),
      channelId,
      senderKind: 'system',
      senderName: 'Runtime',
      body: formatSessionStartedMessage(participantName, { id: sessionId, cwd }),
      mentions: [],
      metadata: {
        event: 'session_started',
        targetKind,
        ...(targetId ? { targetId } : {}),
        sessionId,
        verbosity: 'verbose',
        repairSource: 'missing_session_started_message',
      },
      usage: null,
      executionProvider: null,
      executionModel: null,
      executionInstance: null,
      createdAt: responseMessage.createdAt,
    });
    existingSessionStartedIds.add(sessionId);
    if (!nextChannel.chatCwd && cwd) {
      nextChannel.chatCwd = cwd;
    }
    repaired = true;
  }

  if (repaired) {
    nextChannel.updatedAt = nowIso;
  }

  return repaired ? { repaired: true, state: nextState } : { repaired: false, state };
}

export function repairMissingStartupRecoveryNotice(
  state: ChatState,
  channelId: string,
  options: {
    now?: Date;
  } = {},
): {
  repaired: boolean;
  state: ChatState;
} {
  const channel = state.channels.find((candidate) => candidate.id === channelId);
  if (!channel?.roomRouting?.workflow?.turnHistory?.length) {
    return { repaired: false, state };
  }

  const blockedTurns = channel.roomRouting.workflow.turnHistory.filter(isStartupRecoveredBlockedTurn);
  if (blockedTurns.length === 0) {
    return { repaired: false, state };
  }

  const nextState = structuredClone(state);
  const nextChannel = requireChannel(nextState, channelId);
  const nowIso = (options.now ?? new Date()).toISOString();
  let repaired = false;

  for (const turn of nextChannel.roomRouting?.workflow?.turnHistory ?? []) {
    if (!isStartupRecoveredBlockedTurn(turn)) {
      continue;
    }

    const sourceMessageIndex = nextChannel.messages.findIndex((message) =>
      message.id === turn.sourceMessageId);
    if (sourceMessageIndex < 0) {
      continue;
    }

    const nextUserMessageIndex = nextChannel.messages.findIndex((message, index) =>
      index > sourceMessageIndex && message.senderKind === 'user');
    const noticeAlreadyExists = nextChannel.messages.some((message, index) =>
      index > sourceMessageIndex
      && (nextUserMessageIndex < 0 || index < nextUserMessageIndex)
      && message.metadata?.event === 'workflow_interrupted'
      && message.metadata?.turnId === turn.id);
    if (noticeAlreadyExists) {
      continue;
    }

    const createdAt = turn.completedAt ?? turn.updatedAt ?? turn.startedAt;
    const insertIndex = nextUserMessageIndex >= 0 ? nextUserMessageIndex : nextChannel.messages.length;
    nextChannel.messages.splice(insertIndex, 0, {
      id: randomUUID(),
      channelId,
      senderKind: 'system',
      senderName: 'Chat',
      body: readStartupRecoveryInterruptMessage(turn),
      mentions: [],
      metadata: {
        event: 'workflow_interrupted',
        blockedReason: 'startup_recovery',
        turnId: turn.id,
        repairSource: 'missing_startup_recovery_notice',
        recoverySource: 'server_restart',
      },
      usage: null,
      executionProvider: null,
      executionModel: null,
      executionInstance: null,
      createdAt,
    });
    repaired = true;
  }

  if (repaired) {
    nextChannel.updatedAt = nowIso;
  }

  return repaired ? { repaired: true, state: nextState } : { repaired: false, state };
}

export function repairOrphanedCompletedDispatchTurn(
  state: ChatState,
  channelId: string,
  now: Date = new Date(),
): {
  repaired: boolean;
  state: ChatState;
} {
  const channel = state.channels.find((candidate) => candidate.id === channelId);
  if (!channel) {
    return { repaired: false, state };
  }

  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  const workflow = resolveRoomWorkflowState(roomRouting.workflow);
  const activeTurn = workflow.activeTurn?.status === 'running'
    ? workflow.activeTurn
    : null;
  const recoveredTurn = !activeTurn
    && roomRouting.lastOutcome?.status === 'blocked'
    ? workflow.turnHistory.find((candidate) =>
      candidate.id === roomRouting.lastOutcome?.turnId
      && isStartupRecoveredBlockedTurn(candidate))
    : null;
  const repairTurnId = activeTurn?.id ?? recoveredTurn?.id ?? null;
  if (!repairTurnId) {
    return { repaired: false, state };
  }

  const responseMessage = readRuntimeResponseForTurn(channel, repairTurnId);
  if (!responseMessage) {
    return { repaired: false, state };
  }

  const participant = buildParticipantRefFromResponse(responseMessage);
  const nextState = structuredClone(state);
  const nextChannel = requireChannel(nextState, channelId);
  const nextRoomRouting = resolveRoomRoutingState(nextChannel.roomRouting);
  const nextWorkflow = resolveRoomWorkflowState(nextRoomRouting.workflow);
  let nextActiveTurn = nextWorkflow.activeTurn?.status === 'running'
    ? nextWorkflow.activeTurn
    : null;
  if (!nextActiveTurn) {
    const recoveredTurnIndex = nextWorkflow.turnHistory.findIndex((candidate) =>
      candidate.id === repairTurnId && isStartupRecoveredBlockedTurn(candidate));
    if (recoveredTurnIndex >= 0) {
      const [recoveredCandidate] = nextWorkflow.turnHistory.splice(recoveredTurnIndex, 1);
      nextWorkflow.activeTurn = recoveredCandidate ?? null;
      nextActiveTurn = recoveredCandidate ?? null;
    }
  }
  if (!nextActiveTurn) {
    return { repaired: false, state: nextState };
  }

  const targetStatus = ensureCompletedTargetStatus(
    nextActiveTurn,
    participant,
    responseMessage,
  );
  const outcome = nextRoomRouting.lastOutcome?.turnId === nextActiveTurn.id
    ? structuredClone(nextRoomRouting.lastOutcome)
    : createFallbackOutcome(nextChannel, nextActiveTurn, participant);
  const dispatch = ensureCompletedDispatch(
    outcome,
    participant,
    responseMessage,
    targetStatus,
  );
  ensureResolvedTarget(outcome, participant);
  outcome.totalDispatchCount = Math.max(
    outcome.totalDispatchCount,
    outcome.dispatches.filter((candidate) => candidate.status === 'completed').length,
    dispatch ? 1 : 0,
  );
  outcome.completedAt = null;
  appendRecoveredTargetCompletedEvent(
    nextActiveTurn,
    dispatch,
    participant,
    responseMessage,
    nextWorkflow,
  );

  return {
    repaired: true,
    state: finalizeDispatchTurn(nextState, channelId, now, {
      nowIso: now.toISOString(),
      baseRoomRouting: nextRoomRouting,
      workflow: nextWorkflow,
      activeTurn: nextActiveTurn,
      outcome,
      latestCheckpoint: nextRoomRouting.lastCheckpoint,
      guardReason: null,
      userMessageId: nextActiveTurn.sourceMessageId,
      describeGuardReason,
    }),
  };
}
