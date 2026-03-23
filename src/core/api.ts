import {
  CoreApiError,
  CoreValidationError,
} from './errors.js';
import type { CoreStore } from './store.js';
import type {
  CoreActivityKind,
  CoreApprovalDecisionAction,
  CoreApprovalBindingKind,
  CoreApprovalBindingSubjectKind,
  CoreApprovalStatus,
  CoreArtifactKind,
  CoreArtifactStatus,
  CoreCheckpointStatus,
  CoreOrchestrationOutcomeStatus,
  CoreProjectStatus,
  CoreRecordMetadata,
  CoreRunStatus,
  CoreOperatorActionKind,
  CoreTaskStatus,
  CoreTraceKind,
  CoreWorkItemStatus,
} from './types.js';
import type { RouteContext } from '../shared/http.js';
import {
  appendCoreActivity,
  appendCoreTrace,
  buildApprovalQueue,
  patchOwnerProfile,
  upsertCoreApprovalBinding,
  upsertCoreArtifact,
  upsertCoreCheckpoint,
  upsertCoreOutcome,
  upsertCoreProject,
  upsertCoreRun,
  upsertCoreTask,
  upsertCoreWorkItem,
  writeApprovalDecision,
} from './model.js';
import {
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
} from '../shared/http.js';

export interface CoreApiDependencies {
  chatStore: Pick<CoreStore, 'readCore' | 'writeCore'>;
}

const CORE_TASK_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'in_progress',
  'blocked',
  'completed',
  'cancelled',
  'archived',
] as const satisfies readonly CoreTaskStatus[];

const CORE_APPROVAL_STATUSES = [
  'not_requested',
  'pending',
  'approved',
  'rejected',
] as const satisfies readonly CoreApprovalStatus[];

const CORE_RUN_STATUSES = [
  'queued',
  'running',
  'blocked',
  'completed',
  'failed',
  'cancelled',
] as const satisfies readonly CoreRunStatus[];

const CORE_TRACE_KINDS = [
  'note',
  'status',
  'dispatch',
  'approval',
  'checkpoint',
  'outcome',
  'error',
] as const satisfies readonly CoreTraceKind[];

const CORE_CHECKPOINT_STATUSES = [
  'open',
  'completed',
  'cancelled',
] as const satisfies readonly CoreCheckpointStatus[];

const CORE_OUTCOME_STATUSES = [
  'succeeded',
  'blocked',
  'failed',
  'cancelled',
] as const satisfies readonly CoreOrchestrationOutcomeStatus[];

const CORE_PROJECT_STATUSES = [
  'planned',
  'active',
  'paused',
  'archived',
] as const satisfies readonly CoreProjectStatus[];

const CORE_WORK_ITEM_STATUSES = [
  'draft',
  'planned',
  'ready',
  'in_progress',
  'blocked',
  'completed',
  'cancelled',
  'archived',
] as const satisfies readonly CoreWorkItemStatus[];

const CORE_ARTIFACT_KINDS = [
  'document',
  'report',
  'build',
  'preview',
  'attachment',
  'transcript_export',
  'dataset',
] as const satisfies readonly CoreArtifactKind[];

const CORE_ARTIFACT_STATUSES = [
  'draft',
  'ready',
  'published',
  'archived',
] as const satisfies readonly CoreArtifactStatus[];

const CORE_ACTIVITY_KINDS = [
  'note',
  'status_change',
  'approval_requested',
  'approval_decided',
  'operator_action',
  'artifact_recorded',
  'checkpoint_recorded',
  'work_item_updated',
] as const satisfies readonly CoreActivityKind[];

const CORE_APPROVAL_ACTIONS = [
  'approve',
  'reroute',
  'reject',
] as const satisfies readonly CoreApprovalDecisionAction[];

const CORE_OPERATOR_ACTIONS = [
  'retry',
  'acknowledge',
] as const satisfies readonly CoreOperatorActionKind[];

const CORE_APPROVAL_BINDING_KINDS = [
  'owner_decision',
  'review_gate',
  'release_gate',
] as const satisfies readonly CoreApprovalBindingKind[];

const CORE_APPROVAL_BINDING_SUBJECT_KINDS = [
  'project',
  'work_item',
  'task',
  'run',
  'artifact',
  'conversation',
] as const satisfies readonly CoreApprovalBindingSubjectKind[];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CoreValidationError(`${fieldName} is required`);
  }

  return value;
}

function readOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new CoreValidationError(`${fieldName} must be a string`);
  }

  return value;
}

function readNullableString(
  value: unknown,
  fieldName: string,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new CoreValidationError(`${fieldName} must be a string or null`);
  }

  return value;
}

