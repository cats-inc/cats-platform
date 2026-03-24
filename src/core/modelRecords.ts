import { randomUUID } from 'node:crypto';

import {
  CoreConflictError,
  CoreNotFoundError,
  CoreValidationError,
} from './errors.js';
import { GLOBAL_ORCHESTRATOR_ACTOR_ID } from './actors.js';
import type {
  CoreActivityWriteInput,
  CoreApprovalBindingWriteInput,
  CoreArtifactWriteInput,
  CoreCheckpointWriteInput,
  CoreOutcomeWriteInput,
  CoreProjectWriteInput,
  CoreRunWriteInput,
  CoreTraceWriteInput,
  CoreWorkItemWriteInput,
} from './modelInputs.js';
import {
  normalizeArtifactSizeBytes,
  normalizeMetadata,
  normalizeNullableString,
  normalizeStringArray,
  replaceById,
  touchCoreState,
} from './modelShared.js';
import type {
  CatsCoreState,
  CoreActivityRecord,
  CoreApprovalBindingRecord,
  CoreArtifactRecord,
  CoreCheckpointRecord,
  CoreOrchestrationOutcomeRecord,
  CoreProjectRecord,
  CoreRunRecord,
  CoreTraceRecord,
  CoreWorkItemRecord,
} from './types.js';

export function upsertCoreProject(
  core: CatsCoreState,
  input: CoreProjectWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; project: CoreProjectRecord; created: boolean } {
  const nowIso = now.toISOString();
  const title = input.title.trim();

  if (!title) {
    throw new CoreValidationError('Project title is required', 'project_title_required');
  }

  const projectId = normalizeNullableString(input.id) ?? `project-${randomUUID()}`;
  const existing = core.projects.find((project) => project.id === projectId);
  const project: CoreProjectRecord = {
    id: projectId,
    title,
    status: input.status ?? existing?.status ?? 'planned',
    ownerActorId:
      normalizeNullableString(input.ownerActorId)
      ?? existing?.ownerActorId
      ?? core.ownerProfile.actorId,
    summary:
      input.summary === undefined
        ? existing?.summary ?? null
        : normalizeNullableString(input.summary),
    repoPath:
      input.repoPath === undefined
        ? existing?.repoPath ?? null
        : normalizeNullableString(input.repoPath),
    primaryConversationId:
      input.primaryConversationId === undefined
        ? existing?.primaryConversationId ?? null
        : normalizeNullableString(input.primaryConversationId),
    createdAt: existing?.createdAt ?? input.createdAt ?? nowIso,
    updatedAt: nowIso,
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existing?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.projects, project);

  return {
    core: touchCoreState(
      {
        ...core,
        projects: records,
      },
      nowIso,
    ),
    project,
    created,
  };
}

export function upsertCoreWorkItem(
  core: CatsCoreState,
  input: CoreWorkItemWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; workItem: CoreWorkItemRecord; created: boolean } {
  const nowIso = now.toISOString();
  const title = input.title.trim();

  if (!title) {
    throw new CoreValidationError(
      'Work item title is required',
      'work_item_title_required',
    );
  }

  const workItemId = normalizeNullableString(input.id) ?? `work-item-${randomUUID()}`;
  const existing = core.workItems.find((workItem) => workItem.id === workItemId);
  const workItem: CoreWorkItemRecord = {
    id: workItemId,
    title,
    status: input.status ?? existing?.status ?? 'draft',
    projectId:
      input.projectId === undefined
        ? existing?.projectId ?? null
        : normalizeNullableString(input.projectId),
    conversationId:
      input.conversationId === undefined
        ? existing?.conversationId ?? null
        : normalizeNullableString(input.conversationId),
    taskId:
      input.taskId === undefined
        ? existing?.taskId ?? null
        : normalizeNullableString(input.taskId),
    parentWorkItemId:
      input.parentWorkItemId === undefined
        ? existing?.parentWorkItemId ?? null
        : normalizeNullableString(input.parentWorkItemId),
    ownerActorId:
      normalizeNullableString(input.ownerActorId)
      ?? existing?.ownerActorId
      ?? core.ownerProfile.actorId,
    assignedActorIds:
      input.assignedActorIds === undefined
        ? structuredClone(existing?.assignedActorIds ?? [])
        : normalizeStringArray(input.assignedActorIds),
    summary:
      input.summary === undefined
        ? existing?.summary ?? null
        : normalizeNullableString(input.summary),
    createdAt: existing?.createdAt ?? input.createdAt ?? nowIso,
    updatedAt: nowIso,
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existing?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.workItems, workItem);

  return {
    core: touchCoreState(
      {
        ...core,
        workItems: records,
      },
      nowIso,
    ),
    workItem,
    created,
  };
}

