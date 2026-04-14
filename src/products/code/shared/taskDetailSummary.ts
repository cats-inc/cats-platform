import {
  createCodeWorkspaceSummary,
  type CodeWorkspaceKind,
  type CodeWorkspaceSummary,
} from './workspaceSummary.js';

export interface CodeTaskDetailRuntimeDeliveryIntentSummary {
  mode: string | null;
  requiresOwnerDecision: boolean;
  approvalPending: boolean;
}

export interface CodeTaskDetailWorkflowContinuationSummary {
  blockedReason: string | null;
  targetNames: string[];
  stageId: string | null;
}

export interface CodeTaskBuilderDetailSummary {
  taskId: string | null;
  title: string | null;
  summary: string | null;
  taskStatus: string | null;
  effectiveStrategy: string | null;
  workspace: CodeWorkspaceSummary | null;
  linkedArtifacts: unknown[];
  runtimeDeliveryIntent: CodeTaskDetailRuntimeDeliveryIntentSummary | null;
  workflowContinuation: CodeTaskDetailWorkflowContinuationSummary | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function readWorkspaceKind(value: unknown): CodeWorkspaceKind | null {
  return value === 'user_selected'
    || value === 'managed_room'
    || value === 'conversation_repo'
    ? value
    : null;
}

function readWorkspaceSummary(value: unknown): CodeWorkspaceSummary | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const workspacePath = readNonEmptyString(record.workspacePath);
  const workspaceKind = readWorkspaceKind(record.workspaceKind);
  if (!workspacePath || !workspaceKind) {
    return null;
  }

  return createCodeWorkspaceSummary({
    workspacePath,
    workspaceKind,
  });
}

export function readCodeTaskBuilderDetail(value: unknown): CodeTaskBuilderDetailSummary {
  const record = asRecord(value);
  const task = asRecord(record?.task);
  const controlPlane = asRecord(record?.controlPlane);
  const runtimeDeliveryIntent = asRecord(controlPlane?.runtimeDeliveryIntent);
  const workflowContinuation = asRecord(controlPlane?.workflowContinuation);

  return {
    taskId: readNonEmptyString(task?.id),
    title: readNonEmptyString(task?.title),
    summary: typeof task?.summary === 'string' ? task.summary : null,
    taskStatus: readNonEmptyString(task?.status),
    effectiveStrategy: readNonEmptyString(record?.effectiveStrategy),
    workspace: readWorkspaceSummary(record?.workspace),
    linkedArtifacts: Array.isArray(record?.linkedArtifacts) ? [...record.linkedArtifacts] : [],
    runtimeDeliveryIntent: runtimeDeliveryIntent
      ? {
          mode: readNonEmptyString(runtimeDeliveryIntent.mode),
          requiresOwnerDecision: readBoolean(runtimeDeliveryIntent.requiresOwnerDecision),
          approvalPending: readBoolean(runtimeDeliveryIntent.approvalPending),
        }
      : null,
    workflowContinuation: workflowContinuation
      ? {
          blockedReason: readNonEmptyString(workflowContinuation.blockedReason),
          targetNames: readStringArray(workflowContinuation.targetNames),
          stageId: readNonEmptyString(workflowContinuation.stageId),
        }
      : null,
  };
}
