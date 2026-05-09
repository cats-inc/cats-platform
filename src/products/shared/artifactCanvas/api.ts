import type { CoreStore } from '../../../core/store.js';
import {
  sendJson,
  sendMethodNotAllowed,
  type RouteContext,
} from '../../../shared/http.js';
import {
  canvasSurfaceRouteRegistry,
} from './contracts.js';
import {
  buildArtifactCanvasProjection,
} from './projection.js';
import type { ArtifactCanvasPolicyConfig } from './iframePolicy.js';

export interface ArtifactCanvasApiDependencies {
  coreStore: CoreStore;
  policyConfig?: ArtifactCanvasPolicyConfig;
}

export type ArtifactCanvasApiRouteContext = RouteContext<ArtifactCanvasApiDependencies>;

export async function routeArtifactCanvasApi(
  context: ArtifactCanvasApiRouteContext,
): Promise<boolean> {
  const route = canvasSurfaceRouteRegistry.parseProjectionApiPath(context.url.pathname);
  if (route === null) {
    return false;
  }
  if (context.method !== 'GET') {
    sendMethodNotAllowed(context.response, ['GET']);
    return true;
  }

  const result = buildArtifactCanvasProjection({
    core: await context.dependencies.coreStore.readCore(),
    surface: route.surface,
    artifactId: route.artifactId,
    presentationRequested: route.presentationRequested,
    policyConfig: context.dependencies.policyConfig,
  });
  if (result.status === 'error') {
    sendJson(context.response, result.statusCode, { error: result.error });
    return true;
  }

  sendJson(context.response, 200, result.projection);
  return true;
}