function readNullableNumber(
  value: unknown,
  fieldName: string,
): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CoreValidationError(`${fieldName} must be a number or null`);
  }
  if (value < 0) {
    throw new CoreValidationError(
      `${fieldName} must be a non-negative number or null`,
      'bad_request',
    );
  }

  return value;
}

function readStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new CoreValidationError(`${fieldName} must be an array of strings`);
  }

  return value;
}

function readMetadata(
  value: unknown,
  fieldName: string,
): CoreRecordMetadata | undefined {
  if (value === undefined) {
    return undefined;
  }

  const metadata = asRecord(value);
  if (!metadata) {
    throw new CoreValidationError(`${fieldName} must be an object`);
  }

  return metadata;
}

function readEnumValue<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): T | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new CoreValidationError(
      `${fieldName} must be one of: ${allowed.join(', ')}`,
    );
  }

  return value as T;
}

async function readObjectBody(
  context: RouteContext<CoreApiDependencies>,
): Promise<Record<string, unknown>> {
  const body = await readJsonBody<unknown>(context.request);
  const record = asRecord(body);
  if (!record) {
    throw new CoreValidationError('Request body must be a JSON object');
  }

  return record;
}

async function readWrappedBody(
  context: RouteContext<CoreApiDependencies>,
  key: string,
): Promise<Record<string, unknown>> {
  const body = await readObjectBody(context);
  const wrapped = asRecord(body[key]);
  if (!wrapped) {
    throw new CoreValidationError(`${key} payload is required`);
  }

  return wrapped;
}

function sendCoreError(
  context: RouteContext<CoreApiDependencies>,
  statusCode: number,
  code: string,
  message: string,
): void {
  sendJson(context.response, statusCode, {
    error: {
      code,
      message,
    },
  });
}

function handleCoreError(
  context: RouteContext<CoreApiDependencies>,
  error: unknown,
): void {
  if (error instanceof CoreApiError) {
    sendCoreError(context, error.statusCode, error.code, error.message);
    return;
  }

  if (error instanceof SyntaxError) {
    sendCoreError(context, 400, 'invalid_json', 'Request body must be valid JSON');
    return;
  }

  sendCoreError(context, 500, 'internal_error', 'Internal server error');
}

async function handleCoreState(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  sendJson(context.response, 200, await context.dependencies.chatStore.readCore());
}

async function handleCoreActors(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { actors: core.actors });
}

async function handleCoreConversations(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { conversations: core.conversations });
}

async function handleCoreProjects(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { projects: core.projects });
}

