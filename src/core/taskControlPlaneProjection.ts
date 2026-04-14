import {
  CORE_TASK_RECOVERY_REPLAY_PHASES,
  CORE_TASK_RECOVERY_REPLAY_SOURCES,
  CORE_TASK_RECOVERY_REPLAY_TRIGGERS,
  CORE_TASK_RECOVERY_RESUME_REASONS,
  type CoreTaskRecoveryReplayPhase,
  type CoreTaskRecoveryReplaySource,
  type CoreTaskRecoveryReplayTrigger,
  type CoreTaskRecoveryResumeReason,
  type CoreTaskRecoveryView,
} from './recovery.js';
import { matchesCoreTaskViewCommonQuery } from './taskViewQuery.js';
import type { CoreTaskInspectionFamilyView } from './taskInspection.js';
import type {
  CoreTaskControlPlaneAttention,
  CoreTaskControlPlaneListOptions,
  CoreTaskControlPlaneReason,
  CoreTaskControlPlaneRuntimeDeliveryIntentView,
  CoreTaskControlPlaneSeverity,
  CoreTaskControlPlaneView,
  CoreTaskControlPlaneWorkflowContinuationView,
  CoreTaskControlPlaneWorkflowRecommendationView,
  CoreTaskWorkflowShape,
} from './taskControlPlane.js';
import type {
  CoreGovernanceSummary,
  CoreRecordMetadata,
  CoreRunRecord,
  CoreTaskRecord,
  CoreTraceRecord,
  CoreWorkflowSummary,
} from './types.js';
import type { TaskExecutionProduct } from '../shared/taskPlanning.js';

export function asRecord(value: unknown): CoreRecordMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as CoreRecordMetadata;
}

export function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function readBoolean(value: unknown): boolean {
  return value === true;
}

export function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

export function readMetadataRecord(
  metadata: CoreRecordMetadata | null | undefined,
  key: string,
): CoreRecordMetadata | null {
  return asRecord(metadata?.[key]);
}

export function readWorkflowRecommendationFromMetadata(
  metadata: CoreRecordMetadata | null | undefined,
): CoreTaskControlPlaneWorkflowRecommendationView | null {
  const recommendation = readMetadataRecord(metadata, 'workflowRecommendation');
  if (!recommendation) {
    return null;
  }

  const workflowShape = readString(recommendation.workflowShape);
  const source = readString(recommendation.source);
  const continuationSource = readString(metadata?.continuationSource);
  const candidateTargets = Array.isArray(recommendation.candidateTargets)
    ? recommendation.candidateTargets
      .map((target) => asRecord(target))
      .filter((target): target is CoreRecordMetadata => target !== null)
      .map((target) => ({
        participantKind: (() => {
          const participantKind = readString(target.participantKind);
          if (participantKind === 'orchestrator' || participantKind === 'cat') {
            return participantKind as 'orchestrator' | 'cat';
          }
          return null;
        })(),
        participantId: readString(target.participantId),
        participantName: readString(target.participantName),
      }))
    : [];

  return {
    source:
      source === 'checkpoint' || source === 'boss_replan' || source === 'system_inference'
        ? source
        : null,
    workflowShape:
      workflowShape === 'sequential'
      || workflowShape === 'concurrent'
      || workflowShape === 'converge'
        ? workflowShape
        : workflowShape === 'parallel'
          ? ('concurrent' as CoreTaskWorkflowShape)
          : null,
    continuationSource:
      continuationSource === 'explicit_mentions'
      || continuationSource === 'workflow_recommendation'
        ? continuationSource
        : null,
    branchStrategy: readString(recommendation.branchStrategy),
    rationale: readString(recommendation.rationale),
    reviewRequired: readBoolean(recommendation.reviewRequired),
    candidateTargets,
    unresolvedTargets: readStringArray(metadata?.unresolvedTargets),
  };
}

