import { buildMissionRunProjection } from '../missionRunProjection.js';
import type { CoreApiRouteContext } from './types.js';
import { sendJson, sendMethodNotAllowed } from '../../shared/http.js';

async function handleCoreMissionRuns(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  sendJson(context.response, 200, buildMissionRunProjection(core));
}

export async function routeCoreProjectionApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/core/mission-runs') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleCoreMissionRuns(context);
    return true;
  }

  return false;
}
