import type { CoreStore } from '../../../core/store.js';
import {
  buildCodeDashboardProjection,
  type CodeDashboardProjection,
} from './projection.js';
import {
  sendJson,
  sendMethodNotAllowed,
  type RouteContext,
} from '../../../shared/http.js';

export const CODE_API_SLICE = 'code';

export interface CodeApiDependencies {
  coreStore: CoreStore;
}

export type CodeApiRouteContext = RouteContext<CodeApiDependencies>;

export function createCodeDashboardPayload(
  core: Awaited<ReturnType<CoreStore['readCore']>>,
): CodeDashboardProjection {
  return buildCodeDashboardProjection(core);
}

export async function routeCodeApi(
  context: CodeApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname !== '/api/code') {
    return false;
  }

  if (context.method !== 'GET') {
    sendMethodNotAllowed(context.response, ['GET']);
    return true;
  }

  sendJson(
    context.response,
    200,
    createCodeDashboardPayload(await context.dependencies.coreStore.readCore()),
  );
  return true;
}
