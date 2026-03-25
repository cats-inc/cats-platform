import type { CoreStore } from '../../../core/store.js';
import {
  buildWorkPlaceholderProjection,
  type WorkPlaceholderProjection,
} from './projection.js';
import {
  sendJson,
  sendMethodNotAllowed,
  type RouteContext,
} from '../../../shared/http.js';

export const WORK_API_SLICE = 'work';

export interface WorkApiDependencies {
  coreStore: CoreStore;
}

export type WorkApiRouteContext = RouteContext<WorkApiDependencies>;

export function createWorkPlaceholderPayload(
  core: Awaited<ReturnType<CoreStore['readCore']>>,
): WorkPlaceholderProjection {
  return buildWorkPlaceholderProjection(core);
}

export async function routeWorkApi(
  context: WorkApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname !== '/api/work') {
    return false;
  }

  if (context.method !== 'GET') {
    sendMethodNotAllowed(context.response, ['GET']);
    return true;
  }

  sendJson(
    context.response,
    200,
    createWorkPlaceholderPayload(await context.dependencies.coreStore.readCore()),
  );
  return true;
}