export function upsertCoreRun(
  core: CatsCoreState,
  input: CoreRunWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; run: CoreRunRecord; created: boolean } {
  const nowIso = now.toISOString();
  const title = input.title.trim();

  if (!title) {
    throw new CoreValidationError('Run title is required', 'run_title_required');
  }

  const runId = normalizeNullableString(input.id) ?? `run-${randomUUID()}`;
  const existing = core.runs.find((run) => run.id === runId);
  const run: CoreRunRecord = {
    id: runId,
    title,
    status: input.status ?? existing?.status ?? 'queued',
    conversationId:
      input.conversationId === undefined
        ? existing?.conversationId ?? null
        : normalizeNullableString(input.conversationId),
    taskId:
      input.taskId === undefined
        ? existing?.taskId ?? null
        : normalizeNullableString(input.taskId),
    parentRunId:
      input.parentRunId === undefined
        ? existing?.parentRunId ?? null
        : normalizeNullableString(input.parentRunId),
    orchestratorActorId:
      input.orchestratorActorId === undefined
        ? existing?.orchestratorActorId ?? GLOBAL_ORCHESTRATOR_ACTOR_ID
        : normalizeNullableString(input.orchestratorActorId),
    traceId:
      input.traceId === undefined
        ? existing?.traceId ?? null
        : normalizeNullableString(input.traceId),
    summary:
      input.summary === undefined
        ? existing?.summary ?? null
        : normalizeNullableString(input.summary),
    createdAt: existing?.createdAt ?? input.createdAt ?? nowIso,
    startedAt:
      input.startedAt === undefined
        ? existing?.startedAt ?? null
        : normalizeNullableString(input.startedAt),
    completedAt:
      input.completedAt === undefined
        ? existing?.completedAt ?? null
        : normalizeNullableString(input.completedAt),
    updatedAt: nowIso,
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existing?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.runs, run);

  return {
    core: touchCoreState(
      {
        ...core,
        runs: records,
      },
      nowIso,
    ),
    run,
    created,
  };
}

export function appendCoreTrace(
  core: CatsCoreState,
  input: CoreTraceWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; trace: CoreTraceRecord; created: boolean } {
  const nowIso = now.toISOString();
  const message = input.message.trim();

  if (!message) {
    throw new CoreValidationError('Trace message is required', 'trace_message_required');
  }

  const traceId = input.traceId.trim();
  if (!traceId) {
    throw new CoreValidationError('Trace traceId is required', 'trace_trace_id_required');
  }
  const recordId = normalizeNullableString(input.id) ?? `trace-${randomUUID()}`;
  const existing = core.traces.find((trace) => trace.id === recordId);
  const trace: CoreTraceRecord = {
    id: recordId,
    traceId,
    kind: input.kind,
    conversationId:
      input.conversationId === undefined
        ? existing?.conversationId ?? null
        : normalizeNullableString(input.conversationId),
    runId:
      input.runId === undefined
        ? existing?.runId ?? null
        : normalizeNullableString(input.runId),
    taskId:
      input.taskId === undefined
        ? existing?.taskId ?? null
        : normalizeNullableString(input.taskId),
    actorId:
      input.actorId === undefined
        ? existing?.actorId ?? null
        : normalizeNullableString(input.actorId),
    message,
    createdAt: existing?.createdAt ?? input.createdAt ?? nowIso,
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existing?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.traces, trace);

  return {
    core: touchCoreState(
      {
        ...core,
        traces: records,
      },
      nowIso,
    ),
    trace,
    created,
  };
}

