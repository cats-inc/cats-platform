import type {
  CatsCoreState,
  CoreActivityRecord,
  CoreApprovalBindingRecord,
  CoreArtifactRecord,
  CoreOrchestrationOutcomeRecord,
  CoreTaskRecord,
} from './types.js';

export const CORE_STRUCTURED_OUTPUT_KINDS = [
  'mutation',
  'artifact',
  'reference',
  'execution_result',
  'governance_event',
] as const;

export type CoreStructuredOutputKind = (typeof CORE_STRUCTURED_OUTPUT_KINDS)[number];

export const CORE_STRUCTURED_OUTPUT_LIFECYCLES = [
  'proposed',
  'applied',
  'superseded',
  'rejected',
  'informational',
] as const;

export type CoreStructuredOutputLifecycle =
  (typeof CORE_STRUCTURED_OUTPUT_LIFECYCLES)[number];

export type CoreStructuredOutputSourceKind =
  | 'artifact'
  | 'outcome'
  | 'approval_binding'
  | 'activity'
  | 'reference';

export interface CoreStructuredOutputItem {
  id: string;
  kind: CoreStructuredOutputKind;
  lifecycle: CoreStructuredOutputLifecycle;
  sourceKind: CoreStructuredOutputSourceKind;
  sourceId: string;
  taskId: string;
  workItemId: string | null;
  conversationId: string | null;
  runId: string | null;
  recordedAt: string;
  title: string;
  summary: string | null;
  payload: Record<string, unknown>;
}

export interface CoreStructuredOutputSummary {
  total: number;
  mutation: number;
  artifact: number;
  reference: number;
  execution_result: number;
  governance_event: number;
  proposed: number;
  applied: number;
  superseded: number;
  rejected: number;
  informational: number;
}

export interface CoreTaskStructuredOutputView {
  taskId: string;
  summary: CoreStructuredOutputSummary;
  outputs: CoreStructuredOutputItem[];
}

function buildEmptySummary(): CoreStructuredOutputSummary {
  return {
    total: 0,
    mutation: 0,
    artifact: 0,
    reference: 0,
    execution_result: 0,
    governance_event: 0,
    proposed: 0,
    applied: 0,
    superseded: 0,
    rejected: 0,
    informational: 0,
  };
}

function compareOutputs(
  left: CoreStructuredOutputItem,
  right: CoreStructuredOutputItem,
): number {
  const recordedComparison = right.recordedAt.localeCompare(left.recordedAt);
  if (recordedComparison !== 0) {
    return recordedComparison;
  }
  return left.id.localeCompare(right.id);
}

function mapArtifactLifecycle(
  artifact: CoreArtifactRecord,
): CoreStructuredOutputLifecycle {
  if (artifact.status === 'draft') {
    return 'proposed';
  }
  if (artifact.status === 'archived') {
    return 'superseded';
  }
  return 'applied';
}

function mapOutcomeLifecycle(
  outcome: CoreOrchestrationOutcomeRecord,
): CoreStructuredOutputLifecycle {
  if (outcome.status === 'succeeded') {
    return 'applied';
  }
  if (outcome.status === 'failed' || outcome.status === 'cancelled') {
    return 'rejected';
  }
  return 'informational';
}

function mapApprovalBindingLifecycle(
  core: CatsCoreState,
  approvalBinding: CoreApprovalBindingRecord,
): CoreStructuredOutputLifecycle {
  const approvalTask = core.tasks.find((task) => task.id === approvalBinding.approvalTaskId) ?? null;
  const approvalStatus = approvalTask?.approval.status ?? 'not_requested';

  if (approvalStatus === 'pending') {
    return 'proposed';
  }
  if (approvalStatus === 'approved') {
    return 'applied';
  }
  if (approvalStatus === 'rejected') {
    return 'rejected';
  }
  return 'informational';
}

function mapActivityKind(
  activity: CoreActivityRecord,
): CoreStructuredOutputKind | null {
  if (
    activity.kind === 'work_item_updated'
    || activity.kind === 'status_change'
    || activity.kind === 'operator_action'
  ) {
    return 'mutation';
  }
  if (
    activity.kind === 'approval_requested'
    || activity.kind === 'approval_decided'
  ) {
    return 'governance_event';
  }
  return null;
}

function buildReferenceOutputs(
  core: CatsCoreState,
  task: CoreTaskRecord,
): CoreStructuredOutputItem[] {
  const outputs: CoreStructuredOutputItem[] = [];
  const linkedWorkItem = core.workItems.find((workItem) => workItem.taskId === task.id) ?? null;
  const linkedConversation = task.conversationId
    ? core.conversations.find((conversation) => conversation.id === task.conversationId) ?? null
    : null;
  const linkedProject = linkedWorkItem?.projectId
    ? core.projects.find((project) => project.id === linkedWorkItem.projectId) ?? null
    : null;

  if (linkedConversation) {
    outputs.push({
      id: `structured-reference-conversation-${linkedConversation.id}`,
      kind: 'reference',
      lifecycle: 'informational',
      sourceKind: 'reference',
      sourceId: linkedConversation.id,
      taskId: task.id,
      workItemId: linkedWorkItem?.id ?? null,
      conversationId: linkedConversation.id,
      runId: null,
      recordedAt: linkedConversation.updatedAt,
      title: linkedConversation.title,
      summary: `Linked ${linkedConversation.kind} conversation`,
      payload: {
        targetKind: 'conversation',
        conversationId: linkedConversation.id,
        conversationKind: linkedConversation.kind,
        containerId: linkedConversation.containerId,
      },
    });
  }

  if (linkedWorkItem) {
    outputs.push({
      id: `structured-reference-work-item-${linkedWorkItem.id}`,
      kind: 'reference',
      lifecycle: 'informational',
      sourceKind: 'reference',
      sourceId: linkedWorkItem.id,
      taskId: task.id,
      workItemId: linkedWorkItem.id,
      conversationId: linkedWorkItem.conversationId,
      runId: null,
      recordedAt: linkedWorkItem.updatedAt,
      title: linkedWorkItem.title,
      summary: 'Linked managed work item',
      payload: {
        targetKind: 'work_item',
        workItemId: linkedWorkItem.id,
        status: linkedWorkItem.status,
      },
    });
  }

  if (linkedProject) {
    outputs.push({
      id: `structured-reference-project-${linkedProject.id}`,
      kind: 'reference',
      lifecycle: 'informational',
      sourceKind: 'reference',
      sourceId: linkedProject.id,
      taskId: task.id,
      workItemId: linkedWorkItem?.id ?? null,
      conversationId: task.conversationId,
      runId: null,
      recordedAt: linkedProject.updatedAt,
      title: linkedProject.title,
      summary: 'Linked project context',
      payload: {
        targetKind: 'project',
        projectId: linkedProject.id,
        status: linkedProject.status,
      },
    });
  }

  return outputs;
}

