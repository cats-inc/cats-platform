import type { CoreStore } from './store.js';
import type {
  CoreApprovalStatus,
  CoreCheckpointStatus,
  CoreOrchestrationOutcomeStatus,
  CoreRecordMetadata,
  CoreRunStatus,
  CoreTaskStatus,
  CoreTraceKind,
} from './types.js';
import type { RouteContext } from '../shared/http.js';
import {
  appendCoreTrace,
  buildApprovalQueue,
  patchOwnerProfile,
  upsertCoreCheckpoint,
  upsertCoreOutcome,
  upsertCoreRun,
  upsertCoreTask,
  writeApprovalDecision,
} from './model.js';
import {
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
} from '../shared/http.js';

export interface CoreApiDependencies {
  workspaceStore: Pick<CoreStore, 'readCore' | 'writeCore'>;
}

const CORE_TASK_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'in_progress',
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} is required`);
  }

  return value;
}

function readOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
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
    throw new Error(`${fieldName} must be a string or null`);
  }

  return value;
}

function readStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${fieldName} must be an array of strings`);
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
    throw new Error(`${fieldName} must be an object`);
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
    throw new Error(`${fieldName} must be one of: ${allowed.join(', ')}`);
  }

  return value as T;
}

async function readObjectBody(
  context: RouteContext<CoreApiDependencies>,
): Promise<Record<string, unknown>> {
  const body = await readJsonBody<unknown>(context.request);
  const record = asRecord(body);
  if (!record) {
    throw new Error('Request body must be a JSON object');
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
    throw new Error(`${key} payload is required`);
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
  const message = error instanceof Error ? error.message : 'Unknown error';

  if (message.startsWith('Task not found:')) {
    sendCoreError(context, 404, 'task_not_found', message);
    return;
  }

  sendCoreError(context, 400, 'bad_request', message);
}

async function handleCoreState(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  sendJson(context.response, 200, await context.dependencies.workspaceStore.readCore());
}

async function handleCoreActors(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  const core = await context.dependencies.workspaceStore.readCore();
  sendJson(context.response, 200, { actors: core.actors });
}

async function handleCoreConversations(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  const core = await context.dependencies.workspaceStore.readCore();
  sendJson(context.response, 200, { conversations: core.conversations });
}

async function handleCoreTasks(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  const core = await context.dependencies.workspaceStore.readCore();
  sendJson(context.response, 200, { tasks: core.tasks });
}

async function handleCoreTaskWrite(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  try {
    const task = await readWrappedBody(context, 'task');
    const approval = asRecord(task.approval);
    const next = upsertCoreTask(
      await context.dependencies.workspaceStore.readCore(),
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
              notes: readNullableString(approval.notes, 'task.approval.notes'),
            }
          : undefined,
        createdAt: readOptionalString(task.createdAt, 'task.createdAt'),
      },
    );
    const persisted = await context.dependencies.workspaceStore.writeCore(next.core);
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
  const core = await context.dependencies.workspaceStore.readCore();
  sendJson(context.response, 200, { runs: core.runs });
}

async function handleCoreRunWrite(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  try {
    const run = await readWrappedBody(context, 'run');
    const next = upsertCoreRun(
      await context.dependencies.workspaceStore.readCore(),
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
    const persisted = await context.dependencies.workspaceStore.writeCore(next.core);
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
  const core = await context.dependencies.workspaceStore.readCore();
  sendJson(context.response, 200, { traces: core.traces });
}

async function handleCoreTraceWrite(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  try {
    const trace = await readWrappedBody(context, 'trace');
    const next = appendCoreTrace(
      await context.dependencies.workspaceStore.readCore(),
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
    const persisted = await context.dependencies.workspaceStore.writeCore(next.core);
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
  const core = await context.dependencies.workspaceStore.readCore();
  sendJson(context.response, 200, { checkpoints: core.checkpoints });
}

async function handleCoreCheckpointWrite(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  try {
    const checkpoint = await readWrappedBody(context, 'checkpoint');
    const next = upsertCoreCheckpoint(
      await context.dependencies.workspaceStore.readCore(),
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
    const persisted = await context.dependencies.workspaceStore.writeCore(next.core);
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
  const core = await context.dependencies.workspaceStore.readCore();
  sendJson(context.response, 200, { outcomes: core.outcomes });
}

async function handleCoreOutcomeWrite(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  try {
    const outcome = await readWrappedBody(context, 'outcome');
    const next = upsertCoreOutcome(
      await context.dependencies.workspaceStore.readCore(),
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
    const persisted = await context.dependencies.workspaceStore.writeCore(next.core);
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

async function handleCoreApprovals(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  const core = await context.dependencies.workspaceStore.readCore();
  sendJson(context.response, 200, { approvals: buildApprovalQueue(core) });
}

async function handleCoreApprovalWrite(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  try {
    const approval = await readObjectBody(context);
    const next = writeApprovalDecision(
      await context.dependencies.workspaceStore.readCore(),
      {
        taskId: readRequiredString(approval.taskId, 'taskId'),
        status:
          readEnumValue(approval.status, 'status', CORE_APPROVAL_STATUSES)
          ?? 'pending',
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
    );
    const persisted = await context.dependencies.workspaceStore.writeCore(next.core);
    const queueItem = buildApprovalQueue(persisted).find(
      (candidate) => candidate.taskId === next.task.id,
    ) ?? null;

    sendJson(context.response, 200, {
      task: next.task,
      approval: next.task.approval,
      queueItem,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

async function handleOwnerProfile(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  const core = await context.dependencies.workspaceStore.readCore();
  sendJson(context.response, 200, { ownerProfile: core.ownerProfile });
}

async function handleOwnerProfileWrite(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  try {
    const body = await readObjectBody(context);
    const next = patchOwnerProfile(
      await context.dependencies.workspaceStore.readCore(),
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
    const persisted = await context.dependencies.workspaceStore.writeCore(next.core);
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
