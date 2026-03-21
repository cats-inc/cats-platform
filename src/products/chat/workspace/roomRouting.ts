import type {
  RoomRoutingCheckpointKind,
  RoomRoutingDispatchStatus,
  RoomRoutingGuardReason,
  RoomRoutingMode,
  RoomRoutingState,
  RoomRoutingTrigger,
  RoomRoutingTurnStatus,
} from '../../../shared/app-shell.js';

export const DEFAULT_MAX_ROUTING_CONTINUATIONS = 6;
export const DEFAULT_MAX_ROUTING_DISPATCHES = 12;
export const DEFAULT_MAX_ROUTING_TARGET_VISITS = 2;

const ROOM_ROUTING_MODES = new Set<RoomRoutingMode>([
  'boss_chat',
  'direct_cat_chat',
  'transport_inbox',
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
  };
}

export function resolveRoomRoutingState(
  roomRouting: RoomRoutingState | null | undefined,
): RoomRoutingState {
  return roomRouting ? structuredClone(roomRouting) : createDefaultRoomRoutingState();
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
