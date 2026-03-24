import {
  upsertCoreArtifact,
  upsertCoreProject,
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
  CORE_ARTIFACT_KINDS,
  CORE_ARTIFACT_STATUSES,
  CORE_PROJECT_STATUSES,
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

export async function routeCorePlanningRecordApi(
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

  return false;
}
