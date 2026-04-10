import {
  buildCoreTaskStatusCounts,
  countCoreTaskViewConversations,
} from './taskViewQuery.js';
import type {
  CoreTaskRecoveryActionKind,
  CoreTaskRecoveryListSummary,
  CoreTaskRecoveryReplayPhase,
  CoreTaskRecoveryReplaySource,
  CoreTaskRecoveryReplayTrigger,
  CoreTaskRecoveryResumeReason,
  CoreTaskRecoveryView,
  CoreTaskRecoveryWorkflowShape,
} from './recovery.js';
import type { CoreDeliveryMode, CoreRuntimeDeliveryAction } from './types.js';
import type {
  WorkflowContinuationReplayBlockedReason,
  WorkflowContinuationReplaySource,
  WorkflowContinuationReplayState,
} from '../platform/orchestration/workflowContinuationReplay.js';
import type {
  OrchestratorDispatchReplayState,
} from '../platform/orchestration/dispatchReplay.js';
import type {
  PendingOrchestratorDispatchReplayState,
} from '../platform/orchestration/pendingDispatch.js';

type RecoveryWorkflowShapeInput =
  NonNullable<CoreTaskRecoveryView['context']>['workflowShape']
  | undefined;

function buildEmptyCounts<T extends string>(values: readonly T[]): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}

function buildReplayStateCounts<T extends string>(
  recoveries: CoreTaskRecoveryView[],
  states: readonly T[],
  readState: (recovery: CoreTaskRecoveryView) => T | null,
): Record<T, number> {
  const counts = buildEmptyCounts(states);

  for (const recovery of recoveries) {
    const state = readState(recovery);
    if (!state) {
      continue;
    }
    counts[state] += 1;
  }

  return counts;
}

function buildWorkflowContinuationBlockedReasonCounts(
  recoveries: CoreTaskRecoveryView[],
  blockedReasons: readonly WorkflowContinuationReplayBlockedReason[],
): Record<WorkflowContinuationReplayBlockedReason, number> {
  const counts = buildEmptyCounts(blockedReasons);

  for (const recovery of recoveries) {
    const blockedReason = recovery.workflowContinuationReplay?.blockedReason;
    if (!blockedReason) {
      continue;
    }
    counts[blockedReason] += 1;
  }

  return counts;
}

function buildRecoveryActionKindCounts(
  recoveries: CoreTaskRecoveryView[],
  actionKinds: readonly CoreTaskRecoveryActionKind[],
): Record<CoreTaskRecoveryActionKind, number> {
  const counts = buildEmptyCounts(actionKinds);

  for (const recovery of recoveries) {
    for (const action of recovery.approvalActions) {
      counts[action.kind] += 1;
    }
    for (const action of recovery.incidentActions) {
      counts[action.kind] += 1;
    }
  }

  return counts;
}

function buildRecoveryDeliveryModeCounts(
  recoveries: CoreTaskRecoveryView[],
  deliveryModes: readonly CoreDeliveryMode[],
): Record<CoreDeliveryMode, number> {
  const counts = buildEmptyCounts(deliveryModes);

  for (const recovery of recoveries) {
    if (recovery.context?.deliveryMode) {
      counts[recovery.context.deliveryMode] += 1;
    }
  }

  return counts;
}

function buildRecoveryDeliveryActionCounts(
  recoveries: CoreTaskRecoveryView[],
  deliveryActions: readonly CoreRuntimeDeliveryAction[],
): Record<CoreRuntimeDeliveryAction, number> {
  const counts = buildEmptyCounts(deliveryActions);

  for (const recovery of recoveries) {
    for (const action of recovery.context?.deliveryActions ?? []) {
      counts[action] += 1;
    }
  }

  return counts;
}

function buildRecoveryWorkflowStageCounts(
  recoveries: CoreTaskRecoveryView[],
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const recovery of recoveries) {
    const stageId = recovery.context?.workflowStageId;
    if (!stageId) {
      continue;
    }
    counts[stageId] = (counts[stageId] ?? 0) + 1;
  }

  return counts;
}

function buildRecoveryWorkflowShapeCounts(
  recoveries: CoreTaskRecoveryView[],
  workflowShapes: readonly CoreTaskRecoveryWorkflowShape[],
  readWorkflowShape: (value: RecoveryWorkflowShapeInput) => CoreTaskRecoveryWorkflowShape | null,
): Record<CoreTaskRecoveryWorkflowShape, number> {
  const counts = buildEmptyCounts(workflowShapes);

  for (const recovery of recoveries) {
    const shape = readWorkflowShape(recovery.context?.workflowShape);
    if (!shape) {
      continue;
    }
    counts[shape] += 1;
  }

  return counts;
}

function buildRecoveryContinuationSourceCounts(
  recoveries: CoreTaskRecoveryView[],
  continuationSources: readonly WorkflowContinuationReplaySource[],
): Record<WorkflowContinuationReplaySource, number> {
  const counts = buildEmptyCounts(continuationSources);

  for (const recovery of recoveries) {
    const source = recovery.workflowContinuationReplay?.continuationSource;
    if (
      source !== 'explicit_mentions'
      && source !== 'workflow_recommendation'
    ) {
      continue;
    }
    counts[source] += 1;
  }

  return counts;
}

