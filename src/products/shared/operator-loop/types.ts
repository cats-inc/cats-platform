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
  CoreRunRecord,
  CoreTaskRecord,
  CoreTraceRecord,
  CoreWorkflowSummary,
} from '../../../core/types.js';

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
  responseMessageId: string | null;
  error: string | null;
}

export interface ChatWorkflowRecommendationTargetView {
  participantKind: 'orchestrator' | 'cat' | null;
  participantId: string | null;
  participantName: string | null;
}

export interface ChatWorkflowRecommendationView {
  source: 'checkpoint' | 'boss_replan' | 'system_inference' | null;
  workflowShape: 'sequential' | 'parallel' | 'converge' | null;
  continuationSource: 'explicit_mentions' | 'workflow_recommendation' | null;
  branchStrategy: string | null;
  rationale: string | null;
  reviewRequired: boolean;
  candidateTargets: ChatWorkflowRecommendationTargetView[];
  unresolvedTargets: string[];
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
  approvalActions: ChatApprovalActionView[];
  incidentActions: ChatOperatorActionView[];
}