export function resolveLatestWorkflowRecommendation(input: {
  latestCheckpointMetadata: CoreRecordMetadata | null | undefined;
  latestOutcomeMetadata: CoreRecordMetadata | null | undefined;
  latestRunMetadata: CoreRecordMetadata | null | undefined;
  traces: CoreTraceRecord[];
}): CoreTaskControlPlaneWorkflowRecommendationView | null {
  return readWorkflowRecommendationFromMetadata(input.latestCheckpointMetadata)
    ?? readWorkflowRecommendationFromMetadata(input.latestOutcomeMetadata)
    ?? readWorkflowRecommendationFromMetadata(input.latestRunMetadata)
    ?? input.traces
      .map((trace) => readWorkflowRecommendationFromMetadata(trace.metadata))
      .find((recommendation): recommendation is CoreTaskControlPlaneWorkflowRecommendationView =>
        Boolean(recommendation),
      )
    ?? null;
}

export function readWorkflowShape(
  value: unknown,
): CoreTaskWorkflowShape | null {
  return value === 'sequential' || value === 'concurrent' || value === 'converge'
    ? (value as CoreTaskWorkflowShape)
    : value === 'parallel'
      ? ('concurrent' as CoreTaskWorkflowShape)
      : null;
}

export function readEffectiveWorkflowShape(
  view: Pick<
    CoreTaskControlPlaneView,
    'workflowContinuation' | 'runtimeDeliveryIntent' | 'workflowSummary'
  >,
): CoreTaskWorkflowShape | null {
  return view.workflowContinuation?.workflowShape
    ?? readWorkflowShape(view.runtimeDeliveryIntent?.workflowShape)
    ?? readWorkflowShape(view.workflowSummary?.shape)
    ?? null;
}

export function readExecutionProduct(
  view: Pick<CoreTaskControlPlaneView, 'runtimeBridge'>,
): TaskExecutionProduct | null {
  return view.runtimeBridge.product ?? null;
}

export function readRequestedStrategy(
  view: Pick<CoreTaskControlPlaneView, 'runtimeBridge'>,
): string | null {
  const requestedStrategy = view.runtimeBridge.request.requestedStrategy;
  return typeof requestedStrategy === 'string' && requestedStrategy.trim().length > 0
    ? requestedStrategy
    : null;
}

export function readEffectiveWorkflowReviewRequired(
  view: Pick<CoreTaskControlPlaneView, 'workflowContinuation' | 'workflowSummary'>,
): boolean {
  return view.workflowContinuation?.reviewRequired
    ?? view.workflowSummary?.reviewRequired
    ?? false;
}

export function readEffectiveWorkflowConvergeTargetId(
  view: Pick<CoreTaskControlPlaneView, 'workflowContinuation' | 'workflowSummary'>,
): string | null {
  return view.workflowContinuation?.convergeTargetId
    ?? view.workflowSummary?.convergeTargetId
    ?? null;
}

export function readEffectiveWorkflowUnresolvedTargets(
  view: Pick<CoreTaskControlPlaneView, 'workflowContinuation'>,
): string[] {
  return view.workflowContinuation?.unresolvedTargets.length
    ? [...view.workflowContinuation.unresolvedTargets]
    : [];
}

export function readContinuationSource(
  value: unknown,
): 'explicit_mentions' | 'workflow_recommendation' | null {
  return value === 'explicit_mentions' || value === 'workflow_recommendation'
    ? value
    : null;
}

export function readWorkflowContinuationReplayState(
  value: unknown,
): 'ready' | 'in_progress' | 'failed' | null {
  return value === 'ready' || value === 'in_progress' || value === 'failed'
    ? value
    : null;
}

export function readLatestReplayPhase(
  view: Pick<CoreTaskControlPlaneView, 'recovery'>,
): CoreTaskRecoveryReplayPhase | null {
  const phase = view.recovery.latestActivity?.phase;
  return typeof phase === 'string'
    && CORE_TASK_RECOVERY_REPLAY_PHASES.includes(phase as CoreTaskRecoveryReplayPhase)
    ? phase as CoreTaskRecoveryReplayPhase
    : null;
}

export function readLatestReplaySource(
  view: Pick<CoreTaskControlPlaneView, 'recovery'>,
): CoreTaskRecoveryReplaySource | null {
  const source = view.recovery.latestActivity?.source;
  return typeof source === 'string'
    && CORE_TASK_RECOVERY_REPLAY_SOURCES.includes(source as CoreTaskRecoveryReplaySource)
    ? source as CoreTaskRecoveryReplaySource
    : null;
}