async function handleCoreProjectWrite(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  try {
    const project = await readWrappedBody(context, 'project');
    const next = upsertCoreProject(
      await context.dependencies.chatStore.readCore(),
      {
        id: readOptionalString(project.id, 'project.id'),
        title: readRequiredString(project.title, 'project.title'),
        status: readEnumValue(
          project.status,
          'project.status',
          CORE_PROJECT_STATUSES,
        ),
        ownerActorId: readOptionalString(project.ownerActorId, 'project.ownerActorId'),
        summary: readNullableString(project.summary, 'project.summary'),
        repoPath: readNullableString(project.repoPath, 'project.repoPath'),
        primaryConversationId: readNullableString(
          project.primaryConversationId,
          'project.primaryConversationId',
        ),
        createdAt: readOptionalString(project.createdAt, 'project.createdAt'),
        metadata: readMetadata(project.metadata, 'project.metadata'),
      },
    );
    const persisted = await context.dependencies.chatStore.writeCore(next.core);
    const persistedProject = persisted.projects.find(
      (candidate) => candidate.id === next.project.id,
    );

    sendJson(context.response, next.created ? 201 : 200, {
      project: persistedProject ?? next.project,
      created: next.created,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

async function handleCoreWorkItems(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { workItems: core.workItems });
}

async function handleCoreWorkItemWrite(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  try {
    const workItem = await readWrappedBody(context, 'workItem');
    const next = upsertCoreWorkItem(
      await context.dependencies.chatStore.readCore(),
      {
        id: readOptionalString(workItem.id, 'workItem.id'),
        title: readRequiredString(workItem.title, 'workItem.title'),
        status: readEnumValue(
          workItem.status,
          'workItem.status',
          CORE_WORK_ITEM_STATUSES,
        ),
        projectId: readNullableString(workItem.projectId, 'workItem.projectId'),
        conversationId: readNullableString(
          workItem.conversationId,
          'workItem.conversationId',
        ),
        taskId: readNullableString(workItem.taskId, 'workItem.taskId'),
        parentWorkItemId: readNullableString(
          workItem.parentWorkItemId,
          'workItem.parentWorkItemId',
        ),
        ownerActorId: readOptionalString(workItem.ownerActorId, 'workItem.ownerActorId'),
        assignedActorIds: readStringArray(
          workItem.assignedActorIds,
          'workItem.assignedActorIds',
        ),
        summary: readNullableString(workItem.summary, 'workItem.summary'),
        createdAt: readOptionalString(workItem.createdAt, 'workItem.createdAt'),
        metadata: readMetadata(workItem.metadata, 'workItem.metadata'),
      },
    );
    const persisted = await context.dependencies.chatStore.writeCore(next.core);
    const persistedWorkItem = persisted.workItems.find(
      (candidate) => candidate.id === next.workItem.id,
    );

    sendJson(context.response, next.created ? 201 : 200, {
      workItem: persistedWorkItem ?? next.workItem,
      created: next.created,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

async function handleCoreTasks(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { tasks: core.tasks });
}

async function handleCoreTaskWrite(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  try {
    const task = await readWrappedBody(context, 'task');
    const approval = asRecord(task.approval);
    const next = upsertCoreTask(
      await context.dependencies.chatStore.readCore(),
      {
        id: readOptionalString(task.id, 'task.id'),
        title: readRequiredString(task.title, 'task.title'),
        status: readEnumValue(task.status, 'task.status', CORE_TASK_STATUSES),
        conversationId: readNullableString(task.conversationId, 'task.conversationId'),
        ownerActorId: readOptionalString(task.ownerActorId, 'task.ownerActorId'),
        orchestratorActorId: readNullableString(
          task.orchestratorActorId,
          'task.orchestratorActorId',
        ),
        assignedActorIds: readStringArray(task.assignedActorIds, 'task.assignedActorIds'),
        summary: readNullableString(task.summary, 'task.summary'),
        approval: approval
          ? {
              status: readEnumValue(
                approval.status,
                'task.approval.status',
                CORE_APPROVAL_STATUSES,
              ),
              requestedAt: readNullableString(
                approval.requestedAt,
                'task.approval.requestedAt',
              ),
              decidedAt: readNullableString(
                approval.decidedAt,
                'task.approval.decidedAt',
              ),
              decidedByActorId: readNullableString(
                approval.decidedByActorId,
                'task.approval.decidedByActorId',
              ),
              decisionAction: readEnumValue(
                approval.decisionAction,
                'task.approval.decisionAction',
                CORE_APPROVAL_ACTIONS,
              ),
              notes: readNullableString(approval.notes, 'task.approval.notes'),
            }
          : undefined,
        createdAt: readOptionalString(task.createdAt, 'task.createdAt'),
        metadata: readMetadata(task.metadata, 'task.metadata'),
      },
    );
    const persisted = await context.dependencies.chatStore.writeCore(next.core);
    const persistedTask = persisted.tasks.find((candidate) => candidate.id === next.task.id);

    sendJson(
      context.response,
      next.created ? 201 : 200,
      {
        task: persistedTask ?? next.task,
        created: next.created,
      },
    );
  } catch (error) {
    handleCoreError(context, error);
  }
}

async function handleCoreRuns(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { runs: core.runs });
}

async function handleCoreRunWrite(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  try {
    const run = await readWrappedBody(context, 'run');
    const next = upsertCoreRun(
      await context.dependencies.chatStore.readCore(),
      {
        id: readOptionalString(run.id, 'run.id'),
        title: readRequiredString(run.title, 'run.title'),
        status: readEnumValue(run.status, 'run.status', CORE_RUN_STATUSES),
        conversationId: readNullableString(run.conversationId, 'run.conversationId'),
        taskId: readNullableString(run.taskId, 'run.taskId'),
        parentRunId: readNullableString(run.parentRunId, 'run.parentRunId'),
        orchestratorActorId: readNullableString(
          run.orchestratorActorId,
          'run.orchestratorActorId',
        ),
        traceId: readNullableString(run.traceId, 'run.traceId'),
        summary: readNullableString(run.summary, 'run.summary'),
        createdAt: readOptionalString(run.createdAt, 'run.createdAt'),
        startedAt: readNullableString(run.startedAt, 'run.startedAt'),
        completedAt: readNullableString(run.completedAt, 'run.completedAt'),
        metadata: readMetadata(run.metadata, 'run.metadata'),
      },
    );
    const persisted = await context.dependencies.chatStore.writeCore(next.core);
    const persistedRun = persisted.runs.find((candidate) => candidate.id === next.run.id);

    sendJson(
      context.response,
      next.created ? 201 : 200,
      {
        run: persistedRun ?? next.run,
        created: next.created,
      },
    );
  } catch (error) {
    handleCoreError(context, error);
  }
}

async function handleCoreTraces(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { traces: core.traces });
}

async function handleCoreTraceWrite(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  try {
    const trace = await readWrappedBody(context, 'trace');
    const next = appendCoreTrace(
      await context.dependencies.chatStore.readCore(),
      {
        id: readOptionalString(trace.id, 'trace.id'),
        traceId: readRequiredString(trace.traceId, 'trace.traceId'),
        kind: readEnumValue(trace.kind, 'trace.kind', CORE_TRACE_KINDS) ?? 'note',
        conversationId: readNullableString(trace.conversationId, 'trace.conversationId'),
        runId: readNullableString(trace.runId, 'trace.runId'),
        taskId: readNullableString(trace.taskId, 'trace.taskId'),
        actorId: readNullableString(trace.actorId, 'trace.actorId'),
        message: readRequiredString(trace.message, 'trace.message'),
        createdAt: readOptionalString(trace.createdAt, 'trace.createdAt'),
        metadata: readMetadata(trace.metadata, 'trace.metadata'),
      },
    );
    const persisted = await context.dependencies.chatStore.writeCore(next.core);
    const persistedTrace = persisted.traces.find((candidate) => candidate.id === next.trace.id);

    sendJson(
      context.response,
      next.created ? 201 : 200,
      {
        trace: persistedTrace ?? next.trace,
        created: next.created,
      },
    );
  } catch (error) {
    handleCoreError(context, error);
  }
}

async function handleCoreCheckpoints(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { checkpoints: core.checkpoints });
}

async function handleCoreCheckpointWrite(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  try {
    const checkpoint = await readWrappedBody(context, 'checkpoint');
    const next = upsertCoreCheckpoint(
      await context.dependencies.chatStore.readCore(),
      {
        id: readOptionalString(checkpoint.id, 'checkpoint.id'),
        label: readRequiredString(checkpoint.label, 'checkpoint.label'),
        status: readEnumValue(
          checkpoint.status,
          'checkpoint.status',
          CORE_CHECKPOINT_STATUSES,
        ),
        conversationId: readNullableString(
          checkpoint.conversationId,
          'checkpoint.conversationId',
        ),
        runId: readNullableString(checkpoint.runId, 'checkpoint.runId'),
        taskId: readNullableString(checkpoint.taskId, 'checkpoint.taskId'),
        sourceTraceId: readNullableString(
          checkpoint.sourceTraceId,
          'checkpoint.sourceTraceId',
        ),
        summary: readNullableString(checkpoint.summary, 'checkpoint.summary'),
        createdAt: readOptionalString(checkpoint.createdAt, 'checkpoint.createdAt'),
        completedAt: readNullableString(checkpoint.completedAt, 'checkpoint.completedAt'),
        metadata: readMetadata(checkpoint.metadata, 'checkpoint.metadata'),
      },
    );
    const persisted = await context.dependencies.chatStore.writeCore(next.core);
    const persistedCheckpoint = persisted.checkpoints.find(
      (candidate) => candidate.id === next.checkpoint.id,
    );

    sendJson(
      context.response,
      next.created ? 201 : 200,
      {
        checkpoint: persistedCheckpoint ?? next.checkpoint,
        created: next.created,
      },
    );
  } catch (error) {
    handleCoreError(context, error);
  }
}

async function handleCoreOutcomes(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { outcomes: core.outcomes });
}

async function handleCoreOutcomeWrite(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  try {
    const outcome = await readWrappedBody(context, 'outcome');
    const next = upsertCoreOutcome(
      await context.dependencies.chatStore.readCore(),
      {
        id: readOptionalString(outcome.id, 'outcome.id'),
        title: readRequiredString(outcome.title, 'outcome.title'),
        status: readEnumValue(outcome.status, 'outcome.status', CORE_OUTCOME_STATUSES),
        conversationId: readNullableString(
          outcome.conversationId,
          'outcome.conversationId',
        ),
        runId: readNullableString(outcome.runId, 'outcome.runId'),
        taskId: readNullableString(outcome.taskId, 'outcome.taskId'),
        summary: readNullableString(outcome.summary, 'outcome.summary'),
        recordedAt: readOptionalString(outcome.recordedAt, 'outcome.recordedAt'),
        metadata: readMetadata(outcome.metadata, 'outcome.metadata'),
      },
    );
    const persisted = await context.dependencies.chatStore.writeCore(next.core);
    const persistedOutcome = persisted.outcomes.find(
      (candidate) => candidate.id === next.outcome.id,
    );

    sendJson(
      context.response,
      next.created ? 201 : 200,
      {
        outcome: persistedOutcome ?? next.outcome,
        created: next.created,
      },
    );
  } catch (error) {
    handleCoreError(context, error);
  }
}

async function handleCoreArtifacts(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { artifacts: core.artifacts });
}

async function handleCoreArtifactWrite(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  try {
    const artifact = await readWrappedBody(context, 'artifact');
    const next = upsertCoreArtifact(
      await context.dependencies.chatStore.readCore(),
      {
        id: readOptionalString(artifact.id, 'artifact.id'),
        title: readRequiredString(artifact.title, 'artifact.title'),
        kind: readEnumValue(artifact.kind, 'artifact.kind', CORE_ARTIFACT_KINDS),
        status: readEnumValue(
          artifact.status,
          'artifact.status',
          CORE_ARTIFACT_STATUSES,
        ),
        projectId: readNullableString(artifact.projectId, 'artifact.projectId'),
        workItemId: readNullableString(artifact.workItemId, 'artifact.workItemId'),
        conversationId: readNullableString(
          artifact.conversationId,
          'artifact.conversationId',
        ),
        taskId: readNullableString(artifact.taskId, 'artifact.taskId'),
        runId: readNullableString(artifact.runId, 'artifact.runId'),
        path: readNullableString(artifact.path, 'artifact.path'),
        mimeType: readNullableString(artifact.mimeType, 'artifact.mimeType'),
        sizeBytes: readNullableNumber(artifact.sizeBytes, 'artifact.sizeBytes'),
        summary: readNullableString(artifact.summary, 'artifact.summary'),
        createdAt: readOptionalString(artifact.createdAt, 'artifact.createdAt'),
        metadata: readMetadata(artifact.metadata, 'artifact.metadata'),
      },
    );
    const persisted = await context.dependencies.chatStore.writeCore(next.core);
    const persistedArtifact = persisted.artifacts.find(
      (candidate) => candidate.id === next.artifact.id,
    );

    sendJson(context.response, next.created ? 201 : 200, {
      artifact: persistedArtifact ?? next.artifact,
      created: next.created,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

async function handleCoreActivities(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { activities: core.activities });
}

async function handleCoreActivityWrite(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  try {
    const activity = await readWrappedBody(context, 'activity');
    const next = appendCoreActivity(
      await context.dependencies.chatStore.readCore(),
      {
        id: readOptionalString(activity.id, 'activity.id'),
        kind:
          readEnumValue(activity.kind, 'activity.kind', CORE_ACTIVITY_KINDS)
          ?? 'note',
        actorId: readNullableString(activity.actorId, 'activity.actorId'),
        projectId: readNullableString(activity.projectId, 'activity.projectId'),
        workItemId: readNullableString(activity.workItemId, 'activity.workItemId'),
        conversationId: readNullableString(
          activity.conversationId,
          'activity.conversationId',
        ),
        taskId: readNullableString(activity.taskId, 'activity.taskId'),
        runId: readNullableString(activity.runId, 'activity.runId'),
        artifactId: readNullableString(activity.artifactId, 'activity.artifactId'),
        message: readRequiredString(activity.message, 'activity.message'),
        createdAt: readOptionalString(activity.createdAt, 'activity.createdAt'),
        metadata: readMetadata(activity.metadata, 'activity.metadata'),
      },
    );
    const persisted = await context.dependencies.chatStore.writeCore(next.core);
    const persistedActivity = persisted.activities.find(
      (candidate) => candidate.id === next.activity.id,
    );

    sendJson(context.response, next.created ? 201 : 200, {
      activity: persistedActivity ?? next.activity,
      created: next.created,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

async function handleCoreApprovalBindings(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { approvalBindings: core.approvalBindings });
}

async function handleCoreApprovalBindingWrite(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  try {
    const approvalBinding = await readWrappedBody(context, 'approvalBinding');
    const next = upsertCoreApprovalBinding(
      await context.dependencies.chatStore.readCore(),
      {
        id: readOptionalString(approvalBinding.id, 'approvalBinding.id'),
        kind: readEnumValue(
          approvalBinding.kind,
          'approvalBinding.kind',
          CORE_APPROVAL_BINDING_KINDS,
        ),
        approvalTaskId: readRequiredString(
          approvalBinding.approvalTaskId,
          'approvalBinding.approvalTaskId',
        ),
        subjectKind:
          readEnumValue(
            approvalBinding.subjectKind,
            'approvalBinding.subjectKind',
            CORE_APPROVAL_BINDING_SUBJECT_KINDS,
          ) ?? 'task',
        subjectId: readRequiredString(
          approvalBinding.subjectId,
          'approvalBinding.subjectId',
        ),
        projectId: readNullableString(
          approvalBinding.projectId,
          'approvalBinding.projectId',
        ),
        workItemId: readNullableString(
          approvalBinding.workItemId,
          'approvalBinding.workItemId',
        ),
        conversationId: readNullableString(
          approvalBinding.conversationId,
          'approvalBinding.conversationId',
        ),
        requestedByActorId: readNullableString(
          approvalBinding.requestedByActorId,
          'approvalBinding.requestedByActorId',
        ),
        requestedForActorId: readOptionalString(
          approvalBinding.requestedForActorId,
          'approvalBinding.requestedForActorId',
        ),
        createdAt: readOptionalString(
          approvalBinding.createdAt,
          'approvalBinding.createdAt',
        ),
        metadata: readMetadata(
          approvalBinding.metadata,
          'approvalBinding.metadata',
        ),
      },
    );
    const persisted = await context.dependencies.chatStore.writeCore(next.core);
    const persistedApprovalBinding = persisted.approvalBindings.find(
      (candidate) => candidate.id === next.approvalBinding.id,
    );

    sendJson(context.response, next.created ? 201 : 200, {
      approvalBinding: persistedApprovalBinding ?? next.approvalBinding,
      created: next.created,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

async function handleCoreApprovals(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { approvals: buildApprovalQueue(core) });
}

function buildApprovalActivityMessage(
  action: CoreApprovalDecisionAction | null,
  status: CoreApprovalStatus,
  taskTitle: string,
): string {
  if (status === 'pending') {
    return `Owner approval requested for "${taskTitle}".`;
  }

  switch (action) {
    case 'approve':
      return `Owner approved "${taskTitle}".`;
    case 'reroute':
      return `Owner requested a reroute for "${taskTitle}".`;
    case 'reject':
    default:
      return `Owner rejected "${taskTitle}".`;
  }
}

function mergeOperatorActionMetadata(
  metadata: CoreRecordMetadata,
  action: CoreOperatorActionKind,
  actorId: string | null,
  nowIso: string,
  notes: string | null,
): CoreRecordMetadata {
  const nextMetadata: CoreRecordMetadata = {
    ...structuredClone(metadata),
    operatorLastAction: action,
    operatorLastActionAt: nowIso,
    operatorLastActionBy: actorId,
    operatorLastActionNotes: notes,
  };
  delete nextMetadata.operatorAcknowledgeNotes;

  if (action === 'acknowledge') {
    nextMetadata.operatorAcknowledgedAt = nowIso;
    nextMetadata.operatorAcknowledgedBy = actorId;
    nextMetadata.operatorAcknowledgedNotes = notes;
  }

  if (action === 'retry') {
    nextMetadata.operatorRetryRequestedAt = nowIso;
    nextMetadata.operatorRetryRequestedBy = actorId;
    nextMetadata.operatorRetryNotes = notes;
  }

  return nextMetadata;
}

async function handleCoreApprovalWrite(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  try {
    const approval = await readObjectBody(context);
    const now = new Date();
    let nextCore = await context.dependencies.chatStore.readCore();
    const next = writeApprovalDecision(
      nextCore,
      {
        taskId: readRequiredString(approval.taskId, 'taskId'),
        status:
          readEnumValue(approval.status, 'status', CORE_APPROVAL_STATUSES)
          ?? 'pending',
        action: readEnumValue(approval.action, 'action', CORE_APPROVAL_ACTIONS),
        requestedByActorId: readNullableString(
          approval.requestedByActorId,
          'requestedByActorId',
        ),
        decidedByActorId: readNullableString(
          approval.decidedByActorId,
          'decidedByActorId',
        ),
        notes: readNullableString(approval.notes, 'notes'),
        taskStatus: readEnumValue(approval.taskStatus, 'taskStatus', CORE_TASK_STATUSES),
      },
      now,
    );
    nextCore = next.core;
    const activity = appendCoreActivity(
      nextCore,
      {
        kind: next.task.approval.status === 'pending'
          ? 'approval_requested'
          : 'approval_decided',
        actorId: next.task.approval.status === 'pending'
          ? next.task.orchestratorActorId
          : next.task.approval.decidedByActorId,
        conversationId: next.task.conversationId,
        taskId: next.task.id,
        runId: null,
        message: buildApprovalActivityMessage(
          next.task.approval.decisionAction,
          next.task.approval.status,
          next.task.title,
        ),
        metadata: {
          source: 'core-approvals',
          action: next.task.approval.decisionAction,
          taskStatus: next.task.status,
        },
      },
      now,
    );
    const persisted = await context.dependencies.chatStore.writeCore(activity.core);
    const persistedTask = persisted.tasks.find((candidate) => candidate.id === next.task.id);
    const queueItem = buildApprovalQueue(persisted).find(
      (candidate) => candidate.taskId === next.task.id,
    ) ?? null;
    const persistedActivity = persisted.activities.find(
      (candidate) => candidate.id === activity.activity.id,
    ) ?? activity.activity;

    sendJson(context.response, 200, {
      task: persistedTask ?? next.task,
      approval: (persistedTask ?? next.task).approval,
      queueItem,
      activity: persistedActivity,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

async function handleCoreOperatorActionWrite(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  try {
    const body = await readObjectBody(context);
    const action = readEnumValue(body.action, 'action', CORE_OPERATOR_ACTIONS);
    if (!action) {
      throw new CoreValidationError('action is required');
    }

    const actorId = readNullableString(body.actorId, 'actorId') ?? null;
    const notes = readNullableString(body.notes, 'notes') ?? null;
    const runId = readNullableString(body.runId, 'runId') ?? null;
    const checkpointId = readNullableString(body.checkpointId, 'checkpointId') ?? null;
    const outcomeId = readNullableString(body.outcomeId, 'outcomeId') ?? null;
    const taskId = readNullableString(body.taskId, 'taskId') ?? null;
    const now = new Date();
    const nowIso = now.toISOString();
    let core = await context.dependencies.chatStore.readCore();

    let conversationId: string | null = null;
    let resolvedTaskId: string | null = taskId;
    let resolvedRunId: string | null = runId;
    let messageSubject = 'the current incident';

    if (runId) {
      const run = core.runs.find((candidate) => candidate.id === runId);
      if (!run) {
        throw new CoreValidationError(`runId not found: ${runId}`, 'run_not_found');
      }
      const updatedRun = upsertCoreRun(
        core,
        {
          ...run,
          metadata: mergeOperatorActionMetadata(run.metadata, action, actorId, nowIso, notes),
        },
        now,
      );
      core = updatedRun.core;
      conversationId = run.conversationId;
      resolvedTaskId = resolvedTaskId ?? run.taskId;
      messageSubject = run.title;
    }

    if (checkpointId) {
      const checkpoint = core.checkpoints.find((candidate) => candidate.id === checkpointId);
      if (!checkpoint) {
        throw new CoreValidationError(
          `checkpointId not found: ${checkpointId}`,
          'checkpoint_not_found',
        );
      }
      const updatedCheckpoint = upsertCoreCheckpoint(
        core,
        {
          ...checkpoint,
          metadata: mergeOperatorActionMetadata(
            checkpoint.metadata,
            action,
            actorId,
            nowIso,
            notes,
          ),
        },
        now,
      );
      core = updatedCheckpoint.core;
      conversationId = conversationId ?? checkpoint.conversationId;
      resolvedTaskId = resolvedTaskId ?? checkpoint.taskId;
      resolvedRunId = resolvedRunId ?? checkpoint.runId;
      messageSubject = checkpoint.label;
    }

    if (outcomeId) {
      const outcome = core.outcomes.find((candidate) => candidate.id === outcomeId);
      if (!outcome) {
        throw new CoreValidationError(
          `outcomeId not found: ${outcomeId}`,
          'outcome_not_found',
        );
      }
      const updatedOutcome = upsertCoreOutcome(
        core,
        {
          ...outcome,
          metadata: mergeOperatorActionMetadata(
            outcome.metadata,
            action,
            actorId,
            nowIso,
            notes,
          ),
        },
        now,
      );
      core = updatedOutcome.core;
      conversationId = conversationId ?? outcome.conversationId;
      resolvedTaskId = resolvedTaskId ?? outcome.taskId;
      resolvedRunId = resolvedRunId ?? outcome.runId;
      messageSubject = outcome.title;
    }

    if (taskId) {
      const task = core.tasks.find((candidate) => candidate.id === taskId);
      if (!task) {
        throw new CoreValidationError(`taskId not found: ${taskId}`, 'task_not_found');
      }
      const updatedTask = upsertCoreTask(
        core,
        {
          ...task,
          metadata: mergeOperatorActionMetadata(task.metadata, action, actorId, nowIso, notes),
        },
        now,
      );
      core = updatedTask.core;
      conversationId = conversationId ?? task.conversationId;
      messageSubject = task.title;
    }

    if (!runId && !checkpointId && !outcomeId && !taskId) {
      throw new CoreValidationError(
        'operator action requires at least one subject id',
        'operator_action_subject_required',
      );
    }

    const activity = appendCoreActivity(
      core,
      {
        kind: 'operator_action',
        actorId,
        conversationId,
        taskId: resolvedTaskId,
        runId: resolvedRunId,
        message: action === 'retry'
          ? `Operator requested a retry for "${messageSubject}".`
          : `Operator acknowledged "${messageSubject}".`,
        metadata: {
          source: 'core-operator-actions',
          action,
          checkpointId,
          outcomeId,
          notes,
        },
      },
      now,
    );
    const persisted = await context.dependencies.chatStore.writeCore(activity.core);
    const persistedActivity = persisted.activities.find(
      (candidate) => candidate.id === activity.activity.id,
    ) ?? activity.activity;

    sendJson(context.response, 200, {
      activity: persistedActivity,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

async function handleOwnerProfile(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { ownerProfile: core.ownerProfile });
}

async function handleOwnerProfileWrite(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  try {
    const body = await readObjectBody(context);
    const next = patchOwnerProfile(
      await context.dependencies.chatStore.readCore(),
      {
        displayName: readOptionalString(body.displayName, 'displayName'),
        avatarColor: readNullableString(body.avatarColor, 'avatarColor'),
        summary: readNullableString(body.summary, 'summary'),
        communicationPreferences: readStringArray(
          body.communicationPreferences,
          'communicationPreferences',
        ),
        decisionPreferences: readStringArray(
          body.decisionPreferences,
          'decisionPreferences',
        ),
        escalationPreferences: readStringArray(
          body.escalationPreferences,
          'escalationPreferences',
        ),
      },
    );
    const persisted = await context.dependencies.chatStore.writeCore(next.core);
    sendJson(context.response, 200, {
      ownerProfile: persisted.ownerProfile,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

export async function routeCoreApi(
  context: RouteContext<CoreApiDependencies>,
): Promise<boolean> {
  if (context.url.pathname === '/api/core') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleCoreState(context);
    return true;
  }

  if (context.url.pathname === '/api/core/actors') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleCoreActors(context);
    return true;
  }

  if (context.url.pathname === '/api/core/conversations') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleCoreConversations(context);
    return true;
  }

  if (context.url.pathname === '/api/core/projects') {
    if (context.method === 'GET') {
      await handleCoreProjects(context);
      return true;
    }
    if (context.method === 'POST') {
      await handleCoreProjectWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  if (context.url.pathname === '/api/core/work-items') {
    if (context.method === 'GET') {
      await handleCoreWorkItems(context);
      return true;
    }
    if (context.method === 'POST') {
      await handleCoreWorkItemWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  if (context.url.pathname === '/api/core/tasks') {
    if (context.method === 'GET') {
      await handleCoreTasks(context);
      return true;
    }
    if (context.method === 'POST') {
      await handleCoreTaskWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  if (context.url.pathname === '/api/core/runs') {
    if (context.method === 'GET') {
      await handleCoreRuns(context);
      return true;
    }
    if (context.method === 'POST') {
      await handleCoreRunWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  if (context.url.pathname === '/api/core/traces') {
    if (context.method === 'GET') {
      await handleCoreTraces(context);
      return true;
    }
    if (context.method === 'POST') {
      await handleCoreTraceWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  if (context.url.pathname === '/api/core/checkpoints') {
    if (context.method === 'GET') {
      await handleCoreCheckpoints(context);
      return true;
    }
    if (context.method === 'POST') {
      await handleCoreCheckpointWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  if (context.url.pathname === '/api/core/outcomes') {
    if (context.method === 'GET') {
      await handleCoreOutcomes(context);
      return true;
    }
    if (context.method === 'POST') {
      await handleCoreOutcomeWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  if (context.url.pathname === '/api/core/artifacts') {
    if (context.method === 'GET') {
      await handleCoreArtifacts(context);
      return true;
    }
    if (context.method === 'POST') {
      await handleCoreArtifactWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  if (context.url.pathname === '/api/core/activities') {
    if (context.method === 'GET') {
      await handleCoreActivities(context);
      return true;
    }
    if (context.method === 'POST') {
      await handleCoreActivityWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  if (context.url.pathname === '/api/core/approval-bindings') {
    if (context.method === 'GET') {
      await handleCoreApprovalBindings(context);
      return true;
    }
    if (context.method === 'POST') {
      await handleCoreApprovalBindingWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  if (context.url.pathname === '/api/core/approvals') {
    if (context.method === 'GET') {
      await handleCoreApprovals(context);
      return true;
    }
    if (context.method === 'POST') {
      await handleCoreApprovalWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  if (context.url.pathname === '/api/core/operator-actions') {
    if (context.method === 'POST') {
      await handleCoreOperatorActionWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['POST']);
    return true;
  }

  if (context.url.pathname === '/api/core/owner-profile') {
    if (context.method === 'GET') {
      await handleOwnerProfile(context);
      return true;
    }
    if (context.method === 'PATCH') {
      await handleOwnerProfileWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'PATCH']);
    return true;
  }

  return false;
}
