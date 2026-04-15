import type {
  CatsCoreState,
  CoreApprovalDecisionAction,
  CoreApprovalQueueItem,
  CoreBudgetAlertLevel,
  CoreBudgetAlertSource,
  CoreCheckpointRecord,
  CoreDeliveryGate,
  CoreDeliveryMode,
  CoreEffectivePolicySource,
  CoreGovernanceSummary,
  CoreOrchestrationOutcomeRecord,
  CoreRuntimeDeliveryAction,
  CoreRunRecord,
  CoreTaskRecord,
  CoreTraceRecord,
  CoreWorkflowSummary,
} from '../../../../core/types.js';
import type { RoomAssistantTurnDelivery } from '../../../../shared/roomRouting.js';
import type {
  WorkflowContinuationReplayBlockedReason,
  WorkflowContinuationReplaySource,
} from '../../../../platform/orchestration/workflowContinuationReplay.js';

export interface ChatOperatorSnapshot {
  core: CatsCoreState;
  approvals: CoreApprovalQueueItem[];
}

export type ChatOperatorSeverity =
  | 'muted'
  | 'progress'
  | 'attention'
  | 'error'
  | 'success';

export interface ChatOperatorActivityItem {
  id: string;
  label: string;
  message: string;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  runId: string | null;
  taskId: string | null;
  severity: ChatOperatorSeverity;
  source: 'activity' | 'trace' | 'checkpoint' | 'outcome';
}

export interface ChatRunMetrics {
  dispatchCount: number | null;
  continuationCount: number | null;
  targetCount: number | null;
}

export interface ChatWorkflowBranchView {
  id: string;
  participantName: string;
  status: string;
  handoffReason: string | null;
  branchStrategy: string | null;
  parentCheckpointId: string | null;
  response: RoomAssistantTurnDelivery | null;
  error: string | null;
}

export interface ChatWorkflowRecommendationTargetView {
  participantKind: 'orchestrator' | 'cat' | null;
  participantId: string | null;
  participantName: string | null;
}

export interface ChatWorkflowRecommendationView {
  source: 'checkpoint' | 'boss_replan' | 'system_inference' | null;
  workflowShape: 'sequential' | 'concurrent' | 'converge' | null;
  continuationSource: 'explicit_mentions' | 'workflow_recommendation' | null;
  branchStrategy: string | null;
  rationale: string | null;
  reviewRequired: boolean;
  candidateTargets: ChatWorkflowRecommendationTargetView[];
  unresolvedTargets: string[];
}

export interface ChatWorkflowContinuationTargetView {
  participantKind: 'orchestrator' | 'cat' | null;
  participantId: string | null;
  participantName: string | null;
  laneId: string | null;
  sessionId: string | null;
}

export interface ChatWorkflowContinuationView {
  checkpointId: string | null;
  stageId: string | null;
  workflowShape: 'sequential' | 'concurrent' | 'converge' | null;
  sourceMessageId: string | null;
  sourceTurnId: string | null;
  sourceLaneId: string | null;
  sourceAssistantTurnId: string | null;
  continuationSource: WorkflowContinuationReplaySource | null;
  reviewRequired: boolean;
  convergeTargetId: string | null;
  blockedReason: WorkflowContinuationReplayBlockedReason | null;
  targets: ChatWorkflowContinuationTargetView[];
  targetCount: number;
  targetNames: string[];
  unresolvedTargets: string[];
  replayState: 'ready' | 'in_progress' | 'failed' | null;
  replayTrigger: 'retry' | null;
  replayError: string | null;
  retryAvailable: boolean;
}

export type ChatOperatorAttentionReason =
  | 'approval_pending'
  | 'run_blocked'
  | 'run_failed'
  | 'retry_available'
  | 'workflow_review_required'
  | 'child_tasks_in_progress';

export interface ChatOperatorAttentionView {
  severity: ChatOperatorSeverity;
  reasons: ChatOperatorAttentionReason[];
  needsOperatorAttention: boolean;
}