export function upsertCoreCheckpoint(
  core: CatsCoreState,
  input: CoreCheckpointWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; checkpoint: CoreCheckpointRecord; created: boolean } {
  const nowIso = now.toISOString();
  const label = input.label.trim();

  if (!label) {
    throw new CoreValidationError(
      'Checkpoint label is required',
      'checkpoint_label_required',
    );
  }

  const checkpointId = normalizeNullableString(input.id) ?? `checkpoint-${randomUUID()}`;
  const existing = core.checkpoints.find((checkpoint) => checkpoint.id === checkpointId);
  const resolvedStatus = input.status ?? existing?.status ?? 'open';
  const explicitCompletedAt =
    input.completedAt === undefined
      ? undefined
      : normalizeNullableString(input.completedAt);
  if (resolvedStatus !== 'completed' && explicitCompletedAt) {
    throw new CoreValidationError(
      'checkpoint.completedAt can only be set when status is completed',
      'checkpoint_completed_at_invalid',
    );
  }
  const completedAt =
    resolvedStatus === 'completed'
      ? explicitCompletedAt ?? existing?.completedAt ?? nowIso
      : null;
  const checkpoint: CoreCheckpointRecord = {
    id: checkpointId,
    label,
    status: resolvedStatus,
    conversationId:
      input.conversationId === undefined
        ? existing?.conversationId ?? null
        : normalizeNullableString(input.conversationId),
    runId:
      input.runId === undefined
        ? existing?.runId ?? null
        : normalizeNullableString(input.runId),
    taskId:
      input.taskId === undefined
        ? existing?.taskId ?? null
        : normalizeNullableString(input.taskId),
    sourceTraceId:
      input.sourceTraceId === undefined
        ? existing?.sourceTraceId ?? null
        : normalizeNullableString(input.sourceTraceId),
    summary:
      input.summary === undefined
        ? existing?.summary ?? null
        : normalizeNullableString(input.summary),
    createdAt: existing?.createdAt ?? input.createdAt ?? nowIso,
    completedAt,
    updatedAt: nowIso,
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existing?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.checkpoints, checkpoint);

  return {
    core: touchCoreState(
      {
        ...core,
        checkpoints: records,
      },
      nowIso,
    ),
    checkpoint,
    created,
  };
}

export function upsertCoreOutcome(
  core: CatsCoreState,
  input: CoreOutcomeWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; outcome: CoreOrchestrationOutcomeRecord; created: boolean } {
  const nowIso = now.toISOString();
  const title = input.title.trim();

  if (!title) {
    throw new CoreValidationError('Outcome title is required', 'outcome_title_required');
  }

  const outcomeId = normalizeNullableString(input.id) ?? `outcome-${randomUUID()}`;
  const existing = core.outcomes.find((outcome) => outcome.id === outcomeId);
  const outcome: CoreOrchestrationOutcomeRecord = {
    id: outcomeId,
    title,
    status: input.status ?? existing?.status ?? 'succeeded',
    conversationId:
      input.conversationId === undefined
        ? existing?.conversationId ?? null
        : normalizeNullableString(input.conversationId),
    runId:
      input.runId === undefined
        ? existing?.runId ?? null
        : normalizeNullableString(input.runId),
    taskId:
      input.taskId === undefined
        ? existing?.taskId ?? null
        : normalizeNullableString(input.taskId),
    summary:
      input.summary === undefined
        ? existing?.summary ?? null
        : normalizeNullableString(input.summary),
    recordedAt: existing?.recordedAt ?? input.recordedAt ?? nowIso,
    updatedAt: nowIso,
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existing?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.outcomes, outcome);

  return {
    core: touchCoreState(
      {
        ...core,
        outcomes: records,
      },
      nowIso,
    ),
    outcome,
    created,
  };
}

export function upsertCoreArtifact(
  core: CatsCoreState,
  input: CoreArtifactWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; artifact: CoreArtifactRecord; created: boolean } {
  const nowIso = now.toISOString();
  const title = input.title.trim();

  if (!title) {
    throw new CoreValidationError('Artifact title is required', 'artifact_title_required');
  }

  const artifactId = normalizeNullableString(input.id) ?? `artifact-${randomUUID()}`;
  const existing = core.artifacts.find((artifact) => artifact.id === artifactId);
  const artifact: CoreArtifactRecord = {
    id: artifactId,
    title,
    kind: input.kind ?? existing?.kind ?? 'document',
    status: input.status ?? existing?.status ?? 'draft',
    projectId:
      input.projectId === undefined
        ? existing?.projectId ?? null
        : normalizeNullableString(input.projectId),
    workItemId:
      input.workItemId === undefined
        ? existing?.workItemId ?? null
        : normalizeNullableString(input.workItemId),
    conversationId:
      input.conversationId === undefined
        ? existing?.conversationId ?? null
        : normalizeNullableString(input.conversationId),
    taskId:
      input.taskId === undefined
        ? existing?.taskId ?? null
        : normalizeNullableString(input.taskId),
    runId:
      input.runId === undefined
        ? existing?.runId ?? null
        : normalizeNullableString(input.runId),
    path:
      input.path === undefined
        ? existing?.path ?? null
        : normalizeNullableString(input.path),
    mimeType:
      input.mimeType === undefined
        ? existing?.mimeType ?? null
        : normalizeNullableString(input.mimeType),
    sizeBytes:
      input.sizeBytes === undefined
        ? existing?.sizeBytes ?? null
        : normalizeArtifactSizeBytes(input.sizeBytes),
    summary:
      input.summary === undefined
        ? existing?.summary ?? null
        : normalizeNullableString(input.summary),
    createdAt: existing?.createdAt ?? input.createdAt ?? nowIso,
    updatedAt: nowIso,
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existing?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.artifacts, artifact);

  return {
    core: touchCoreState(
      {
        ...core,
        artifacts: records,
      },
      nowIso,
    ),
    artifact,
    created,
  };
}

