import type {
  RoomRouteBlockedReason,
  RoomRouteDefaultTargetReason,
  RoomRouteResolutionMode,
  RoomRouteSelectionKind,
  RoomRoutingCheckpointKind,
  RoomRoutingDispatchStatus,
  RoomRoutingGuardReason,
  RoomRoutingMode,
  RoomRoutingState,
  RoomRoutingTrigger,
  RoomRoutingTurnStatus,
  RoomWorkflowEventKind,
  RoomWorkflowBranchStrategy,
  RoomWorkflowHandoffReason,
  RoomWorkflowShape,
  RoomWorkflowState,
  RoomWorkflowStatus,
  RoomWorkflowTargetStatus,
  RoomWakeReason,
  RoomWakeRequestStatus,
  RoomWakeTrigger,
} from '../../../../shared/roomRouting.js';
import {
  DEFAULT_MAX_ROUTING_CONTINUATIONS,
  DEFAULT_MAX_ROUTING_DISPATCHES,
  DEFAULT_MAX_ROUTING_TARGET_VISITS,
  DEFAULT_WORKFLOW_EVENT_HISTORY_LIMIT,
  DEFAULT_WORKFLOW_TURN_HISTORY_LIMIT,
  DEFAULT_WAKE_HISTORY_LIMIT,
  createDefaultRoomRoutingState,
  createDefaultRoomWorkflowState,
  resolveRoomRoutingState,
  resolveRoomWorkflowState,
} from '../../../../core/roomRoutingState.js';

export {
  DEFAULT_MAX_ROUTING_CONTINUATIONS,
  DEFAULT_MAX_ROUTING_DISPATCHES,
  DEFAULT_MAX_ROUTING_TARGET_VISITS,
  DEFAULT_WORKFLOW_EVENT_HISTORY_LIMIT,
  DEFAULT_WORKFLOW_TURN_HISTORY_LIMIT,
  DEFAULT_WAKE_HISTORY_LIMIT,
  createDefaultRoomRoutingState,
  createDefaultRoomWorkflowState,
  resolveRoomRoutingState,
  resolveRoomWorkflowState,
} from '../../../../core/roomRoutingState.js';

const ROOM_ROUTING_MODES = new Set<RoomRoutingMode>([
  'boss_chat',
  'direct_cat_chat',
]);

const ROOM_ROUTING_TRIGGERS = new Set<RoomRoutingTrigger>([
  'room_default',
  'explicit_mention',
  'continuation_mention',
]);

const ROOM_ROUTE_RESOLUTION_MODES = new Set<RoomRouteResolutionMode>([
  'room_default',
  'explicit_single',
  'explicit_multi',
]);

const ROOM_ROUTE_SELECTION_KINDS = new Set<RoomRouteSelectionKind>([
  'default_target',
  'explicit_mentions',
  'blocked',
]);

const ROOM_ROUTE_BLOCKED_REASONS = new Set<RoomRouteBlockedReason>([
  'missing_direct_chat_recipient',
  'missing_cat_led_recipient',
  'no_valid_targets',
  'user_cancelled',
]);

const ROOM_ROUTE_DEFAULT_TARGET_REASONS = new Set<RoomRouteDefaultTargetReason>([
  'boss_chat_default',
  'direct_chat_recipient',
  'cat_led_recipient',
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
  'cancelled',
  'waiting_for_converge',
]);

const ROOM_WORKFLOW_SHAPES = new Set<RoomWorkflowShape>([
  'sequential',
  'concurrent',
  'converge',
]);

const ROOM_WORKFLOW_BRANCH_STRATEGIES = new Set<RoomWorkflowBranchStrategy>([
  'fork_if_possible',
  'transplant_context',
  'fresh_no_parent',
]);

