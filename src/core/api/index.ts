import { upsertCoreActor } from '../model/index.js';
import { listActors } from '../actorList.js';
import {
  CORE_ACTOR_KINDS,
  CORE_ACTOR_SOURCES,
  CORE_ACTOR_STATUSES,
} from './constants.js';
import {
  handleCoreError,
  readEnumValue,
  readNullableString,
  readOptionalString,
  readRequiredString,
  readStringArray,
  readWrappedBody,
} from './shared.js';
import { readActorListQuery } from './queryFilters.js';
import type { CoreApiRouteContext } from './types.js';
import { routeCoreControlApi } from './controlRoutes.js';
import { routeCoreMemoryMaintenanceApi } from './memoryMaintenanceRoutes.js';
import { routeCoreOperatorInboxApi } from './operatorInboxRoutes.js';
import { routeCoreProjectionApi } from './projectionRoutes.js';
import { routeCoreRecordApi } from './recordRoutes.js';
import { routeCoreTaskApi } from './taskRoutes.js';
import { sendJson, sendMethodNotAllowed } from '../../shared/http.js';

async function handleCoreState(
  context: CoreApiRouteContext,
): Promise<void> {
  sendJson(context.response, 200, await context.dependencies.coreStore.readCore());
}

async function handleCoreActors(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  const query = readActorListQuery(context.url.searchParams);
  sendJson(context.response, 200, { actors: listActors(core, query) });
}

function readExecutionTargetInput(value: unknown): {
  provider?: string;
  instance?: string | null;
  model?: string | null;
} | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('actor.defaultExecutionTarget must be an object or null');
  }

  const target = value as Record<string, unknown>;
  const provider = readNullableString(target.provider, 'actor.defaultExecutionTarget.provider');
  return {
    provider: provider ?? undefined,
    instance: readNullableString(target.instance, 'actor.defaultExecutionTarget.instance'),
    model: readNullableString(target.model, 'actor.defaultExecutionTarget.model'),
  };
}

function readMemoryCheckpointInput(value: unknown): {
  summary?: string | null;
  facts?: string[];
  openLoops?: string[];
  updatedAt?: string | null;
} | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('actor.memory must be an object or null');
  }

  const memory = value as Record<string, unknown>;
  return {
    summary: readNullableString(memory.summary, 'actor.memory.summary'),
    facts: readStringArray(memory.facts, 'actor.memory.facts'),
    openLoops: readStringArray(memory.openLoops, 'actor.memory.openLoops'),
    updatedAt: readNullableString(memory.updatedAt, 'actor.memory.updatedAt'),
  };
}

async function handleCoreActorWrite(
  context: CoreApiRouteContext,
): Promise<void> {
  try {
    const actor = await readWrappedBody(context, 'actor');
    const next = upsertCoreActor(
      await context.dependencies.coreStore.readCore(),
      {
        id: readOptionalString(actor.id, 'actor.id'),
        name: readRequiredString(actor.name, 'actor.name'),
        kind: readEnumValue(actor.kind, 'actor.kind', CORE_ACTOR_KINDS),
        status: readEnumValue(actor.status, 'actor.status', CORE_ACTOR_STATUSES),
        roles: readStringArray(actor.roles, 'actor.roles'),
        skillProfile: readNullableString(actor.skillProfile, 'actor.skillProfile'),
        mcpProfile: readNullableString(actor.mcpProfile, 'actor.mcpProfile'),
        defaultExecutionTarget: readExecutionTargetInput(actor.defaultExecutionTarget),
        memory: readMemoryCheckpointInput(actor.memory),
        source: readEnumValue(actor.source, 'actor.source', CORE_ACTOR_SOURCES),
        sourceId: readNullableString(actor.sourceId, 'actor.sourceId'),
        createdAt: readOptionalString(actor.createdAt, 'actor.createdAt'),
        archivedAt: readNullableString(actor.archivedAt, 'actor.archivedAt'),
      },
    );
    const persisted = await context.dependencies.coreStore.writeCore(next.core);
    const persistedActor = persisted.actors.find((candidate) => candidate.id === next.actor.id);

    sendJson(context.response, next.created ? 201 : 200, {
      actor: persistedActor ?? next.actor,
      created: next.created,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

export async function routeCoreApi(
  context: CoreApiRouteContext,
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
    if (context.method === 'GET') {
      try {
        await handleCoreActors(context);
      } catch (error) {
        handleCoreError(context, error);
      }
      return true;
    }
    if (context.method === 'POST') {
      await handleCoreActorWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  if (await routeCoreRecordApi(context)) {
    return true;
  }

  if (await routeCoreProjectionApi(context)) {
    return true;
  }

  if (await routeCoreMemoryMaintenanceApi(context)) {
    return true;
  }

  if (await routeCoreOperatorInboxApi(context)) {
    return true;
  }

  if (await routeCoreTaskApi(context)) {
    return true;
  }

  if (await routeCoreControlApi(context)) {
    return true;
  }

  return false;
}
