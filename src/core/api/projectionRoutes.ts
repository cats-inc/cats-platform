import { buildActorWorkloadProjection } from '../actorWorkloadProjection.js';
import { buildManagedWorkProjection } from '../managedWorkProjection.js';
import { buildMissionRunProjection } from '../missionRunProjection.js';
import { buildTransportStateProjection } from '../transportStateProjection.js';
import {
  readActorWorkloadProjectionQuery,
  readManagedWorkProjectionQuery,
  readMissionRunProjectionQuery,
  readTransportStateProjectionQuery,
} from './queryFilters.js';
import { handleCoreError } from './shared.js';
import type { CoreApiRouteContext } from './types.js';
import { sendJson, sendMethodNotAllowed } from '../../shared/http.js';

async function handleCoreManagedWork(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  const query = readManagedWorkProjectionQuery(context.url.searchParams);
  sendJson(context.response, 200, buildManagedWorkProjection(core, query));
}

async function handleCoreActorWorkload(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  const query = readActorWorkloadProjectionQuery(context.url.searchParams);
  sendJson(context.response, 200, buildActorWorkloadProjection(core, query));
}

async function handleCoreMissionRuns(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  const query = readMissionRunProjectionQuery(context.url.searchParams);
  sendJson(context.response, 200, buildMissionRunProjection(core, query));
}

async function handleCoreTransportState(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  const query = readTransportStateProjectionQuery(context.url.searchParams);
  sendJson(context.response, 200, buildTransportStateProjection(core, query));
}

export async function routeCoreProjectionApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/core/managed-work') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    try {
      await handleCoreManagedWork(context);
    } catch (error) {
      handleCoreError(context, error);
    }
    return true;
  }

  if (context.url.pathname === '/api/core/actor-workload') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    try {
      await handleCoreActorWorkload(context);
    } catch (error) {
      handleCoreError(context, error);
    }
    return true;
  }

  if (context.url.pathname === '/api/core/mission-runs') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    try {
      await handleCoreMissionRuns(context);
    } catch (error) {
      handleCoreError(context, error);
    }
    return true;
  }

  if (context.url.pathname === '/api/core/transport-state') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    try {
      await handleCoreTransportState(context);
    } catch (error) {
      handleCoreError(context, error);
    }
    return true;
  }

  return false;
}
