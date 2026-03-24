import {
  appendCoreActivity,
  appendCoreTrace,
  upsertCoreApprovalBinding,
  upsertCoreArtifact,
  upsertCoreCheckpoint,
  upsertCoreOutcome,
  upsertCoreProject,
  upsertCoreRun,
  upsertCoreWorkItem,
} from './model.js';
import {
  handleCoreError,
  readEnumValue,
  readMetadata,
  readNullableNumber,
  readNullableString,
  readOptionalString,
  readRequiredString,
  readStringArray,
  readWrappedBody,
} from './apiShared.js';
import {
  CORE_ACTIVITY_KINDS,
  CORE_APPROVAL_BINDING_KINDS,
  CORE_APPROVAL_BINDING_SUBJECT_KINDS,
  CORE_ARTIFACT_KINDS,
  CORE_ARTIFACT_STATUSES,
  CORE_CHECKPOINT_STATUSES,
  CORE_OUTCOME_STATUSES,
  CORE_PROJECT_STATUSES,
  CORE_RUN_STATUSES,
  CORE_TRACE_KINDS,
  CORE_WORK_ITEM_STATUSES,
} from './apiConstants.js';
import type { CoreApiRouteContext } from './apiTypes.js';
import { sendJson, sendMethodNotAllowed } from '../shared/http.js';

async function handleCoreProjects(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { projects: core.projects });
}

async function handleCoreProjectWrite(
  context: CoreApiRouteContext,
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
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { workItems: core.workItems });
}

async function handleCoreWorkItemWrite(
  context: CoreApiRouteContext,
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

async function handleCoreRuns(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { runs: core.runs });
}

async function handleCoreRunWrite(
  context: CoreApiRouteContext,
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
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { traces: core.traces });
}

async function handleCoreTraceWrite(
  context: CoreApiRouteContext,
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
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { checkpoints: core.checkpoints });
}

async function handleCoreCheckpointWrite(
  context: CoreApiRouteContext,
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
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { outcomes: core.outcomes });
}

async function handleCoreOutcomeWrite(
  context: CoreApiRouteContext,
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
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { artifacts: core.artifacts });
}

async function handleCoreArtifactWrite(
  context: CoreApiRouteContext,
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
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { activities: core.activities });
}

async function handleCoreActivityWrite(
  context: CoreApiRouteContext,
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
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { approvalBindings: core.approvalBindings });
}

async function handleCoreApprovalBindingWrite(
  context: CoreApiRouteContext,
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

export async function routeCoreRecordApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
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

  return false;
}