export interface ChatRuntimeDeliveryIntentView {
  mode: CoreDeliveryMode | null;
  source: CoreEffectivePolicySource | null;
  rationale: string | null;
  gates: CoreDeliveryGate[];
  requestedActions: CoreRuntimeDeliveryAction[];
  strict: boolean;
  requiresOwnerDecision: boolean;
  approvalPending: boolean;
  channelId: string | null;
  containerId: string | null;
  conversationId: string | null;
  taskId: string | null;
  roomMode: string | null;
  transport: string | null;
  workflowStageId: string | null;
  workflowShape: string | null;
}

export interface ChatNextActionView {
  kind: 'approve' | 'reroute' | 'reject' | 'retry' | 'acknowledge' | 'wait' | 'complete';
  label: string;
  blocking: boolean;
  action: {
    method: 'POST';
    path: string;
    body: Record<string, unknown>;
  } | null;
}

export interface ChatEffectivePolicyView {
  deliveryMode: CoreDeliveryMode | null;
  deliveryGates: CoreDeliveryGate[];
  deliverySource: CoreEffectivePolicySource | null;
  deliveryRationale: string | null;
  budgetAlertLevel: CoreBudgetAlertLevel | null;
  budgetAlertSource: CoreBudgetAlertSource | null;
  budgetRationale: string | null;
}

export interface ChatApprovalActionView {
  kind: CoreApprovalDecisionAction;
  label: string;
  description: string;
  disabled: boolean;
  taskId: string;
  approvalId: string;
  status: CoreApprovalQueueItem['status'];
}

export interface ChatOperatorActionView {
  kind: 'retry' | 'acknowledge';
  label: string;
  description: string;
  disabled: boolean;
  statusLabel: string | null;
  taskId: string | null;
  runId: string | null;
  checkpointId: string | null;
  outcomeId: string | null;
}

export interface ChatRunInspectorView {
  run: CoreRunRecord;
  traces: CoreTraceRecord[];
  checkpoints: CoreCheckpointRecord[];
  outcomes: CoreOrchestrationOutcomeRecord[];
  approvals: CoreApprovalQueueItem[];
  latestOutcome: CoreOrchestrationOutcomeRecord | null;
  latestCheckpoint: CoreCheckpointRecord | null;
  guardReason: string | null;
  cooldownLabel: string | null;
  metrics: ChatRunMetrics;
  workflowSummary: CoreWorkflowSummary | null;
  governanceSummary: CoreGovernanceSummary | null;
  workflowStageId: string | null;
  workflowShape: string | null;
  reviewRequired: boolean;
  branchStates: ChatWorkflowBranchView[];
  latestWorkflowRecommendation: ChatWorkflowRecommendationView | null;
  workflowContinuation: ChatWorkflowContinuationView | null;
  runtimeDeliveryIntent: ChatRuntimeDeliveryIntentView | null;
  attention: ChatOperatorAttentionView | null;
  nextActions: ChatNextActionView[];
  approvalActions: ChatApprovalActionView[];
  incidentActions: ChatOperatorActionView[];
}

export interface ChatOperatorView {
  channelId: string;
  conversationId: string;
  actorNameById: Record<string, string>;
  task: CoreTaskRecord | null;
  approvals: CoreApprovalQueueItem[];
  runs: CoreRunRecord[];
  traces: CoreTraceRecord[];
  checkpoints: CoreCheckpointRecord[];
  outcomes: CoreOrchestrationOutcomeRecord[];
  activityFeed: ChatOperatorActivityItem[];
  latestRun: CoreRunRecord | null;
  latestOutcome: CoreOrchestrationOutcomeRecord | null;
  latestCheckpoint: CoreCheckpointRecord | null;
  latestApproval: CoreApprovalQueueItem | null;
  guardReason: string | null;
  cooldownLabel: string | null;
  effectivePolicy: ChatEffectivePolicyView | null;
  governanceSummary: CoreGovernanceSummary | null;
  workflowSummary: CoreWorkflowSummary | null;
  latestWorkflowRecommendation: ChatWorkflowRecommendationView | null;
  workflowContinuation: ChatWorkflowContinuationView | null;
  runtimeDeliveryIntent: ChatRuntimeDeliveryIntentView | null;
  attention: ChatOperatorAttentionView | null;
  nextActions: ChatNextActionView[];
  approvalActions: ChatApprovalActionView[];
  incidentActions: ChatOperatorActionView[];
}
