import {
  appendCoreActivity,
  appendCoreTrace,
  upsertCoreCheckpoint,
  upsertCoreOutcome,
  upsertCoreRun,
} from '../model/index.js';
import {
  handleCoreError,
  readEnumValue,
  readMetadata,
  readNullableString,
  readOptionalString,
  readRequiredString,
  readWrappedBody,
} from './shared.js';
import {
  readRunListQuery,
  readTraceListQuery,
} from './queryFilters.js';
import {
  CORE_ACTIVITY_KINDS,
  CORE_CHECKPOINT_STATUSES,
  CORE_OUTCOME_STATUSES,
  CORE_RUN_STATUSES,
  CORE_TRACE_KINDS,
} from './constants.js';
import type { CoreApiRouteContext } from './types.js';
import { listRuns, listTraces } from '../executionRecordLists.js';
import { sendJson, sendMethodNotAllowed } from '../../shared/http.js';

async function handleCoreRuns(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  const query = readRunListQuery(context.url.searchParams);
  sendJson(context.response, 200, { runs: listRuns(core, query) });
}

async function handleCoreRunWrite(
  context: CoreApiRouteContext,
): Promise<void> {
  try {
    const run = await readWrappedBody(context, 'run');
    const next = upsertCoreRun(
      await context.dependencies.coreStore.readCore(),
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
    const persisted = await context.dependencies.coreStore.writeCore(next.core);
    const persistedRun = persisted.runs.find((candidate) => candidate.id === next.run.id);

    sendJson(context.response, next.created ? 201 : 200, {
      run: persistedRun ?? next.run,
      created: next.created,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

async function handleCoreTraces(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  const query = readTraceListQuery(context.url.searchParams);
  sendJson(context.response, 200, { traces: listTraces(core, query) });
}

async function handleCoreTraceWrite(
  context: CoreApiRouteContext,
): Promise<void> {
  try {
    const trace = await readWrappedBody(context, 'trace');
    const next = appendCoreTrace(
      await context.dependencies.coreStore.readCore(),
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
    const persisted = await context.dependencies.coreStore.writeCore(next.core);
    const persistedTrace = persisted.traces.find((candidate) => candidate.id === next.trace.id);

    sendJson(context.response, next.created ? 201 : 200, {
      trace: persistedTrace ?? next.trace,
      created: next.created,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

async function handleCoreCheckpoints(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  sendJson(context.response, 200, { checkpoints: core.checkpoints });
}

async function handleCoreCheckpointWrite(
  context: CoreApiRouteContext,
): Promise<void> {
  try {
    const checkpoint = await readWrappedBody(context, 'checkpoint');
    const next = upsertCoreCheckpoint(
      await context.dependencies.coreStore.readCore(),
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
    const persisted = await context.dependencies.coreStore.writeCore(next.core);
    const persistedCheckpoint = persisted.checkpoints.find(
      (candidate) => candidate.id === next.checkpoint.id,
    );

    sendJson(context.response, next.created ? 201 : 200, {
      checkpoint: persistedCheckpoint ?? next.checkpoint,
      created: next.created,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

async function handleCoreOutcomes(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  sendJson(context.response, 200, { outcomes: core.outcomes });
}

async function handleCoreOutcomeWrite(
  context: CoreApiRouteContext,
): Promise<void> {
  try {
    const outcome = await readWrappedBody(context, 'outcome');
    const next = upsertCoreOutcome(
      await context.dependencies.coreStore.readCore(),
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
    const persisted = await context.dependencies.coreStore.writeCore(next.core);
    const persistedOutcome = persisted.outcomes.find(
      (candidate) => candidate.id === next.outcome.id,
    );

    sendJson(context.response, next.created ? 201 : 200, {
      outcome: persistedOutcome ?? next.outcome,
      created: next.created,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

async function handleCoreActivities(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  sendJson(context.response, 200, { activities: core.activities });
}

async function handleCoreActivityWrite(
  context: CoreApiRouteContext,
): Promise<void> {
  try {
    const activity = await readWrappedBody(context, 'activity');
    const next = appendCoreActivity(
      await context.dependencies.coreStore.readCore(),
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
    const persisted = await context.dependencies.coreStore.writeCore(next.core);
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

export async function routeCoreExecutionRecordApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/core/runs') {
    if (context.method === 'GET') {
      try {
        await handleCoreRuns(context);
      } catch (error) {
        handleCoreError(context, error);
      }
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
      try {
        await handleCoreTraces(context);
      } catch (error) {
        handleCoreError(context, error);
      }
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

  return false;
}