export function buildCoreTaskStructuredOutputView(
  core: CatsCoreState,
  task: CoreTaskRecord,
): CoreTaskStructuredOutputView {
  const linkedWorkItem = core.workItems.find((workItem) => workItem.taskId === task.id) ?? null;
  const artifactOutputs = core.artifacts
    .filter((artifact) => artifact.taskId === task.id)
    .map<CoreStructuredOutputItem>((artifact) => ({
      id: `structured-artifact-${artifact.id}`,
      kind: 'artifact',
      lifecycle: mapArtifactLifecycle(artifact),
      sourceKind: 'artifact',
      sourceId: artifact.id,
      taskId: task.id,
      workItemId: artifact.workItemId ?? linkedWorkItem?.id ?? null,
      conversationId: artifact.conversationId ?? task.conversationId,
      runId: artifact.runId,
      recordedAt: artifact.updatedAt,
      title: artifact.title,
      summary: artifact.summary,
      payload: {
        artifactId: artifact.id,
        artifactKind: artifact.kind,
        status: artifact.status,
        path: artifact.path,
        mimeType: artifact.mimeType,
      },
    }));
  const outcomeOutputs = core.outcomes
    .filter((outcome) => outcome.taskId === task.id)
    .map<CoreStructuredOutputItem>((outcome) => ({
      id: `structured-outcome-${outcome.id}`,
      kind: 'execution_result',
      lifecycle: mapOutcomeLifecycle(outcome),
      sourceKind: 'outcome',
      sourceId: outcome.id,
      taskId: task.id,
      workItemId: linkedWorkItem?.id ?? null,
      conversationId: outcome.conversationId ?? task.conversationId,
      runId: outcome.runId,
      recordedAt: outcome.updatedAt,
      title: outcome.title,
      summary: outcome.summary,
      payload: {
        outcomeId: outcome.id,
        status: outcome.status,
      },
    }));
  const approvalBindingOutputs = core.approvalBindings
    .filter((approvalBinding) => approvalBinding.approvalTaskId === task.id)
    .map<CoreStructuredOutputItem>((approvalBinding) => ({
      id: `structured-governance-${approvalBinding.id}`,
      kind: 'governance_event',
      lifecycle: mapApprovalBindingLifecycle(core, approvalBinding),
      sourceKind: 'approval_binding',
      sourceId: approvalBinding.id,
      taskId: task.id,
      workItemId: approvalBinding.workItemId ?? linkedWorkItem?.id ?? null,
      conversationId: approvalBinding.conversationId ?? task.conversationId,
      runId: null,
      recordedAt: approvalBinding.updatedAt,
      title: `Approval gate: ${approvalBinding.kind}`,
      summary: `Bound to ${approvalBinding.subjectKind} ${approvalBinding.subjectId}`,
      payload: {
        approvalBindingId: approvalBinding.id,
        bindingKind: approvalBinding.kind,
        subjectKind: approvalBinding.subjectKind,
        subjectId: approvalBinding.subjectId,
      },
    }));
  const activityOutputs = core.activities
    .filter((activity) => activity.taskId === task.id)
    .map<CoreStructuredOutputItem | null>((activity) => {
      const kind = mapActivityKind(activity);
      if (!kind) {
        return null;
      }

      return {
        id: `structured-activity-${activity.id}`,
        kind,
        lifecycle: 'informational',
        sourceKind: 'activity',
        sourceId: activity.id,
        taskId: task.id,
        workItemId: activity.workItemId ?? linkedWorkItem?.id ?? null,
        conversationId: activity.conversationId ?? task.conversationId,
        runId: activity.runId,
        recordedAt: activity.createdAt,
        title: activity.kind,
        summary: activity.message,
        payload: {
          activityId: activity.id,
          activityKind: activity.kind,
          artifactId: activity.artifactId,
        },
      };
    })
    .filter((output): output is CoreStructuredOutputItem => output !== null);
  const referenceOutputs = buildReferenceOutputs(core, task);

  const outputs = [
    ...artifactOutputs,
    ...outcomeOutputs,
    ...approvalBindingOutputs,
    ...activityOutputs,
    ...referenceOutputs,
  ].sort(compareOutputs);

  const summary = outputs.reduce<CoreStructuredOutputSummary>((accumulator, output) => {
    accumulator.total += 1;
    accumulator[output.kind] += 1;
    accumulator[output.lifecycle] += 1;
    return accumulator;
  }, buildEmptySummary());

  return {
    taskId: task.id,
    summary,
    outputs,
  };
}
