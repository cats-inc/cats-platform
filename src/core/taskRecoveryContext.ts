import {
  buildRuntimeDeliveryManifestSummary,
  readCoreEffectiveDeliveryPolicy,
  readCoreRuntimeDeliveryManifestSummary,
} from './governance.js';
import {
  buildTaskApprovalActionEnvelope,
  buildTaskOperatorActionEnvelope,
} from './taskActionEnvelopes.js';
import { readString } from './taskRecoveryProjection.js';
import type {
  CoreTaskRecoveryApprovalAction,
  CoreTaskRecoveryContextView,
  CoreTaskRecoveryIncidentAction,
  CoreTaskDispatchReplayView,
  CoreTaskPendingDispatchRecoveryView,
  CoreTaskWorkflowContinuationRecoveryView,
} from './recovery.js';
import type { CoreTaskRecord } from './types.js';

export function buildRecoveryContext(input: {
  task: CoreTaskRecord;
  pendingDispatch: CoreTaskPendingDispatchRecoveryView | null;
  dispatchReplay: CoreTaskDispatchReplayView | null;
  workflowContinuationReplay: CoreTaskWorkflowContinuationRecoveryView | null;
}): CoreTaskRecoveryContextView | null {
  const delivery = readCoreEffectiveDeliveryPolicy(input.task.metadata);
  const manifest = readCoreRuntimeDeliveryManifestSummary(input.task.metadata)
    ?? (delivery
      ? buildRuntimeDeliveryManifestSummary({
          deliveryMode: delivery.mode,
          deliveryGates: delivery.gates,
          channelId:
            input.workflowContinuationReplay?.channelId
            ?? input.dispatchReplay?.channelId
            ?? input.pendingDispatch?.channelId
            ?? readString(input.task.metadata?.channelId),
          conversationId: input.task.conversationId,
          taskId: input.task.id,
          roomMode: readString(input.task.metadata?.roomRoutingMode),
          transport:
            input.dispatchReplay?.transport
            ?? input.pendingDispatch?.transport
            ?? readString(input.task.metadata?.transport),
          workflowStageId:
            input.workflowContinuationReplay?.workflowStageId
            ?? readString(input.task.metadata?.workflowStageId),
          workflowShape:
            input.workflowContinuationReplay?.workflowShape
            ?? readString(input.task.metadata?.workflowShape),
        })
      : null);
  const channelId = input.workflowContinuationReplay?.channelId
    ?? input.dispatchReplay?.channelId
    ?? input.pendingDispatch?.channelId
    ?? manifest?.context.channelId
    ?? null;
  const transport = input.dispatchReplay?.transport
    ?? input.pendingDispatch?.transport
    ?? (() => {
      const value = manifest?.context.transport;
      return value === 'telegram' || value === 'line' || value === 'web'
        ? value
        : null;
    })();
  const workflowStageId = input.workflowContinuationReplay?.workflowStageId
    ?? manifest?.context.workflowStageId
    ?? null;
  const workflowShape = input.workflowContinuationReplay?.workflowShape
    ?? manifest?.context.workflowShape
    ?? null;
  const workflowReviewRequired = input.workflowContinuationReplay?.reviewRequired
    ?? input.task.metadata?.workflowReviewRequired === true;
  const workflowConvergeTargetId = (
    input.workflowContinuationReplay?.workflowShape === 'converge'
    && input.workflowContinuationReplay.targets.length === 1
  )
    ? input.workflowContinuationReplay.targets[0]?.participantId ?? null
    : readString(input.task.metadata?.workflowConvergeTargetId);
  const roomMode = manifest?.context.roomMode ?? null;

  if (
    !delivery
    && !manifest
    && !channelId
    && !transport
    && !workflowStageId
    && !workflowShape
    && !workflowReviewRequired
    && !workflowConvergeTargetId
    && !roomMode
  ) {
    return null;
  }

  return {
    deliveryMode: delivery?.mode ?? null,
    deliverySource: delivery?.source ?? null,
    deliveryGates: [...(delivery?.gates ?? manifest?.gates ?? [])],
    deliveryActions: [...(manifest?.requestedActions ?? [])],
    workflowStageId,
    workflowShape,
    workflowReviewRequired,
    workflowConvergeTargetId,
    channelId,
    transport,
    roomMode,
  };
}

export function buildRecoveryApprovalActions(
  task: CoreTaskRecord,
  canResumeViaApproval: boolean,
): CoreTaskRecoveryApprovalAction[] {
  if (!canResumeViaApproval || task.approval.status !== 'pending') {
    return [];
  }

  return [
    {
      kind: 'approve',
      label: 'Approve',
      description: 'Allow the stored approval-blocked dispatch to resume.',
      action: buildTaskApprovalActionEnvelope(task.id, 'approve'),
    },
    {
      kind: 'reroute',
      label: 'Reroute',
      description: 'Reject the current plan and ask the orchestrator to reroute it.',
      action: buildTaskApprovalActionEnvelope(task.id, 'reroute'),
    },
    {
      kind: 'reject',
      label: 'Reject',
      description: 'Reject the current approval-blocked dispatch without rerouting it.',
      action: buildTaskApprovalActionEnvelope(task.id, 'reject'),
    },
  ];
}

export function buildRecoveryIncidentActions(
  task: CoreTaskRecord,
  canRetry: boolean,
): CoreTaskRecoveryIncidentAction[] {
  if (!canRetry) {
    return [];
  }

  return [
    {
      kind: 'retry',
      label: 'Request Retry',
      description: 'Replay the stored dispatch or workflow continuation through the existing operator seam.',
      action: buildTaskOperatorActionEnvelope({
        action: 'retry',
        taskId: task.id,
        runId: null,
        checkpointId: null,
        outcomeId: null,
      }),
    },
  ];
}
