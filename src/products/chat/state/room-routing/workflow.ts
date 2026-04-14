import { randomUUID } from 'node:crypto';

import type {
  ChatChannelView,
  ChatMessage,
} from '../../api/contracts.js';
import type {
  RoomRoutingCheckpoint,
  RoomRoutingGuardReason,
  RoomRoutingOutcome,
  RoomRoutingParticipantRef,
  RoomWorkflowEvent,
  RoomWorkflowEventKind,
  RoomWorkflowShape,
  RoomWorkflowState,
  RoomWorkflowStatus,
  RoomWorkflowTargetState,
  RoomWorkflowTurn,
} from '../../../../shared/roomRouting.js';
import type { RoutingTarget } from '../mentionRouter.js';
import {
  DEFAULT_WORKFLOW_EVENT_HISTORY_LIMIT,
  DEFAULT_WORKFLOW_TURN_HISTORY_LIMIT,
  resolveRoomRoutingState,
} from './index.js';
import type {
  DispatchRequest,
  TargetResolution,
} from './runtime.js';

function toParticipantRef(target: RoutingTarget): RoomRoutingParticipantRef {
  return {
    participantKind: target.participantKind,
    participantId: target.participantId,
    participantName: target.participantName,
  };
}

export function createRoutingOutcome(
  channel: ChatChannelView,
  sourceMessage: ChatMessage,
  resolution: TargetResolution,
  nowIso: string,
): RoomRoutingOutcome {
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  return {
    turnId: randomUUID(),
    mode: roomRouting.mode,
    sourceMessageId: sourceMessage.id,
    sourceSenderKind: sourceMessage.senderKind,
    sourceSenderName: sourceMessage.senderName,
    status: 'running',
    resolution: structuredClone(resolution.resolution),
    resolvedTargets: resolution.targets.map((target) => toParticipantRef(target)),
    unresolvedMentions: structuredClone(resolution.unresolved),
    dispatches: [],
    checkpoints: [],
    continuationCount: 0,
    totalDispatchCount: 0,
    guard: null,
    startedAt: nowIso,
    completedAt: null,
  };
}

export function addCheckpoint(
  outcome: RoomRoutingOutcome,
  kind: RoomRoutingCheckpoint['kind'],
  message: string,
  nowIso: string,
  actor: RoomRoutingParticipantRef | null,
  targets: RoomRoutingParticipantRef[] = [],
): RoomRoutingCheckpoint {
  const checkpoint: RoomRoutingCheckpoint = {
    id: randomUUID(),
    kind,
    message,
    actor,
    sourceMessageId: actor ? outcome.sourceMessageId : null,
    targets,
    createdAt: nowIso,
  };
  outcome.checkpoints.push(checkpoint);
  return checkpoint;
}

export function createWorkflowTurn(
  sourceMessage: ChatMessage,
  nowIso: string,
  stageId: string,
  workflowShape: RoomWorkflowShape,
): RoomWorkflowTurn {
  return {
    id: randomUUID(),
    status: 'running',
    sourceMessageId: sourceMessage.id,
    sourceSenderKind: sourceMessage.senderKind,
    sourceSenderName: sourceMessage.senderName,
    guard: null,
    stageId,
    workflowShape,
    reviewRequired: false,
    lastCheckpointId: null,
    convergeTargetId: null,
    continuationCount: 0,
    dispatchCount: 0,
    targetStatuses: [],
    events: [],
    startedAt: nowIso,
    updatedAt: nowIso,
    completedAt: null,
  };
}

export function createWorkflowEvent(
  turnId: string,
  kind: RoomWorkflowEventKind,
  status: RoomWorkflowStatus,
  message: string,
  nowIso: string,
  actor: RoomRoutingParticipantRef | null,
  sourceMessageId: string | null,
  targets: RoomRoutingParticipantRef[],
  options: {
    dispatchId?: string | null;
    checkpointId?: string | null;
    outcomeId?: string | null;
    metadata?: Record<string, unknown>;
  } = {},
): RoomWorkflowEvent {
  return {
    id: randomUUID(),
    turnId,
    kind,
    status,
    message,
    actor,
    sourceMessageId,
    targets,
    dispatchId: options.dispatchId ?? null,
    checkpointId: options.checkpointId ?? null,
    outcomeId: options.outcomeId ?? null,
    createdAt: nowIso,
    metadata: options.metadata ? structuredClone(options.metadata) : {},
  };
}

function pruneWorkflowHistory(workflow: RoomWorkflowState): void {
  workflow.turnHistory = workflow.turnHistory.slice(0, DEFAULT_WORKFLOW_TURN_HISTORY_LIMIT);
  workflow.eventHistory = workflow.eventHistory.slice(0, DEFAULT_WORKFLOW_EVENT_HISTORY_LIMIT);
}