export function appendCoreActivity(
  core: CatsCoreState,
  input: CoreActivityWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; activity: CoreActivityRecord; created: boolean } {
  const nowIso = now.toISOString();
  const message = input.message.trim();

  if (!message) {
    throw new CoreValidationError(
      'Activity message is required',
      'activity_message_required',
    );
  }

  const activityId = normalizeNullableString(input.id) ?? `activity-${randomUUID()}`;
  const existing = core.activities.find((activity) => activity.id === activityId);
  if (existing) {
    throw new CoreConflictError(
      `Activity already exists: ${activityId}`,
      'activity_already_exists',
    );
  }
  const activity: CoreActivityRecord = {
    id: activityId,
    kind: input.kind,
    actorId: input.actorId === undefined ? null : normalizeNullableString(input.actorId),
    projectId: input.projectId === undefined ? null : normalizeNullableString(input.projectId),
    workItemId:
      input.workItemId === undefined ? null : normalizeNullableString(input.workItemId),
    conversationId:
      input.conversationId === undefined
        ? null
        : normalizeNullableString(input.conversationId),
    taskId: input.taskId === undefined ? null : normalizeNullableString(input.taskId),
    runId: input.runId === undefined ? null : normalizeNullableString(input.runId),
    artifactId:
      input.artifactId === undefined
        ? null
        : normalizeNullableString(input.artifactId),
    message,
    createdAt: input.createdAt ?? nowIso,
    metadata: normalizeMetadata(input.metadata),
  };

  return {
    core: touchCoreState(
      {
        ...core,
        activities: [...core.activities, activity],
      },
      nowIso,
    ),
    activity,
    created: true,
  };
}

export function upsertCoreApprovalBinding(
  core: CatsCoreState,
  input: CoreApprovalBindingWriteInput,
  now: Date = new Date(),
): {
  core: CatsCoreState;
  approvalBinding: CoreApprovalBindingRecord;
  created: boolean;
} {
  const nowIso = now.toISOString();
  const approvalTaskId = input.approvalTaskId.trim();
  const subjectId = input.subjectId.trim();

  if (!approvalTaskId) {
    throw new CoreValidationError(
      'approvalBinding.approvalTaskId is required',
      'approval_binding_task_id_required',
    );
  }

  if (!subjectId) {
    throw new CoreValidationError(
      'approvalBinding.subjectId is required',
      'approval_binding_subject_id_required',
    );
  }
  if (!core.tasks.some((task) => task.id === approvalTaskId)) {
    throw new CoreNotFoundError(
      `Task not found: ${approvalTaskId}`,
      'task_not_found',
    );
  }

  const approvalBindingId =
    normalizeNullableString(input.id) ?? `approval-binding-${randomUUID()}`;
  const existing = core.approvalBindings.find(
    (binding) => binding.id === approvalBindingId,
  );
  const approvalBinding: CoreApprovalBindingRecord = {
    id: approvalBindingId,
    kind: input.kind ?? existing?.kind ?? 'owner_decision',
    approvalTaskId,
    subjectKind: input.subjectKind,
    subjectId,
    projectId:
      input.projectId === undefined
        ? existing?.projectId ?? null
        : normalizeNullableString(input.projectId),
    workItemId:
      input.workItemId === undefined
        ? existing?.workItemId ?? null
        : normalizeNullableString(input.workItemId),
    conversationId:
      input.conversationId === undefined
        ? existing?.conversationId ?? null
        : normalizeNullableString(input.conversationId),
    requestedByActorId:
      input.requestedByActorId === undefined
        ? existing?.requestedByActorId ?? GLOBAL_ORCHESTRATOR_ACTOR_ID
        : normalizeNullableString(input.requestedByActorId),
    requestedForActorId:
      normalizeNullableString(input.requestedForActorId)
      ?? existing?.requestedForActorId
      ?? core.ownerProfile.actorId,
    createdAt: existing?.createdAt ?? input.createdAt ?? nowIso,
    updatedAt: nowIso,
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existing?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.approvalBindings, approvalBinding);

  return {
    core: touchCoreState(
      {
        ...core,
        approvalBindings: records,
      },
      nowIso,
    ),
    approvalBinding,
    created,
  };
}