export function summarizeCoreTaskRecoveryViewsWithSupport(input: {
  totalAvailable: number;
  matching: number;
  recoveries: CoreTaskRecoveryView[];
  pendingDispatchReplayStates: readonly PendingOrchestratorDispatchReplayState[];
  dispatchReplayStates: readonly OrchestratorDispatchReplayState[];
  workflowContinuationReplayStates: readonly WorkflowContinuationReplayState[];
  workflowContinuationBlockedReasons: readonly WorkflowContinuationReplayBlockedReason[];
  actionKinds: readonly CoreTaskRecoveryActionKind[];
  deliveryModes: readonly CoreDeliveryMode[];
  deliveryActions: readonly CoreRuntimeDeliveryAction[];
  workflowShapes: readonly CoreTaskRecoveryWorkflowShape[];
  replayResumeReasons: readonly CoreTaskRecoveryResumeReason[];
  replayPhases: readonly CoreTaskRecoveryReplayPhase[];
  replayTriggers: readonly CoreTaskRecoveryReplayTrigger[];
  replaySources: readonly CoreTaskRecoveryReplaySource[];
  continuationSources: readonly WorkflowContinuationReplaySource[];
  readWorkflowShape: (value: RecoveryWorkflowShapeInput) => CoreTaskRecoveryWorkflowShape | null;
  readResumeReason: (value: unknown) => CoreTaskRecoveryResumeReason | null;
  readReplayPhase: (value: unknown) => CoreTaskRecoveryReplayPhase | null;
  readReplayTrigger: (value: unknown) => CoreTaskRecoveryReplayTrigger | null;
  readReplaySource: (value: unknown) => CoreTaskRecoveryReplaySource | null;
}): CoreTaskRecoveryListSummary {
  return {
    totalAvailable: input.totalAvailable,
    matching: input.matching,
    returned: input.recoveries.length,
    conversationCount: countCoreTaskViewConversations(input.recoveries),
    taskStatusCounts: buildCoreTaskStatusCounts(input.recoveries),
    canRetryCount: input.recoveries.filter((recovery) => recovery.canRetry).length,
    canResumeViaApprovalCount: input.recoveries.filter((recovery) => recovery.canResumeViaApproval)
      .length,
    withPendingDispatchCount: input.recoveries.filter((recovery) => recovery.pendingDispatch).length,
    withDispatchReplayCount: input.recoveries.filter((recovery) => recovery.dispatchReplay).length,
    withWorkflowContinuationReplayCount: input.recoveries.filter((recovery) =>
      recovery.workflowContinuationReplay).length,
    pendingDispatchReplayStateCounts: buildReplayStateCounts(
      input.recoveries,
      input.pendingDispatchReplayStates,
      (recovery) =>
        recovery.pendingDispatch?.replayState as PendingOrchestratorDispatchReplayState | null,
    ),
    dispatchReplayStateCounts: buildReplayStateCounts(
      input.recoveries,
      input.dispatchReplayStates,
      (recovery) => recovery.dispatchReplay?.replayState as OrchestratorDispatchReplayState | null,
    ),
    workflowContinuationReplayStateCounts: buildReplayStateCounts(
      input.recoveries,
      input.workflowContinuationReplayStates,
      (recovery) =>
        recovery.workflowContinuationReplay?.replayState as WorkflowContinuationReplayState | null,
    ),
    workflowContinuationBlockedReasonCounts: buildWorkflowContinuationBlockedReasonCounts(
      input.recoveries,
      input.workflowContinuationBlockedReasons,
    ),
    actionKindCounts: buildRecoveryActionKindCounts(input.recoveries, input.actionKinds),
    deliveryModeCounts: buildRecoveryDeliveryModeCounts(input.recoveries, input.deliveryModes),
    deliveryActionCounts: buildRecoveryDeliveryActionCounts(
      input.recoveries,
      input.deliveryActions,
    ),
    workflowStageCounts: buildRecoveryWorkflowStageCounts(input.recoveries),
    workflowShapeCounts: buildRecoveryWorkflowShapeCounts(
      input.recoveries,
      input.workflowShapes,
      input.readWorkflowShape,
    ),
    latestReplaySourceCounts: buildReplayStateCounts(
      input.recoveries,
      input.replaySources,
      (recovery) => input.readReplaySource(recovery.latestActivity?.source),
    ),
    latestReplayTriggerCounts: buildReplayStateCounts(
      input.recoveries,
      input.replayTriggers,
      (recovery) => input.readReplayTrigger(recovery.latestActivity?.trigger),
    ),
    latestReplayPhaseCounts: buildReplayStateCounts(
      input.recoveries,
      input.replayPhases,
      (recovery) => input.readReplayPhase(recovery.latestActivity?.phase),
    ),
    latestReplayResumeReasonCounts: buildReplayStateCounts(
      input.recoveries,
      input.replayResumeReasons,
      (recovery) => input.readResumeReason(recovery.latestActivity?.resumeReason),
    ),
    workflowReviewRequiredCount: input.recoveries.filter((recovery) =>
      recovery.context?.workflowReviewRequired === true).length,
    workflowConvergeTargetCount: input.recoveries.filter((recovery) =>
      Boolean(recovery.context?.workflowConvergeTargetId)).length,
    workflowContinuationSourceCounts: buildRecoveryContinuationSourceCounts(
      input.recoveries,
      input.continuationSources,
    ),
    withUnresolvedWorkflowTargetsCount: input.recoveries.filter((recovery) =>
      (recovery.workflowContinuationReplay?.unresolvedTargets.length ?? 0) > 0).length,
    withChildrenCount: input.recoveries.filter((recovery) => recovery.family.childCount > 0).length,
    withActiveChildrenCount: input.recoveries.filter((recovery) =>
      recovery.family.childCount > 0 && !recovery.family.allChildrenTerminal).length,
  };
}