export function appendWorkflowEvent(
  workflow: RoomWorkflowState,
  turn: RoomWorkflowTurn,
  event: RoomWorkflowEvent,
): void {
  turn.events.push(event);
  turn.updatedAt = event.createdAt;
  workflow.eventHistory.unshift(structuredClone(event));

  if (event.kind === 'checkpoint' || event.kind === 'guard_blocked') {
    workflow.lastCheckpointEvent = structuredClone(event);
  }
  if (event.kind === 'outcome') {
    workflow.lastOutcomeEvent = structuredClone(event);
  }

  pruneWorkflowHistory(workflow);
}

export function queueWorkflowTarget(
  turn: RoomWorkflowTurn,
  request: DispatchRequest,
  nowIso: string,
): RoomWorkflowTargetState {
  const existingTargetStatus = turn.targetStatuses.find((target) => target.id === request.targetStateId);
  if (existingTargetStatus) {
    existingTargetStatus.dispatchId = request.dispatchId;
    existingTargetStatus.participant = toParticipantRef(request.target);
    existingTargetStatus.source = request.sourceParticipant;
    existingTargetStatus.sourceMessageId = request.sourceMessage.id;
    existingTargetStatus.trigger = request.trigger;
    existingTargetStatus.mentionNames = structuredClone(request.mentionNames);
    existingTargetStatus.depth = request.depth;
    existingTargetStatus.parentCheckpointId = request.parentCheckpointId;
    existingTargetStatus.branchStrategy = request.branchStrategy;
    existingTargetStatus.handoffReason = request.handoffReason;
    existingTargetStatus.wakeRequestId = null;
    existingTargetStatus.status = 'pending';
    existingTargetStatus.error = null;
    turn.updatedAt = nowIso;
    return existingTargetStatus;
  }

  const targetStatus: RoomWorkflowTargetState = {
    id: request.targetStateId,
    dispatchId: request.dispatchId,
    participant: toParticipantRef(request.target),
    source: request.sourceParticipant,
    sourceMessageId: request.sourceMessage.id,
    trigger: request.trigger,
    mentionNames: structuredClone(request.mentionNames),
    depth: request.depth,
    parentCheckpointId: request.parentCheckpointId,
    branchStrategy: request.branchStrategy,
    handoffReason: request.handoffReason,
    wakeRequestId: null,
    status: 'pending',
    queuedAt: nowIso,
    startedAt: null,
    completedAt: null,
    response: null,
    error: null,
  };
  turn.targetStatuses.push(targetStatus);
  turn.updatedAt = nowIso;
  return targetStatus;
}

export function updateWorkflowTarget(
  turn: RoomWorkflowTurn,
  targetStateId: string,
  nowIso: string,
  update: Partial<RoomWorkflowTargetState>,
): RoomWorkflowTargetState | null {
  const targetStatus = turn.targetStatuses.find((target) => target.id === targetStateId);
  if (!targetStatus) {
    return null;
  }

  if (update.dispatchId !== undefined) {
    targetStatus.dispatchId = update.dispatchId;
  }
  if (update.participant !== undefined) {
    targetStatus.participant = update.participant;
  }
  if (update.source !== undefined) {
    targetStatus.source = update.source;
  }
  if (update.sourceMessageId !== undefined) {
    targetStatus.sourceMessageId = update.sourceMessageId;
  }
  if (update.trigger !== undefined) {
    targetStatus.trigger = update.trigger;
  }
  if (update.mentionNames !== undefined) {
    targetStatus.mentionNames = update.mentionNames;
  }
  if (update.depth !== undefined) {
    targetStatus.depth = update.depth;
  }
  if (update.parentCheckpointId !== undefined) {
    targetStatus.parentCheckpointId = update.parentCheckpointId;
  }
  if (update.branchStrategy !== undefined) {
    targetStatus.branchStrategy = update.branchStrategy;
  }
  if (update.handoffReason !== undefined) {
    targetStatus.handoffReason = update.handoffReason;
  }
  if (update.wakeRequestId !== undefined) {
    targetStatus.wakeRequestId = update.wakeRequestId;
  }
  if (update.status !== undefined) {
    targetStatus.status = update.status;
  }
  if (update.queuedAt !== undefined) {
    targetStatus.queuedAt = update.queuedAt;
  }
  if (update.startedAt !== undefined) {
    targetStatus.startedAt = update.startedAt;
  }
  if (update.completedAt !== undefined) {
    targetStatus.completedAt = update.completedAt;
  }
  if (update.response !== undefined) {
    targetStatus.response = update.response;
  }
  if (update.error !== undefined) {
    targetStatus.error = update.error;
  }
  turn.updatedAt = nowIso;
  return targetStatus;
}

