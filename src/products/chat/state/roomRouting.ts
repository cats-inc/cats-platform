import type {
  RoomRoutingCheckpointKind,
  RoomRoutingDispatchStatus,
  RoomRoutingGuardReason,
  RoomRoutingMode,
  RoomRoutingState,
  RoomRoutingTrigger,
  RoomRoutingTurnStatus,
  RoomWorkflowEventKind,
  RoomWorkflowState,
  RoomWorkflowStatus,
  RoomWorkflowTargetStatus,
} from '../../../shared/app-shell.js';

export const DEFAULT_MAX_ROUTING_CONTINUATIONS = 6;
export const DEFAULT_MAX_ROUTING_DISPATCHES = 12;
export const DEFAULT_MAX_ROUTING_TARGET_VISITS = 2;
export const DEFAULT_WORKFLOW_TURN_HISTORY_LIMIT = 12;
export const DEFAULT_WORKFLOW_EVENT_HISTORY_LIMIT = 64;

const ROOM_ROUTING_MODES = new Set<RoomRoutingMode>([
  'boss_chat',
  'direct_cat_chat',
]);

const ROOM_ROUTING_TRIGGERS = new Set<RoomRoutingTrigger>([
  'room_default',
  'explicit_mention',
  'continuation_mention',
]);

const ROOM_ROUTING_TURN_STATUSES = new Set<RoomRoutingTurnStatus>([
  'idle',
  'running',
  'completed',
  'blocked',
  'error',
]);

const ROOM_ROUTING_DISPATCH_STATUSES = new Set<RoomRoutingDispatchStatus>([
  'pending',
  'running',
  'completed',
  'skipped',
  'error',
  'blocked',
]);

const ROOM_ROUTING_CHECKPOINT_KINDS = new Set<RoomRoutingCheckpointKind>([
  'turn_started',
  'fan_out',
  'continuation',
  'loop_guard',
  'anti_ping_pong',
  'no_targets',
  'completed',
  'runtime_error',
]);

const ROOM_ROUTING_GUARDS = new Set<Exclude<RoomRoutingGuardReason, null>>([
  'max_continuations',
  'max_dispatches',
  'max_target_visits',
  'anti_ping_pong',
]);

const ROOM_WORKFLOW_STATUSES = new Set<RoomWorkflowStatus>([
  'idle',
  'pending',
  'running',
  'completed',
  'blocked',
  'failed',
]);

const ROOM_WORKFLOW_TARGET_STATUSES = new Set<RoomWorkflowTargetStatus>([
  'pending',
  'running',
  'completed',
  'failed',
  'blocked',
]);

const ROOM_WORKFLOW_EVENT_KINDS = new Set<RoomWorkflowEventKind>([
  'turn_started',
  'fan_out',
  'target_pending',
  'target_running',
  'target_completed',
  'target_failed',
  'target_blocked',
  'checkpoint',
  'guard_blocked',
  'outcome',
]);

export function createDefaultRoomWorkflowState(): RoomWorkflowState {
  return {
    activeTurn: null,
    turnHistory: [],
    eventHistory: [],
    lastCheckpointEvent: null,
    lastOutcomeEvent: null,
  };
}

export function createDefaultRoomRoutingState(
  overrides: {
    mode?: RoomRoutingMode;
    leadParticipantId?: string | null;
  } = {},
): RoomRoutingState {
  return {
    mode: overrides.mode ?? 'boss_chat',
    leadParticipantId: overrides.leadParticipantId ?? null,
    maxContinuations: DEFAULT_MAX_ROUTING_CONTINUATIONS,
    maxDispatchesPerTurn: DEFAULT_MAX_ROUTING_DISPATCHES,
    maxTargetVisitsPerTurn: DEFAULT_MAX_ROUTING_TARGET_VISITS,
    lastOutcome: null,
    lastCheckpoint: null,
    workflow: createDefaultRoomWorkflowState(),
  };
}

export function resolveRoomRoutingState(
  roomRouting: RoomRoutingState | null | undefined,
): RoomRoutingState {
  return roomRouting ? structuredClone(roomRouting) : createDefaultRoomRoutingState();
}

export function resolveRoomWorkflowState(
  workflow: RoomWorkflowState | null | undefined,
): RoomWorkflowState {
  return workflow ? structuredClone(workflow) : createDefaultRoomWorkflowState();
}

export function normalizeRoomRoutingMode(
  value: unknown,
  fallback: RoomRoutingMode = 'boss_chat',
): RoomRoutingMode {
  return typeof value === 'string' && ROOM_ROUTING_MODES.has(value as RoomRoutingMode)
    ? value as RoomRoutingMode
    : fallback;
}

export function normalizeRoomRoutingTrigger(
  value: unknown,
  fallback: RoomRoutingTrigger = 'room_default',
): RoomRoutingTrigger {
  return typeof value === 'string' && ROOM_ROUTING_TRIGGERS.has(value as RoomRoutingTrigger)
    ? value as RoomRoutingTrigger
    : fallback;
}

export function normalizeRoomRoutingTurnStatus(
  value: unknown,
  fallback: RoomRoutingTurnStatus = 'idle',
): RoomRoutingTurnStatus {
  return typeof value === 'string'
    && ROOM_ROUTING_TURN_STATUSES.has(value as RoomRoutingTurnStatus)
    ? value as RoomRoutingTurnStatus
    : fallback;
}

export function normalizeRoomRoutingDispatchStatus(
  value: unknown,
  fallback: RoomRoutingDispatchStatus = 'pending',
): RoomRoutingDispatchStatus {
  return typeof value === 'string'
    && ROOM_ROUTING_DISPATCH_STATUSES.has(value as RoomRoutingDispatchStatus)
    ? value as RoomRoutingDispatchStatus
    : fallback;
}

export function normalizeRoomRoutingCheckpointKind(
  value: unknown,
  fallback: RoomRoutingCheckpointKind = 'turn_started',
): RoomRoutingCheckpointKind {
  return typeof value === 'string'
    && ROOM_ROUTING_CHECKPOINT_KINDS.has(value as RoomRoutingCheckpointKind)
    ? value as RoomRoutingCheckpointKind
    : fallback;
}

export function normalizeRoomRoutingGuardReason(
  value: unknown,
): RoomRoutingGuardReason {
  return typeof value === 'string'
    && ROOM_ROUTING_GUARDS.has(value as Exclude<RoomRoutingGuardReason, null>)
    ? value as Exclude<RoomRoutingGuardReason, null>
    : null;
}

export function normalizeRoomWorkflowStatus(
  value: unknown,
  fallback: RoomWorkflowStatus = 'idle',
): RoomWorkflowStatus {
  return typeof value === 'string'
    && ROOM_WORKFLOW_STATUSES.has(value as RoomWorkflowStatus)
    ? value as RoomWorkflowStatus
    : fallback;
}

export function normalizeRoomWorkflowTargetStatus(
  value: unknown,
  fallback: RoomWorkflowTargetStatus = 'pending',
): RoomWorkflowTargetStatus {
  return typeof value === 'string'
    && ROOM_WORKFLOW_TARGET_STATUSES.has(value as RoomWorkflowTargetStatus)
    ? value as RoomWorkflowTargetStatus
    : fallback;
}

export function normalizeRoomWorkflowEventKind(
  value: unknown,
  fallback: RoomWorkflowEventKind = 'turn_started',
): RoomWorkflowEventKind {
  return typeof value === 'string'
    && ROOM_WORKFLOW_EVENT_KINDS.has(value as RoomWorkflowEventKind)
    ? value as RoomWorkflowEventKind
    : fallback;
}
