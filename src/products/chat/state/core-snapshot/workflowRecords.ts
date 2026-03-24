import { randomUUID } from 'node:crypto';

import type {
  CoreActivityRecord,
  CoreApprovalBindingRecord,
  CoreArtifactRecord,
  CoreCheckpointRecord,
  CoreOrchestrationOutcomeRecord,
  CoreRunRecord,
  CoreTaskRecord,
  CoreTraceRecord,
} from '../../../../core/types.js';
import {
  asRecord,
  normalizeMetadata,
  readNullableString,
  readString,
  readStringArray,
} from './shared.js';

export function normalizeCoreTask(rawTask: unknown): CoreTaskRecord | null {
  const taskRecord = asRecord(rawTask);
  if (!taskRecord) {
    return null;
  }

  const approvalRecord = asRecord(taskRecord.approval);
  const rawStatus = readString(taskRecord.status, 'draft');
  const status = (
    rawStatus === 'draft'
    || rawStatus === 'pending_approval'
    || rawStatus === 'approved'
    || rawStatus === 'in_progress'
    || rawStatus === 'blocked'
    || rawStatus === 'completed'
    || rawStatus === 'cancelled'
    || rawStatus === 'archived'
  )
    ? rawStatus
    : 'draft';
  const rawApprovalStatus = readString(approvalRecord?.status, 'not_requested');
  const approvalStatus = (
    rawApprovalStatus === 'not_requested'
    || rawApprovalStatus === 'pending'
    || rawApprovalStatus === 'approved'
    || rawApprovalStatus === 'rejected'
  )
    ? rawApprovalStatus
    : 'not_requested';
  const rawDecisionAction = readString(approvalRecord?.decisionAction);
  const decisionAction = (
    rawDecisionAction === 'approve'
    || rawDecisionAction === 'reroute'
    || rawDecisionAction === 'reject'
  )
    ? rawDecisionAction
    : null;

  return {
    id: readString(taskRecord.id, randomUUID()),
    title: readString(taskRecord.title, 'Untitled task'),
    status,
    conversationId: readNullableString(taskRecord.conversationId),
    parentTaskId: readNullableString(taskRecord.parentTaskId),
    ownerActorId: readString(taskRecord.ownerActorId),
    orchestratorActorId: readNullableString(taskRecord.orchestratorActorId),
    assignedActorIds: readStringArray(taskRecord.assignedActorIds),
    summary: readNullableString(taskRecord.summary),
    approval: {
      status: approvalStatus,
      requestedAt: readNullableString(approvalRecord?.requestedAt),
      decidedAt: readNullableString(approvalRecord?.decidedAt),
      decidedByActorId: readNullableString(approvalRecord?.decidedByActorId),
      decisionAction,
      notes: readNullableString(approvalRecord?.notes),
    },
    createdAt: readString(taskRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(taskRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(taskRecord.metadata),
  };
}

export function normalizeCoreRun(rawRun: unknown): CoreRunRecord | null {
  const runRecord = asRecord(rawRun);
  if (!runRecord) {
    return null;
  }

  const rawStatus = readString(runRecord.status, 'queued');
  const status = (
    rawStatus === 'queued'
    || rawStatus === 'running'
    || rawStatus === 'blocked'
    || rawStatus === 'completed'
    || rawStatus === 'failed'
    || rawStatus === 'cancelled'
  )
    ? rawStatus
    : 'queued';

  return {
    id: readString(runRecord.id, randomUUID()),
    title: readString(runRecord.title, 'Untitled run'),
    status,
    conversationId: readNullableString(runRecord.conversationId),
    taskId: readNullableString(runRecord.taskId),
    parentRunId: readNullableString(runRecord.parentRunId),
    orchestratorActorId: readNullableString(runRecord.orchestratorActorId),
    traceId: readNullableString(runRecord.traceId),
    summary: readNullableString(runRecord.summary),
    createdAt: readString(runRecord.createdAt, new Date().toISOString()),
    startedAt: readNullableString(runRecord.startedAt),
    completedAt: readNullableString(runRecord.completedAt),
    updatedAt: readString(runRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(runRecord.metadata),
  };
}

export function normalizeCoreTrace(rawTrace: unknown): CoreTraceRecord | null {
  const traceRecord = asRecord(rawTrace);
  if (!traceRecord) {
    return null;
  }

  const rawKind = readString(traceRecord.kind, 'note');
  const kind = (
    rawKind === 'note'
    || rawKind === 'status'
    || rawKind === 'dispatch'
    || rawKind === 'approval'
    || rawKind === 'checkpoint'
    || rawKind === 'outcome'
    || rawKind === 'error'
  )
    ? rawKind
    : 'note';

  return {
    id: readString(traceRecord.id, randomUUID()),
    traceId: readString(traceRecord.traceId),
    kind,
    conversationId: readNullableString(traceRecord.conversationId),
    runId: readNullableString(traceRecord.runId),
    taskId: readNullableString(traceRecord.taskId),
    actorId: readNullableString(traceRecord.actorId),
    message: readString(traceRecord.message),
    createdAt: readString(traceRecord.createdAt, new Date().toISOString()),
    metadata: normalizeMetadata(traceRecord.metadata),
  };
}

export function normalizeCoreCheckpoint(rawCheckpoint: unknown): CoreCheckpointRecord | null {
  const checkpointRecord = asRecord(rawCheckpoint);
  if (!checkpointRecord) {
    return null;
  }

  const rawStatus = readString(checkpointRecord.status, 'open');
  const status = (
    rawStatus === 'open'
    || rawStatus === 'completed'
    || rawStatus === 'cancelled'
  )
    ? rawStatus
    : 'open';

  return {
    id: readString(checkpointRecord.id, randomUUID()),
    label: readString(checkpointRecord.label, 'Checkpoint'),
    status,
    conversationId: readNullableString(checkpointRecord.conversationId),
    runId: readNullableString(checkpointRecord.runId),
    taskId: readNullableString(checkpointRecord.taskId),
    sourceTraceId: readNullableString(checkpointRecord.sourceTraceId),
    summary: readNullableString(checkpointRecord.summary),
    createdAt: readString(checkpointRecord.createdAt, new Date().toISOString()),
    completedAt: readNullableString(checkpointRecord.completedAt),
    updatedAt: readString(checkpointRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(checkpointRecord.metadata),
  };
}

export function normalizeCoreOutcome(rawOutcome: unknown): CoreOrchestrationOutcomeRecord | null {
  const outcomeRecord = asRecord(rawOutcome);
  if (!outcomeRecord) {
    return null;
  }

  const rawStatus = readString(outcomeRecord.status, 'succeeded');
  const status = (
    rawStatus === 'succeeded'
    || rawStatus === 'blocked'
    || rawStatus === 'failed'
    || rawStatus === 'cancelled'
  )
    ? rawStatus
    : 'succeeded';

  return {
    id: readString(outcomeRecord.id, randomUUID()),
    title: readString(outcomeRecord.title, 'Outcome'),
    status,
    conversationId: readNullableString(outcomeRecord.conversationId),
    runId: readNullableString(outcomeRecord.runId),
    taskId: readNullableString(outcomeRecord.taskId),
    summary: readNullableString(outcomeRecord.summary),
    recordedAt: readString(outcomeRecord.recordedAt, new Date().toISOString()),
    updatedAt: readString(outcomeRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(outcomeRecord.metadata),
  };
}

export function normalizeCoreArtifact(rawArtifact: unknown): CoreArtifactRecord | null {
  const artifactRecord = asRecord(rawArtifact);
  if (!artifactRecord) {
    return null;
  }

  const rawKind = readString(artifactRecord.kind, 'document');
  const kind = (
    rawKind === 'document'
    || rawKind === 'report'
    || rawKind === 'build'
    || rawKind === 'preview'
    || rawKind === 'attachment'
    || rawKind === 'transcript_export'
    || rawKind === 'dataset'
  )
    ? rawKind
    : 'document';
  const rawStatus = readString(artifactRecord.status, 'draft');
  const status = (
    rawStatus === 'draft'
    || rawStatus === 'ready'
    || rawStatus === 'published'
    || rawStatus === 'archived'
  )
    ? rawStatus
    : 'draft';

  return {
    id: readString(artifactRecord.id, randomUUID()),
    title: readString(artifactRecord.title, 'Untitled artifact'),
    kind,
    status,
    projectId: readNullableString(artifactRecord.projectId),
    workItemId: readNullableString(artifactRecord.workItemId),
    conversationId: readNullableString(artifactRecord.conversationId),
    taskId: readNullableString(artifactRecord.taskId),
    runId: readNullableString(artifactRecord.runId),
    path: readNullableString(artifactRecord.path),
    mimeType: readNullableString(artifactRecord.mimeType),
    sizeBytes: typeof artifactRecord.sizeBytes === 'number'
      && Number.isFinite(artifactRecord.sizeBytes)
      ? artifactRecord.sizeBytes
      : null,
    summary: readNullableString(artifactRecord.summary),
    createdAt: readString(artifactRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(artifactRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(artifactRecord.metadata),
  };
}

export function normalizeCoreActivity(rawActivity: unknown): CoreActivityRecord | null {
  const activityRecord = asRecord(rawActivity);
  if (!activityRecord) {
    return null;
  }

  const rawKind = readString(activityRecord.kind, 'note');
  const kind = (
    rawKind === 'note'
    || rawKind === 'status_change'
    || rawKind === 'approval_requested'
    || rawKind === 'approval_decided'
    || rawKind === 'operator_action'
    || rawKind === 'artifact_recorded'
    || rawKind === 'checkpoint_recorded'
    || rawKind === 'work_item_updated'
  )
    ? rawKind
    : 'note';

  return {
    id: readString(activityRecord.id, randomUUID()),
    kind,
    actorId: readNullableString(activityRecord.actorId),
    projectId: readNullableString(activityRecord.projectId),
    workItemId: readNullableString(activityRecord.workItemId),
    conversationId: readNullableString(activityRecord.conversationId),
    taskId: readNullableString(activityRecord.taskId),
    runId: readNullableString(activityRecord.runId),
    artifactId: readNullableString(activityRecord.artifactId),
    message: readString(activityRecord.message),
    createdAt: readString(activityRecord.createdAt, new Date().toISOString()),
    metadata: normalizeMetadata(activityRecord.metadata),
  };
}

export function normalizeCoreApprovalBinding(
  rawApprovalBinding: unknown,
): CoreApprovalBindingRecord | null {
  const approvalBindingRecord = asRecord(rawApprovalBinding);
  if (!approvalBindingRecord) {
    return null;
  }

  const rawKind = readString(approvalBindingRecord.kind, 'owner_decision');
  const kind = (
    rawKind === 'owner_decision'
    || rawKind === 'review_gate'
    || rawKind === 'release_gate'
  )
    ? rawKind
    : 'owner_decision';
  const rawSubjectKind = readString(approvalBindingRecord.subjectKind, 'task');
  const subjectKind = (
    rawSubjectKind === 'project'
    || rawSubjectKind === 'work_item'
    || rawSubjectKind === 'task'
    || rawSubjectKind === 'run'
    || rawSubjectKind === 'artifact'
    || rawSubjectKind === 'conversation'
  )
    ? rawSubjectKind
    : 'task';

  return {
    id: readString(approvalBindingRecord.id, randomUUID()),
    kind,
    approvalTaskId: readString(approvalBindingRecord.approvalTaskId),
    subjectKind,
    subjectId: readString(approvalBindingRecord.subjectId),
    projectId: readNullableString(approvalBindingRecord.projectId),
    workItemId: readNullableString(approvalBindingRecord.workItemId),
    conversationId: readNullableString(approvalBindingRecord.conversationId),
    requestedByActorId: readNullableString(approvalBindingRecord.requestedByActorId),
    requestedForActorId: readString(approvalBindingRecord.requestedForActorId),
    createdAt: readString(approvalBindingRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(approvalBindingRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(approvalBindingRecord.metadata),
  };
}