export function createPendingDispatch(
  outcome: RoomRoutingOutcome,
  request: DispatchRequest,
  nowIso: string,
): void {
  outcome.dispatches.push({
    id: request.dispatchId,
    sourceMessageId: request.sourceMessage.id,
    source: request.sourceParticipant,
    target: toParticipantRef(request.target),
    trigger: request.trigger,
    status: 'pending',
    mentionNames: structuredClone(request.mentionNames),
    response: null,
    startedAt: nowIso,
    completedAt: null,
    error: null,
  });
}

export function updateDispatch(
  outcome: RoomRoutingOutcome,
  dispatchId: string,
  update: Partial<RoomRoutingOutcome['dispatches'][number]>,
): void {
  const dispatch = outcome.dispatches.find((candidate) => candidate.id === dispatchId);
  if (!dispatch) {
    return;
  }

  if (update.sourceMessageId !== undefined) {
    dispatch.sourceMessageId = update.sourceMessageId;
  }
  if (update.source !== undefined) {
    dispatch.source = update.source;
  }
  if (update.target !== undefined) {
    dispatch.target = update.target;
  }
  if (update.trigger !== undefined) {
    dispatch.trigger = update.trigger;
  }
  if (update.status !== undefined) {
    dispatch.status = update.status;
  }
  if (update.mentionNames !== undefined) {
    dispatch.mentionNames = update.mentionNames;
  }
  if (update.response !== undefined) {
    dispatch.response = update.response;
  }
  if (update.startedAt !== undefined) {
    dispatch.startedAt = update.startedAt;
  }
  if (update.completedAt !== undefined) {
    dispatch.completedAt = update.completedAt;
  }
  if (update.error !== undefined) {
    dispatch.error = update.error;
  }
}

function workflowEventKindForCheckpoint(
  kind: RoomRoutingCheckpoint['kind'],
): RoomWorkflowEventKind {
  return kind === 'loop_guard' || kind === 'anti_ping_pong'
    ? 'guard_blocked'
    : 'checkpoint';
}

function workflowStatusForCheckpoint(
  kind: RoomRoutingCheckpoint['kind'],
): RoomWorkflowStatus {
  switch (kind) {
    case 'completed':
      return 'completed';
    case 'loop_guard':
    case 'anti_ping_pong':
    case 'no_targets':
      return 'blocked';
    case 'runtime_error':
      return 'failed';
    default:
      return 'running';
  }
}

export function addWorkflowCheckpoint(
  outcome: RoomRoutingOutcome,
  workflow: RoomWorkflowState,
  turn: RoomWorkflowTurn,
  kind: RoomRoutingCheckpoint['kind'],
  message: string,
  nowIso: string,
  actor: RoomRoutingParticipantRef | null,
  targets: RoomRoutingParticipantRef[] = [],
  metadata: Record<string, unknown> = {},
): RoomRoutingCheckpoint {
  const checkpoint = addCheckpoint(outcome, kind, message, nowIso, actor, targets);
  appendWorkflowEvent(
    workflow,
    turn,
    createWorkflowEvent(
      turn.id,
      workflowEventKindForCheckpoint(kind),
      workflowStatusForCheckpoint(kind),
      message,
      nowIso,
      actor,
      checkpoint.sourceMessageId,
      targets,
      {
        checkpointId: checkpoint.id,
        metadata: {
          checkpointKind: kind,
          workflowStageId: turn.stageId,
          workflowShape: turn.workflowShape,
          ...metadata,
        },
      },
    ),
  );
  turn.lastCheckpointId = checkpoint.id;
  return checkpoint;
}

export function finalizeWorkflowTurn(
  workflow: RoomWorkflowState,
  turn: RoomWorkflowTurn,
): void {
  workflow.activeTurn = null;
  workflow.turnHistory.unshift(structuredClone(turn));
  pruneWorkflowHistory(workflow);
}

export function deriveTerminalTurnStatuses(
  outcome: RoomRoutingOutcome,
  guardReason: RoomRoutingGuardReason,
): {
  outcomeStatus: RoomRoutingOutcome['status'];
  workflowStatus: RoomWorkflowStatus;
} {
  if (guardReason) {
    return {
      outcomeStatus: 'blocked',
      workflowStatus: 'blocked',
    };
  }

  if (outcome.dispatches.some((dispatch) => dispatch.status === 'completed')) {
    return {
      outcomeStatus: 'completed',
      workflowStatus: 'completed',
    };
  }

  return {
    outcomeStatus: 'error',
    workflowStatus: 'failed',
  };
}