export function readLatestReplayTrigger(
  view: Pick<CoreTaskControlPlaneView, 'recovery'>,
): CoreTaskRecoveryReplayTrigger | null {
  const trigger = view.recovery.latestActivity?.trigger;
  return typeof trigger === 'string'
    && CORE_TASK_RECOVERY_REPLAY_TRIGGERS.includes(trigger as CoreTaskRecoveryReplayTrigger)
    ? trigger as CoreTaskRecoveryReplayTrigger
    : null;
}

export function readLatestReplayResumeReason(
  view: Pick<CoreTaskControlPlaneView, 'recovery'>,
): CoreTaskRecoveryResumeReason | null {
  const reason = view.recovery.latestActivity?.resumeReason;
  return typeof reason === 'string'
    && CORE_TASK_RECOVERY_RESUME_REASONS.includes(reason as CoreTaskRecoveryResumeReason)
    ? reason as CoreTaskRecoveryResumeReason
    : null;
}

export function readWorkflowContinuationReplayTrigger(
  value: unknown,
): 'retry' | null {
  return value === 'retry' ? value : null;
}

export function buildWorkflowContinuationState(input: {
  latestCheckpointId: string | null;
  workflowSummary: CoreWorkflowSummary | null;
  recovery: CoreTaskRecoveryView;
  latestWorkflowRecommendation: CoreTaskControlPlaneWorkflowRecommendationView | null;
}): CoreTaskControlPlaneWorkflowContinuationView | null {
  const replay = input.recovery.workflowContinuationReplay;
  const candidateTargetNames = input.latestWorkflowRecommendation?.candidateTargets
    .map((target) => target.participantName)
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
    ?? [];
  const replayTargetNames = replay?.targets
    .map((target) => target.participantName)
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
    ?? [];
  const targetNames = candidateTargetNames.length > 0
    ? candidateTargetNames
    : replayTargetNames;
  const unresolvedTargets = input.latestWorkflowRecommendation?.unresolvedTargets.length
    ? [...input.latestWorkflowRecommendation.unresolvedTargets]
    : replay?.unresolvedTargets
      ? [...replay.unresolvedTargets]
      : [];
  const workflowShape = input.latestWorkflowRecommendation?.workflowShape
    ?? readWorkflowShape(replay?.workflowShape)
    ?? readWorkflowShape(input.workflowSummary?.shape)
    ?? null;
  const continuationSource = input.latestWorkflowRecommendation?.continuationSource
    ?? readContinuationSource(replay?.continuationSource)
    ?? null;
  const sourceMessageId = replay?.sourceMessageId ?? null;
  const sourceTurnId = replay?.sourceTurnId ?? null;
  const sourceLaneId = replay?.sourceLaneId ?? null;
  const sourceAssistantTurnId = replay?.sourceAssistantTurnId ?? null;
  const reviewRequired = input.latestWorkflowRecommendation?.reviewRequired
    ?? replay?.reviewRequired
    ?? input.workflowSummary?.reviewRequired
    ?? false;
  const checkpointId = replay?.checkpointId
    ?? input.latestCheckpointId
    ?? input.workflowSummary?.lastCheckpointId
    ?? null;
  const stageId = replay?.workflowStageId
    ?? input.workflowSummary?.stageId
    ?? null;
  const convergeTargetId = input.workflowSummary?.convergeTargetId
    ?? (
      replay?.workflowShape === 'converge'
      && replay.targets.length === 1
      ? replay.targets[0]?.participantId ?? null
      : null
    )
    ?? (
      workflowShape === 'converge'
      && input.latestWorkflowRecommendation?.candidateTargets.length === 1
      ? input.latestWorkflowRecommendation.candidateTargets[0]?.participantId ?? null
      : null
    );

  if (
    !replay
    && !input.latestWorkflowRecommendation
    && !checkpointId
    && !stageId
    && targetNames.length === 0
    && unresolvedTargets.length === 0
    && !reviewRequired
  ) {
    return null;
  }

  return {
    checkpointId,
    stageId,
    workflowShape,
    sourceMessageId,
    sourceTurnId,
    sourceLaneId,
    sourceAssistantTurnId,
    continuationSource,
    reviewRequired,
    convergeTargetId,
    blockedReason: replay?.blockedReason ?? null,
    targetCount: targetNames.length,
    targetNames: [...targetNames],
    unresolvedTargets,
    replayState: readWorkflowContinuationReplayState(replay?.replayState),
    replayTrigger: readWorkflowContinuationReplayTrigger(replay?.replayTrigger),
    replayError: replay?.replayError ?? null,
    retryAvailable: Boolean(replay && input.recovery.canRetry),
  };
}