const ROOM_WORKFLOW_HANDOFF_REASONS = new Set<RoomWorkflowHandoffReason>([
  'room_entry',
  'room_default',
  'explicit_mention',
  'workflow_continuation',
  'operator_reroute',
  'runtime_retry',
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

const ROOM_WAKE_TRIGGERS = new Set<RoomWakeTrigger>([
  'room_entry',
  'route_target',
]);

const ROOM_WAKE_REASONS = new Set<RoomWakeReason>([
  'room_entry',
  'room_default',
  'explicit_mention',
  'workflow_continuation',
]);

const ROOM_WAKE_REQUEST_STATUSES = new Set<RoomWakeRequestStatus>([
  'skipped',
  'completed',
  'failed',
]);

export function normalizeRoomRoutingMode(
  value: unknown,
  fallback: RoomRoutingMode = 'boss_chat',
): RoomRoutingMode {
  return typeof value === 'string' && ROOM_ROUTING_MODES.has(value as RoomRoutingMode)
    ? value as RoomRoutingMode
    : fallback;
}

export function normalizeRoomRouteResolutionMode(
  value: unknown,
  fallback: RoomRouteResolutionMode = 'room_default',
): RoomRouteResolutionMode {
  return typeof value === 'string'
    && ROOM_ROUTE_RESOLUTION_MODES.has(value as RoomRouteResolutionMode)
    ? value as RoomRouteResolutionMode
    : fallback;
}

export function normalizeRoomRouteSelectionKind(
  value: unknown,
  fallback: RoomRouteSelectionKind = 'blocked',
): RoomRouteSelectionKind {
  return typeof value === 'string'
    && ROOM_ROUTE_SELECTION_KINDS.has(value as RoomRouteSelectionKind)
    ? value as RoomRouteSelectionKind
    : fallback;
}

export function normalizeRoomRouteBlockedReason(
  value: unknown,
): RoomRouteBlockedReason | null {
  if (value === 'missing_direct_chat_lead') return 'missing_direct_chat_recipient';
  if (value === 'missing_cat_led_lead') return 'missing_cat_led_recipient';
  return typeof value === 'string'
    && ROOM_ROUTE_BLOCKED_REASONS.has(value as RoomRouteBlockedReason)
    ? value as RoomRouteBlockedReason
    : null;
}

export function normalizeRoomRouteDefaultTargetReason(
  value: unknown,
): RoomRouteDefaultTargetReason | null {
  if (value === 'direct_chat_lead') return 'direct_chat_recipient';
  if (value === 'cat_led_lead') return 'cat_led_recipient';
  return typeof value === 'string'
    && ROOM_ROUTE_DEFAULT_TARGET_REASONS.has(value as RoomRouteDefaultTargetReason)
    ? value as RoomRouteDefaultTargetReason
    : null;
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

export function normalizeRoomWorkflowShape(
  value: unknown,
  fallback: RoomWorkflowShape = 'sequential',
): RoomWorkflowShape {
  if (value === 'parallel') {
    return 'concurrent';
  }
  return typeof value === 'string' && ROOM_WORKFLOW_SHAPES.has(value as RoomWorkflowShape)
    ? value as RoomWorkflowShape
    : fallback;
}

export function normalizeRoomWorkflowBranchStrategy(
  value: unknown,
  fallback: RoomWorkflowBranchStrategy | null = null,
): RoomWorkflowBranchStrategy | null {
  if (typeof value !== 'string') {
    return fallback;
  }

  return ROOM_WORKFLOW_BRANCH_STRATEGIES.has(value as RoomWorkflowBranchStrategy)
    ? value as RoomWorkflowBranchStrategy
    : fallback;
}

export function normalizeRoomWorkflowHandoffReason(
  value: unknown,
  fallback: RoomWorkflowHandoffReason | null = null,
): RoomWorkflowHandoffReason | null {
  if (typeof value !== 'string') {
    return fallback;
  }

  return ROOM_WORKFLOW_HANDOFF_REASONS.has(value as RoomWorkflowHandoffReason)
    ? value as RoomWorkflowHandoffReason
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

export function normalizeRoomWakeTrigger(
  value: unknown,
  fallback: RoomWakeTrigger = 'route_target',
): RoomWakeTrigger {
  return typeof value === 'string'
    && ROOM_WAKE_TRIGGERS.has(value as RoomWakeTrigger)
    ? value as RoomWakeTrigger
    : fallback;
}

export function normalizeRoomWakeReason(
  value: unknown,
  fallback: RoomWakeReason = 'room_default',
): RoomWakeReason {
  return typeof value === 'string'
    && ROOM_WAKE_REASONS.has(value as RoomWakeReason)
    ? value as RoomWakeReason
    : fallback;
}

export function normalizeRoomWakeRequestStatus(
  value: unknown,
  fallback: RoomWakeRequestStatus = 'completed',
): RoomWakeRequestStatus {
  return typeof value === 'string'
    && ROOM_WAKE_REQUEST_STATUSES.has(value as RoomWakeRequestStatus)
    ? value as RoomWakeRequestStatus
    : fallback;
}
