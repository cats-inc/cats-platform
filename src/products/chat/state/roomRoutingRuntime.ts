import { randomUUID } from 'node:crypto';

import type {
  ChatChannelView,
  ChatMessage,
  ChatState,
} from '../api/contracts.js';
import type {
  RoomRouteResolution,
  RoomRoutingCheckpoint,
  RoomRoutingGuardReason,
  RoomRoutingOutcome,
  RoomRoutingParticipantRef,
  RoomRoutingState,
  RoomRoutingTrigger,
  RoomWorkflowBranchStrategy,
  RoomWorkflowEvent,
  RoomWorkflowEventKind,
  RoomWorkflowHandoffReason,
  RoomWorkflowShape,
  RoomWorkflowState,
  RoomWorkflowStatus,
  RoomWorkflowTargetState,
  RoomWorkflowTurn,
  RoomWakeReason,
  RoomWakeRequest,
  RoomWakeTrigger,
} from '../../../shared/roomRouting.js';
import {
  resolveMentionRoute,
  type RoutingTarget,
} from './mentionRouter.js';
import {
  DEFAULT_WAKE_HISTORY_LIMIT,
  DEFAULT_WORKFLOW_EVENT_HISTORY_LIMIT,
  DEFAULT_WORKFLOW_TURN_HISTORY_LIMIT,
  resolveRoomRoutingState,
} from './roomRouting.js';

export interface TargetResolution {
  targets: RoutingTarget[];
  unresolved: string[];
  mentionNames: string[];
  trigger: RoomRoutingTrigger;
  resolution: RoomRouteResolution;
}

export interface DispatchFrame {
  sourceMessage: ChatMessage;
  sourceParticipant: RoomRoutingParticipantRef | null;
  targets: RoutingTarget[];
  unresolved: string[];
  mentionNames: string[];
  trigger: RoomRoutingTrigger;
  depth: number;
}

export interface DispatchRequest extends DispatchFrame {
  target: RoutingTarget;
  dispatchId: string;
  targetStateId: string;
  parentCheckpointId: string | null;
  branchStrategy: RoomWorkflowBranchStrategy | null;
  handoffReason: RoomWorkflowHandoffReason | null;
}

export function resolveTargets(
  state: ChatState,
  channelId: string,
  body: string,
  options: {
    allowDefaultTarget: boolean;
    explicitTrigger: RoomRoutingTrigger;
  },
): TargetResolution {
  const result = resolveMentionRoute(state, channelId, body, options);
  return {
    targets: result.targets,
    unresolved: result.unresolvedMentions,
    mentionNames: result.parsedMentionNames,
    trigger: result.trigger,
    resolution: structuredClone(result.resolution),
  };
}

export function mergeUnresolvedMentions(
  outcome: RoomRoutingOutcome,
  mentions: string[],
): void {
  for (const mention of mentions) {
    if (!outcome.unresolvedMentions.includes(mention)) {
      outcome.unresolvedMentions.push(mention);
    }
  }
}

export function workflowShapeForTargets(targetCount: number): RoomWorkflowShape {
  return targetCount > 1 ? 'parallel' : 'sequential';
}

export function workflowStageIdForTrigger(trigger: RoomRoutingTrigger): string {
  switch (trigger) {
    case 'explicit_mention':
      return 'explicit_dispatch';
    case 'continuation_mention':
      return 'continuation_handoff';
    case 'room_default':
    default:
      return 'default_dispatch';
  }
}

export function resolveWorkflowHandoffReason(
  trigger: RoomRoutingTrigger,
): RoomWorkflowHandoffReason {
  switch (trigger) {
    case 'explicit_mention':
      return 'explicit_mention';
    case 'continuation_mention':
      return 'workflow_continuation';
    case 'room_default':
    default:
      return 'room_default';
  }
}

export function resolveWorkflowBranchStrategy(
  sourceParticipant: RoomRoutingParticipantRef | null,
  target: RoutingTarget,
  depth: number,
): RoomWorkflowBranchStrategy {
  if (depth > 0 && sourceParticipant && sourceParticipant.participantId !== target.participantId) {
    return 'transplant_context';
  }

  return 'fresh_no_parent';
}

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
    responseMessageId: null,
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
  if (update.responseMessageId !== undefined) {
    targetStatus.responseMessageId = update.responseMessageId;
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
    responseMessageId: null,
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
  if (update.responseMessageId !== undefined) {
    dispatch.responseMessageId = update.responseMessageId;
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

export function createRoomRoutingSnapshot(
  baseRoomRouting: RoomRoutingState,
  workflow: RoomWorkflowState,
  outcome: RoomRoutingOutcome | null,
  checkpoint: RoomRoutingCheckpoint | null,
): RoomRoutingState {
  return {
    ...baseRoomRouting,
    lastOutcome: outcome ? structuredClone(outcome) : null,
    lastCheckpoint: checkpoint ? structuredClone(checkpoint) : null,
    workflow: structuredClone(workflow),
  };
}

export function resolveWakeReasonFromRoutingTrigger(
  trigger: RoomRoutingTrigger,
): RoomWakeReason {
  switch (trigger) {
    case 'explicit_mention':
      return 'explicit_mention';
    case 'continuation_mention':
      return 'workflow_continuation';
    case 'room_default':
    default:
      return 'room_default';
  }
}

function pruneWakeHistory(roomRouting: RoomRoutingState): void {
  roomRouting.wakeHistory = roomRouting.wakeHistory.slice(0, DEFAULT_WAKE_HISTORY_LIMIT);
}

function recordWakeRequest(
  roomRouting: RoomRoutingState,
  wakeRequest: RoomWakeRequest,
): void {
  roomRouting.lastWakeRequest = structuredClone(wakeRequest);
  roomRouting.wakeHistory.unshift(structuredClone(wakeRequest));
  pruneWakeHistory(roomRouting);
}

function createWakeRequest(
  participant: RoomRoutingParticipantRef,
  trigger: RoomWakeTrigger,
  reason: RoomWakeReason,
  sourceMessageId: string | null,
  nowIso: string,
  status: RoomWakeRequest['status'],
  error: string | null = null,
): RoomWakeRequest {
  return {
    id: randomUUID(),
    participant,
    trigger,
    reason,
    sourceMessageId,
    status,
    createdAt: nowIso,
    completedAt: status === 'skipped' ? null : nowIso,
    error,
  };
}

export function createRecordedWakeRequest(
  roomRouting: RoomRoutingState | null | undefined,
  participant: RoomRoutingParticipantRef,
  trigger: RoomWakeTrigger,
  reason: RoomWakeReason,
  sourceMessageId: string | null,
  nowIso: string,
  status: RoomWakeRequest['status'],
  error: string | null = null,
): RoomWakeRequest | null {
  if (!roomRouting) {
    return null;
  }

  const wakeRequest = createWakeRequest(
    participant,
    trigger,
    reason,
    sourceMessageId,
    nowIso,
    status,
    error,
  );
  recordWakeRequest(roomRouting, wakeRequest);
  return wakeRequest;
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

  // `lastOutcome` keeps the legacy routing vocabulary (`error`) while the
  // room-workflow layer and core projections use workflow vocabulary (`failed`).
  return {
    outcomeStatus: 'error',
    workflowStatus: 'failed',
  };
}