export function buildRuntimeDeliveryIntent(input: {
  governanceSummary: CoreGovernanceSummary | null;
  workflowSummary: CoreWorkflowSummary | null;
  workflowContinuation: CoreTaskControlPlaneWorkflowContinuationView | null;
}): CoreTaskControlPlaneRuntimeDeliveryIntentView | null {
  const delivery = input.governanceSummary?.delivery ?? null;
  const manifest = input.governanceSummary?.runtimeDeliveryManifest ?? null;
  if (!delivery && !manifest) {
    return null;
  }

  return {
    mode: delivery?.mode ?? null,
    source: delivery?.source ?? null,
    rationale: delivery?.rationale ?? null,
    gates: [...(delivery?.gates ?? manifest?.gates ?? [])],
    requestedActions: [...(manifest?.requestedActions ?? [])],
    strict: manifest?.strict ?? Boolean((delivery?.gates.length ?? 0) > 0),
    requiresOwnerDecision: input.governanceSummary?.approval.requiresOwnerDecision ?? false,
    approvalPending: input.governanceSummary?.approval.pending ?? false,
    channelId: manifest?.context.channelId ?? null,
    conversationId: manifest?.context.conversationId ?? null,
    taskId: manifest?.context.taskId ?? null,
    roomMode: manifest?.context.roomMode ?? null,
    transport: manifest?.context.transport ?? null,
    workflowStageId:
      manifest?.context.workflowStageId
      ?? input.workflowContinuation?.stageId
      ?? input.workflowSummary?.stageId
      ?? null,
    workflowShape:
      readWorkflowShape(manifest?.context.workflowShape)
      ?? input.workflowContinuation?.workflowShape
      ?? readWorkflowShape(input.workflowSummary?.shape)
      ?? null,
  };
}

export function buildAttention(input: {
  task: CoreTaskRecord;
  latestRun: CoreRunRecord | null;
  workflowSummary: CoreWorkflowSummary | null;
  recovery: CoreTaskRecoveryView;
  latestWorkflowRecommendation: CoreTaskControlPlaneWorkflowRecommendationView | null;
  family: CoreTaskInspectionFamilyView;
}): CoreTaskControlPlaneAttention {
  const reasons: CoreTaskControlPlaneReason[] = [];

  if (input.task.approval.status === 'pending') {
    reasons.push('approval_pending');
  }
  if (input.latestRun?.status === 'failed') {
    reasons.push('run_failed');
  } else if (input.latestRun?.status === 'blocked') {
    reasons.push('run_blocked');
  }
  if (input.recovery.canRetry) {
    reasons.push('retry_available');
  }
  if (
    input.latestWorkflowRecommendation?.reviewRequired
    || input.workflowSummary?.reviewRequired
  ) {
    reasons.push('workflow_review_required');
  }
  if (input.family.childCount > 0 && !input.family.allChildrenTerminal) {
    reasons.push('child_tasks_in_progress');
  }

  let severity: CoreTaskControlPlaneSeverity = 'muted';
  if (reasons.includes('run_failed')) {
    severity = 'error';
  } else if (
    reasons.includes('approval_pending')
    || reasons.includes('run_blocked')
    || reasons.includes('retry_available')
    || reasons.includes('workflow_review_required')
  ) {
    severity = 'attention';
  } else if (reasons.includes('child_tasks_in_progress')) {
    severity = 'progress';
  } else if (input.latestRun?.status === 'running') {
    severity = 'progress';
  } else if (input.task.status === 'completed') {
    severity = 'success';
  }

  return {
    severity,
    reasons,
    needsOperatorAttention: severity === 'attention' || severity === 'error',
  };
}

export function hasGovernanceSignal(summary: CoreGovernanceSummary | null): boolean {
  if (!summary) {
    return false;
  }

  return summary.approval.pending
    || summary.approval.requiresOwnerDecision
    || summary.approval.latestDecisionAction !== null
    || summary.delivery !== null
    || summary.budget !== null
    || summary.runtimeDeliveryManifest !== null
    || summary.latestOperatorAction !== null;
}

