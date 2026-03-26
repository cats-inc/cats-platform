import {
  listCoreTaskControlPlaneViews,
  type CoreTaskControlPlaneAttention,
  type CoreTaskControlPlaneNextAction,
  type CoreTaskControlPlaneWorkflowRecommendationView,
} from './taskControlPlane.js';
import type { CatsCoreState, CoreTaskRecord } from './types.js';
import { buildCoreTaskTimelineView, type CoreTaskTimelineItem } from './taskTimeline.js';
import type { CoreTaskRecoveryView } from './recovery.js';

export interface CoreOperatorInboxItem {
  taskId: string;
  conversationId: string | null;
  taskTitle: string;
  taskStatus: CoreTaskRecord['status'];
  summary: string | null;
  attention: CoreTaskControlPlaneAttention;
  nextActions: CoreTaskControlPlaneNextAction[];
  latestRunId: string | null;
  latestCheckpointId: string | null;
  latestOutcomeId: string | null;
  latestWorkflowRecommendation: CoreTaskControlPlaneWorkflowRecommendationView | null;
  recovery: CoreTaskRecoveryView;
  latestTimelineItem: CoreTaskTimelineItem | null;
}

function compareInboxItems(left: CoreOperatorInboxItem, right: CoreOperatorInboxItem): number {
  const severityRank = (value: CoreTaskControlPlaneAttention['severity']): number => {
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

  const leftTimestamp = left.latestTimelineItem?.timestamp ?? '';
  const rightTimestamp = right.latestTimelineItem?.timestamp ?? '';
  const timestampDiff = rightTimestamp.localeCompare(leftTimestamp);
  if (timestampDiff !== 0) {
    return timestampDiff;
  }

  return left.taskId.localeCompare(right.taskId);
}

function hasOperatorActionableSignal(item: CoreOperatorInboxItem): boolean {
  return item.attention.needsOperatorAttention
    || item.nextActions.some((action) => action.action !== null)
    || item.recovery.recoveryRequired;
}

export function listCoreOperatorInboxItems(
  core: CatsCoreState,
): CoreOperatorInboxItem[] {
  const items: CoreOperatorInboxItem[] = [];

  for (const controlPlane of listCoreTaskControlPlaneViews(core)) {
    const task = core.tasks.find((candidate) => candidate.id === controlPlane.taskId);
    if (!task) {
      continue;
    }

    const timeline = buildCoreTaskTimelineView(core, task);
    const latestTimelineItem = timeline.items[0] ?? null;

    items.push({
      taskId: task.id,
      conversationId: task.conversationId,
      taskTitle: task.title,
      taskStatus: task.status,
      summary: latestTimelineItem?.summary ?? task.summary,
      attention: controlPlane.attention,
      nextActions: controlPlane.nextActions,
      latestRunId: controlPlane.latestRunId,
      latestCheckpointId: controlPlane.latestCheckpointId,
      latestOutcomeId: controlPlane.latestOutcomeId,
      latestWorkflowRecommendation: controlPlane.latestWorkflowRecommendation,
      recovery: controlPlane.recovery,
      latestTimelineItem,
    });
  }

  return items
    .filter(hasOperatorActionableSignal)
    .sort(compareInboxItems);
}
