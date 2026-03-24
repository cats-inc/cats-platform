import type {
  CoreActivityKind,
  CoreApprovalBindingKind,
  CoreApprovalBindingSubjectKind,
  CoreApprovalDecisionAction,
  CoreApprovalStatus,
  CoreArtifactKind,
  CoreArtifactStatus,
  CoreCheckpointStatus,
  CoreOperatorActionKind,
  CoreOrchestrationOutcomeStatus,
  CoreProjectStatus,
  CoreRunStatus,
  CoreTaskStatus,
  CoreTraceKind,
  CoreWorkItemStatus,
} from './types.js';

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
