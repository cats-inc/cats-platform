export type ParticipantSessionStatus =
  | 'not_started'
  | 'initializing'
  | 'ready'
  | 'error'
  | 'closed'
  | 'removed';

export type ChatMessageSenderKind = 'user' | 'agent' | 'system' | 'orchestrator';

export type RoomRoutingMode = 'boss_chat' | 'direct_cat_chat';

export type RoomRoutingTrigger =
  | 'room_default'
  | 'explicit_mention'
  | 'continuation_mention';

export type RoomRouteResolutionMode =
  | 'room_default'
  | 'explicit_single'
  | 'explicit_multi';

export type RoomRouteSelectionKind =
  | 'default_target'
  | 'explicit_mentions'
  | 'blocked';

export type RoomRouteBlockedReason =
  | 'missing_direct_chat_recipient'
  | 'missing_cat_led_recipient'
  | 'no_valid_targets'
  | 'user_cancelled';

export type RoomRouteDefaultTargetReason =
  | 'boss_chat_default'
  | 'direct_chat_recipient'
  | 'cat_led_recipient';

export type RoomRoutingTurnStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'blocked'
  | 'error';

export type RoomRoutingDispatchStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'skipped'
  | 'error'
  | 'blocked';

export type RoomRoutingGuardReason =
  | 'max_continuations'
  | 'max_dispatches'
  | 'max_target_visits'
  | 'anti_ping_pong'
  | null;

export type RoomWorkflowStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'completed'
  | 'blocked'
  | 'failed';

export type RoomWorkflowTargetStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'cancelled'
  | 'waiting_for_converge';

export type RoomWorkflowShape =
  | 'sequential'
  | 'concurrent'
  | 'converge';

export type RoomWorkflowBranchStrategy =
  | 'fork_if_possible'
  | 'transplant_context'
  | 'fresh_no_parent';

export type RoomWakeTrigger = 'room_entry' | 'route_target';

export type RoomWakeReason =
  | 'room_entry'
  | 'room_default'
  | 'explicit_mention'
  | 'workflow_continuation';

export type RoomWorkflowHandoffReason =
  | RoomWakeReason
  | 'operator_reroute'
  | 'runtime_retry';

export type RoomWakeRequestStatus = 'skipped' | 'completed' | 'failed';

export type RoomRoutingCheckpointKind =
  | 'turn_started'
  | 'fan_out'
  | 'continuation'
  | 'loop_guard'
  | 'anti_ping_pong'
  | 'no_targets'
  | 'completed'
  | 'runtime_error';

export type RoomWorkflowEventKind =
  | 'turn_started'
  | 'fan_out'
  | 'target_pending'
  | 'target_running'
  | 'target_completed'
  | 'target_failed'
  | 'target_blocked'
  | 'checkpoint'
  | 'guard_blocked'
  | 'outcome';

export interface RoomRoutingParticipantRef {
  participantKind: 'orchestrator' | 'cat';
  participantId: string;
  participantName: string;
}

export interface RoomAssistantTurnDelivery {
  assistantTurnId: string;
  messageIds: string[];
  fullText: string;
  segmentCount: number;
}

export interface RoomWakeRequest {
  id: string;
  participant: RoomRoutingParticipantRef;
  trigger: RoomWakeTrigger;
  reason: RoomWakeReason;
  sourceMessageId: string | null;
  status: RoomWakeRequestStatus;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
}

export interface RoomRoutingDispatch {
  id: string;
  sourceMessageId: string;
  source: RoomRoutingParticipantRef | null;
  target: RoomRoutingParticipantRef;
  laneId: string | null;
  sessionId: string | null;
  trigger: RoomRoutingTrigger;
  status: RoomRoutingDispatchStatus;
  mentionNames: string[];
  response: RoomAssistantTurnDelivery | null;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

export interface RoomRoutingCheckpoint {
  id: string;
  kind: RoomRoutingCheckpointKind;
  message: string;
  actor: RoomRoutingParticipantRef | null;
  sourceMessageId: string | null;
  targets: RoomRoutingParticipantRef[];
  createdAt: string;
}

export interface RoomRouteResolution {
  routingMode: RoomRouteResolutionMode;
  selectionKind: RoomRouteSelectionKind;
  defaultTarget: RoomRoutingParticipantRef | null;
  defaultTargetReason: RoomRouteDefaultTargetReason | null;
  fallbackTarget: RoomRoutingParticipantRef | null;
  blockedReason: RoomRouteBlockedReason | null;
  note: string | null;
}

export interface RoomRoutingOutcome {
  turnId: string;
  mode: RoomRoutingMode;
  sourceMessageId: string;
  sourceSenderKind: ChatMessageSenderKind;
  sourceSenderName: string;
  status: RoomRoutingTurnStatus;
  resolution: RoomRouteResolution;
  resolvedTargets: RoomRoutingParticipantRef[];
  unresolvedMentions: string[];
  dispatches: RoomRoutingDispatch[];
  checkpoints: RoomRoutingCheckpoint[];
  continuationCount: number;
  totalDispatchCount: number;
  guard: RoomRoutingGuardReason;
  startedAt: string;
  completedAt: string | null;
}

export interface RoomWorkflowTargetState {
  id: string;
  dispatchId: string | null;
  participant: RoomRoutingParticipantRef;
  laneId: string | null;
  sessionId: string | null;
  source: RoomRoutingParticipantRef | null;
  sourceMessageId: string;
  trigger: RoomRoutingTrigger;
  mentionNames: string[];
  depth: number;
  parentCheckpointId: string | null;
  branchStrategy: RoomWorkflowBranchStrategy | null;
  handoffReason: RoomWorkflowHandoffReason | null;
  wakeRequestId: string | null;
  status: RoomWorkflowTargetStatus;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  response: RoomAssistantTurnDelivery | null;
  error: string | null;
}

export interface RoomWorkflowEvent {
  id: string;
  turnId: string;
  kind: RoomWorkflowEventKind;
  status: RoomWorkflowStatus;
  message: string;
  actor: RoomRoutingParticipantRef | null;
  sourceMessageId: string | null;
  targets: RoomRoutingParticipantRef[];
  dispatchId: string | null;
  checkpointId: string | null;
  outcomeId: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface RoomWorkflowTurn {
  id: string;
  status: RoomWorkflowStatus;
  sourceMessageId: string;
  sourceSenderKind: ChatMessageSenderKind;
  sourceSenderName: string;
  guard: RoomRoutingGuardReason;
  stageId: string;
  workflowShape: RoomWorkflowShape;
  reviewRequired: boolean;
  lastCheckpointId: string | null;
  convergeTargetId: string | null;
  continuationCount: number;
  dispatchCount: number;
  targetStatuses: RoomWorkflowTargetState[];
  events: RoomWorkflowEvent[];
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface RoomWorkflowState {
  activeTurn: RoomWorkflowTurn | null;
  turnHistory: RoomWorkflowTurn[];
  eventHistory: RoomWorkflowEvent[];
  lastCheckpointEvent: RoomWorkflowEvent | null;
  lastOutcomeEvent: RoomWorkflowEvent | null;
}

export interface RoomRoutingState {
  mode: RoomRoutingMode;
  defaultRecipientId: string | null;
  maxContinuations: number;
  maxDispatchesPerTurn: number;
  maxTargetVisitsPerTurn: number;
  lastOutcome: RoomRoutingOutcome | null;
  lastCheckpoint: RoomRoutingCheckpoint | null;
  lastWakeRequest: RoomWakeRequest | null;
  wakeHistory: RoomWakeRequest[];
  workflow: RoomWorkflowState;
}