export function hasVisibleControlPlaneSignal(view: CoreTaskControlPlaneView): boolean {
  return view.attention.severity !== 'muted'
    || view.approvalActions.length > 0
    || view.incidentActions.length > 0
    || view.latestWorkflowRecommendation !== null
    || view.workflowSummary !== null
    || view.recovery.recoveryRequired
    || hasGovernanceSignal(view.governanceSummary);
}

export function compareControlPlaneViews(
  left: CoreTaskControlPlaneView,
  right: CoreTaskControlPlaneView,
): number {
  const leftTimestamp = left.recovery.latestActivity?.createdAt
    ?? left.recovery.workflowContinuationReplay?.replayAttemptAt
    ?? left.recovery.dispatchReplay?.replayAttemptAt
    ?? left.recovery.pendingDispatch?.replayAttemptAt
    ?? left.lastUpdatedAt;
  const rightTimestamp = right.recovery.latestActivity?.createdAt
    ?? right.recovery.workflowContinuationReplay?.replayAttemptAt
    ?? right.recovery.dispatchReplay?.replayAttemptAt
    ?? right.recovery.pendingDispatch?.replayAttemptAt
    ?? right.lastUpdatedAt;

  const severityRank = (value: CoreTaskControlPlaneSeverity): number => {
    switch (value) {
      case 'error':
        return 4;
      case 'attention':
        return 3;
      case 'progress':
        return 2;
      case 'success':
        return 1;
      case 'muted':
      default:
        return 0;
    }
  };

  const severityDiff = severityRank(right.attention.severity) - severityRank(left.attention.severity);
  if (severityDiff !== 0) {
    return severityDiff;
  }

  return rightTimestamp.localeCompare(leftTimestamp);
}

