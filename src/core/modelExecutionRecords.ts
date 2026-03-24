import { randomUUID } from 'node:crypto';

import {
  CoreConflictError,
  CoreValidationError,
} from './errors.js';
import { GLOBAL_ORCHESTRATOR_ACTOR_ID } from './actors.js';
import type {
  CoreActivityWriteInput,
  CoreCheckpointWriteInput,
  CoreOutcomeWriteInput,
  CoreRunWriteInput,
  CoreTraceWriteInput,
} from './modelInputs.js';
import {
  normalizeMetadata,
  normalizeNullableString,
  replaceById,
  touchCoreState,
} from './modelShared.js';
import type {
  CatsCoreState,
  CoreActivityRecord,
  CoreCheckpointRecord,
  CoreOrchestrationOutcomeRecord,
  CoreRunRecord,
  CoreTraceRecord,
} from './types.js';

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
