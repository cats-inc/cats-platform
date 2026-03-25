import type { CoreStore } from '../../../core/store.js';
import {
  buildCodePlaceholderProjection,
  type CodePlaceholderProjection,
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

export function createCodePlaceholderPayload(
  core: Awaited<ReturnType<CoreStore['readCore']>>,
): CodePlaceholderProjection {
  return buildCodePlaceholderProjection(core);
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
    createCodePlaceholderPayload(await context.dependencies.coreStore.readCore()),
  );
  return true;
}
