import {
  upsertCoreArtifact,
  upsertCoreMission,
  upsertCoreProject,
  upsertCoreWorkItem,
} from '../model/index.js';
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
} from './shared.js';
import { readMissionListQuery } from './queryFilters.js';
import {
  readArtifactListQuery,
  readProjectListQuery,
  readWorkItemListQuery,
} from './queryFilters.js';
import {
  CORE_ARTIFACT_KINDS,
  CORE_ARTIFACT_STATUSES,
  CORE_MISSION_STATUSES,
  CORE_PROJECT_STATUSES,
  CORE_WORK_ITEM_STATUSES,
} from './constants.js';
import type { CoreApiRouteContext } from './types.js';
import { listMissions } from '../missionList.js';
import {
  listArtifacts,
  listProjects,
  listWorkItems,
} from '../planningRecordLists.js';
import { sendJson, sendMethodNotAllowed } from '../../shared/http.js';

async function handleCoreProjects(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  const query = readProjectListQuery(context.url.searchParams);
  sendJson(context.response, 200, { projects: listProjects(core, query) });
}

async function handleCoreProjectWrite(
  context: CoreApiRouteContext,
): Promise<void> {
  try {
    const project = await readWrappedBody(context, 'project');
    const next = upsertCoreProject(
      await context.dependencies.coreStore.readCore(),
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
    const persisted = await context.dependencies.coreStore.writeCore(next.core);
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
  const core = await context.dependencies.coreStore.readCore();
  const query = readWorkItemListQuery(context.url.searchParams);
  sendJson(context.response, 200, { workItems: listWorkItems(core, query) });
}

async function handleCoreMissions(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  const query = readMissionListQuery(context.url.searchParams);
  sendJson(context.response, 200, { missions: listMissions(core, query) });
}

async function handleCoreWorkItemWrite(
  context: CoreApiRouteContext,
): Promise<void> {
  try {
    const workItem = await readWrappedBody(context, 'workItem');
    const next = upsertCoreWorkItem(
      await context.dependencies.coreStore.readCore(),
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
    const persisted = await context.dependencies.coreStore.writeCore(next.core);
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

async function handleCoreMissionWrite(
  context: CoreApiRouteContext,
): Promise<void> {
  try {
    const mission = await readWrappedBody(context, 'mission');
    const next = upsertCoreMission(
      await context.dependencies.coreStore.readCore(),
      {
        id: readOptionalString(mission.id, 'mission.id'),
        managedWorkId: readNullableString(mission.managedWorkId, 'mission.managedWorkId'),
        conversationId: readNullableString(
          mission.conversationId,
          'mission.conversationId',
        ),
        sourceTurnId: readNullableString(mission.sourceTurnId, 'mission.sourceTurnId'),
        sourceLaneId: readNullableString(mission.sourceLaneId, 'mission.sourceLaneId'),
        assignedAgentId: readNullableString(
          mission.assignedAgentId,
          'mission.assignedAgentId',
        ),
        title: readRequiredString(mission.title, 'mission.title'),
        status: readEnumValue(mission.status, 'mission.status', CORE_MISSION_STATUSES),
        summary: readNullableString(mission.summary, 'mission.summary'),
        createdAt: readOptionalString(mission.createdAt, 'mission.createdAt'),
        metadata: readMetadata(mission.metadata, 'mission.metadata'),
      },
    );
    const persisted = await context.dependencies.coreStore.writeCore(next.core);
    const persistedMission = persisted.missions.find(
      (candidate) => candidate.id === next.mission.id,
    );

    sendJson(context.response, next.created ? 201 : 200, {
      mission: persistedMission ?? next.mission,
      created: next.created,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

async function handleCoreArtifacts(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  const query = readArtifactListQuery(context.url.searchParams);
  sendJson(context.response, 200, { artifacts: listArtifacts(core, query) });
}

async function handleCoreArtifactWrite(
  context: CoreApiRouteContext,
): Promise<void> {
  try {
    const artifact = await readWrappedBody(context, 'artifact');
    const next = upsertCoreArtifact(
      await context.dependencies.coreStore.readCore(),
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
    const persisted = await context.dependencies.coreStore.writeCore(next.core);
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
      try {
        await handleCoreProjects(context);
      } catch (error) {
        handleCoreError(context, error);
      }
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
      try {
        await handleCoreWorkItems(context);
      } catch (error) {
        handleCoreError(context, error);
      }
      return true;
    }
    if (context.method === 'POST') {
      await handleCoreWorkItemWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  if (context.url.pathname === '/api/core/missions') {
    if (context.method === 'GET') {
      try {
        await handleCoreMissions(context);
      } catch (error) {
        handleCoreError(context, error);
      }
      return true;
    }
    if (context.method === 'POST') {
      await handleCoreMissionWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  if (context.url.pathname === '/api/core/artifacts') {
    if (context.method === 'GET') {
      try {
        await handleCoreArtifacts(context);
      } catch (error) {
        handleCoreError(context, error);
      }
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
