import type {
  ContainerRecordKind,
  ContainerRecordStatus,
  CoreConversationKind,
  CoreConversationStatus,
  CoreActivityKind,
  CoreApprovalBindingKind,
  CoreApprovalBindingSubjectKind,
  CoreApprovalDecisionAction,
  CoreApprovalStatus,
  CoreArtifactKind,
  CoreArtifactStatus,
  CoreCheckpointStatus,
  LaneRecordStatus,
  MissionRecordStatus,
  CoreOperatorActionKind,
  CoreOrchestrationOutcomeStatus,
  CoreProjectStatus,
  CoreRunStatus,
  SegmentRecordKind,
  SegmentRecordStatus,
  SessionRecordStatus,
  CoreTaskStatus,
  CoreTraceKind,
  TransportBindingDirection,
  TransportBindingPlatform,
  TransportBindingStatus,
  ParticipantRecordStatus,
  TurnRecordKind,
  TurnRecordStatus,
  CoreWorkItemStatus,
} from '../types.js';

export const CORE_CONTAINER_KINDS = [
  'chat_root',
  'parallel_group',
  'project_workspace',
  'work_portfolio',
] as const satisfies readonly ContainerRecordKind[];

export const CORE_CONTAINER_STATUSES = [
  'active',
  'archived',
] as const satisfies readonly ContainerRecordStatus[];

export const CORE_CONVERSATION_KINDS = [
  'chat_channel',
  'direct_message',
  'external_transport',
  'private_escalation',
  'work_thread',
  'code_thread',
] as const satisfies readonly CoreConversationKind[];

export const CORE_CONVERSATION_STATUSES = [
  'planned',
  'active',
  'archived',
] as const satisfies readonly CoreConversationStatus[];

export const CORE_PARTICIPANT_STATUSES = [
  'active',
  'inactive',
  'removed',
] as const satisfies readonly ParticipantRecordStatus[];

export const CORE_TASK_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'in_progress',
  'blocked',
  'completed',
  'cancelled',
  'archived',
] as const satisfies readonly CoreTaskStatus[];

export const CORE_APPROVAL_STATUSES = [
  'not_requested',
  'pending',
  'approved',
  'rejected',
] as const satisfies readonly CoreApprovalStatus[];

export const CORE_RUN_STATUSES = [
  'queued',
  'running',
  'blocked',
  'completed',
  'failed',
  'cancelled',
] as const satisfies readonly CoreRunStatus[];

export const CORE_TURN_KINDS = [
  'user',
  'agent',
  'system',
  'transport',
] as const satisfies readonly TurnRecordKind[];

export const CORE_TURN_STATUSES = [
  'planned',
  'active',
  'completed',
  'failed',
  'cancelled',
] as const satisfies readonly TurnRecordStatus[];

export const CORE_LANE_STATUSES = [
  'pending',
  'waiting',
  'connecting',
  'running',
  'streaming',
  'completed',
  'failed',
  'cancelled',
] as const satisfies readonly LaneRecordStatus[];

export const CORE_SEGMENT_KINDS = [
  'status',
  'text',
  'tool',
  'artifact',
  'system',
] as const satisfies readonly SegmentRecordKind[];

export const CORE_SEGMENT_STATUSES = [
  'pending',
  'streaming',
  'complete',
  'failed',
  'cancelled',
] as const satisfies readonly SegmentRecordStatus[];

export const CORE_SESSION_STATUSES = [
  'connecting',
  'active',
  'completed',
  'failed',
  'cancelled',
] as const satisfies readonly SessionRecordStatus[];

export const CORE_TRACE_KINDS = [
  'note',
  'status',
  'dispatch',
  'approval',
  'checkpoint',
  'outcome',
  'error',
] as const satisfies readonly CoreTraceKind[];

export const CORE_CHECKPOINT_STATUSES = [
  'open',
  'completed',
  'cancelled',
] as const satisfies readonly CoreCheckpointStatus[];

export const CORE_OUTCOME_STATUSES = [
  'succeeded',
  'blocked',
  'failed',
  'cancelled',
] as const satisfies readonly CoreOrchestrationOutcomeStatus[];

export const CORE_PROJECT_STATUSES = [
  'planned',
  'active',
  'paused',
  'archived',
] as const satisfies readonly CoreProjectStatus[];

export const CORE_WORK_ITEM_STATUSES = [
  'draft',
  'planned',
  'ready',
  'in_progress',
  'blocked',
  'completed',
  'cancelled',
  'archived',
] as const satisfies readonly CoreWorkItemStatus[];

export const CORE_MISSION_STATUSES = [
  'draft',
  'planned',
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const satisfies readonly MissionRecordStatus[];

export const CORE_TRANSPORT_BINDING_PLATFORMS = [
  'telegram',
  'line',
  'internal',
  'web',
] as const satisfies readonly TransportBindingPlatform[];

export const CORE_TRANSPORT_BINDING_DIRECTIONS = [
  'inbound',
  'bidirectional',
] as const satisfies readonly TransportBindingDirection[];

export const CORE_TRANSPORT_BINDING_STATUSES = [
  'active',
  'disabled',
  'archived',
] as const satisfies readonly TransportBindingStatus[];

export const CORE_ARTIFACT_KINDS = [
  'document',
  'report',
  'build',
  'preview',
  'attachment',
  'transcript_export',
  'dataset',
] as const satisfies readonly CoreArtifactKind[];

export const CORE_ARTIFACT_STATUSES = [
  'draft',
  'ready',
  'published',
  'archived',
] as const satisfies readonly CoreArtifactStatus[];

export const CORE_ACTIVITY_KINDS = [
  'note',
  'status_change',
  'approval_requested',
  'approval_decided',
  'operator_action',
  'artifact_recorded',
  'checkpoint_recorded',
  'work_item_updated',
] as const satisfies readonly CoreActivityKind[];

export const CORE_APPROVAL_ACTIONS = [
  'approve',
  'reroute',
  'reject',
] as const satisfies readonly CoreApprovalDecisionAction[];

export const CORE_OPERATOR_ACTIONS = [
  'retry',
  'acknowledge',
] as const satisfies readonly CoreOperatorActionKind[];

export const CORE_APPROVAL_BINDING_KINDS = [
  'owner_decision',
  'review_gate',
  'release_gate',
] as const satisfies readonly CoreApprovalBindingKind[];

export const CORE_APPROVAL_BINDING_SUBJECT_KINDS = [
  'project',
  'work_item',
  'task',
  'run',
  'artifact',
  'conversation',
] as const satisfies readonly CoreApprovalBindingSubjectKind[];