export function matchesControlPlaneListOptions(
  view: CoreTaskControlPlaneView,
  options: CoreTaskControlPlaneListOptions,
): boolean {
  if (!matchesCoreTaskViewCommonQuery(view, options)) {
    return false;
  }

  const executionProduct = readExecutionProduct(view);
  if (
    options.executionProducts?.length
    && (!executionProduct || !options.executionProducts.includes(executionProduct))
  ) {
    return false;
  }

  const requestedStrategy = readRequestedStrategy(view);
  if (
    options.requestedStrategies?.length
    && (!requestedStrategy || !options.requestedStrategies.includes(requestedStrategy))
  ) {
    return false;
  }

  if (
    options.severities?.length
    && !options.severities.includes(view.attention.severity)
  ) {
    return false;
  }

  if (
    options.reasons?.length
    && !view.attention.reasons.some((reason) => options.reasons?.includes(reason))
  ) {
    return false;
  }

  if (
    options.needsOperatorAttention !== undefined
    && options.needsOperatorAttention !== null
    && view.attention.needsOperatorAttention !== options.needsOperatorAttention
  ) {
    return false;
  }

  if (
    options.nextActions?.length
    && !view.nextActions.some((action) => options.nextActions?.includes(action.kind))
  ) {
    return false;
  }

  if (
    options.deliveryModes?.length
    && (!view.runtimeDeliveryIntent?.mode || !options.deliveryModes.includes(view.runtimeDeliveryIntent.mode))
  ) {
    return false;
  }

  if (
    options.deliveryActions?.length
    && !view.runtimeDeliveryIntent?.requestedActions.some((action) =>
      options.deliveryActions?.includes(action))
  ) {
    return false;
  }

  if (
    options.workflowStageIds?.length
    && !options.workflowStageIds.includes(
      view.workflowContinuation?.stageId
      ?? view.runtimeDeliveryIntent?.workflowStageId
      ?? view.workflowSummary?.stageId
      ?? '',
    )
  ) {
    return false;
  }

  const workflowShape = readEffectiveWorkflowShape(view);
  if (
    options.workflowShapes?.length
    && (!workflowShape || !options.workflowShapes.includes(workflowShape))
  ) {
    return false;
  }

  if (
    options.workflowReviewRequired !== undefined
    && options.workflowReviewRequired !== null
    && readEffectiveWorkflowReviewRequired(view) !== options.workflowReviewRequired
  ) {
    return false;
  }

  if (
    options.workflowConvergeTargetIds?.length
    && !options.workflowConvergeTargetIds.includes(
      readEffectiveWorkflowConvergeTargetId(view) ?? '',
    )
  ) {
    return false;
  }

  if (
    options.sourceMessageIds?.length
    && !options.sourceMessageIds.includes(view.workflowContinuation?.sourceMessageId ?? '')
  ) {
    return false;
  }

  if (
    options.sourceTurnIds?.length
    && !options.sourceTurnIds.includes(view.workflowContinuation?.sourceTurnId ?? '')
  ) {
    return false;
  }

  if (
    options.sourceLaneIds?.length
    && !options.sourceLaneIds.includes(view.workflowContinuation?.sourceLaneId ?? '')
  ) {
    return false;
  }

  if (
    options.sourceAssistantTurnIds?.length
    && !options.sourceAssistantTurnIds.includes(
      view.workflowContinuation?.sourceAssistantTurnId ?? '',
    )
  ) {
    return false;
  }

  const continuationSource = readContinuationSource(view.workflowContinuation?.continuationSource);
  if (
    options.workflowContinuationSources?.length
    && (!continuationSource
      || !options.workflowContinuationSources.includes(continuationSource))
  ) {
    return false;
  }

  if (
    options.workflowContinuationBlockedReasons?.length
    && (!view.workflowContinuation?.blockedReason
      || !options.workflowContinuationBlockedReasons.includes(
        view.workflowContinuation.blockedReason,
      ))
  ) {
    return false;
  }

  const unresolvedTargets = readEffectiveWorkflowUnresolvedTargets(view);
  if (
    options.workflowUnresolvedTargets?.length
    && !unresolvedTargets.some((target) => options.workflowUnresolvedTargets?.includes(target))
  ) {
    return false;
  }

  if (
    options.hasUnresolvedWorkflowTargets !== undefined
    && options.hasUnresolvedWorkflowTargets !== null
    && (unresolvedTargets.length > 0) !== options.hasUnresolvedWorkflowTargets
  ) {
    return false;
  }

  const latestReplaySource = readLatestReplaySource(view);
  if (
    options.latestReplaySources?.length
    && (!latestReplaySource || !options.latestReplaySources.includes(latestReplaySource))
  ) {
    return false;
  }

  const latestReplayTrigger = readLatestReplayTrigger(view);
  if (
    options.latestReplayTriggers?.length
    && (!latestReplayTrigger || !options.latestReplayTriggers.includes(latestReplayTrigger))
  ) {
    return false;
  }

  const latestReplayPhase = readLatestReplayPhase(view);
  if (
    options.latestReplayPhases?.length
    && (!latestReplayPhase || !options.latestReplayPhases.includes(latestReplayPhase))
  ) {
    return false;
  }

  const latestReplayResumeReason = readLatestReplayResumeReason(view);
  if (
    options.latestReplayResumeReasons?.length
    && (!latestReplayResumeReason
      || !options.latestReplayResumeReasons.includes(latestReplayResumeReason))
  ) {
    return false;
  }

  if (
    options.latestTimelineCategories?.length
    && (!view.latestTimelineItem?.category
      || !options.latestTimelineCategories.includes(view.latestTimelineItem.category))
  ) {
    return false;
  }

  if (
    options.latestTimelineKinds?.length
    && (!view.latestTimelineItem?.kind
      || !options.latestTimelineKinds.includes(view.latestTimelineItem.kind))
  ) {
    return false;
  }

  if (
    options.rootTaskIds?.length
    && !options.rootTaskIds.includes(view.family.rootTaskId)
  ) {
    return false;
  }

  if (
    options.parentTaskIds?.length
    && !options.parentTaskIds.includes(view.family.parent?.taskId ?? '')
  ) {
    return false;
  }

  if (
    options.hasChildren !== undefined
    && options.hasChildren !== null
    && (view.family.childCount > 0) !== options.hasChildren
  ) {
    return false;
  }

  if (
    options.hasActiveChildren !== undefined
    && options.hasActiveChildren !== null
    && (view.family.childCount > 0 && !view.family.allChildrenTerminal) !== options.hasActiveChildren
  ) {
    return false;
  }

  return true;
}
