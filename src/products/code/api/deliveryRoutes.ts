import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import {
  CodeDeliveryProxy,
  type DeliveryCommitInput,
  type DeliveryPushInput,
  type DeliveryRepoStatusInput,
  type DeliveryArtifactExportInput,
} from '../state/deliveryProxy.js';
import type { CodeApiRouteContext } from './index.js';

function createDeliveryProxy(context: CodeApiRouteContext): CodeDeliveryProxy {
  const runtimeBaseUrl = context.dependencies.config.runtimeBaseUrl;
  const apiKey = context.dependencies.config.runtimeApiKey ?? '';
  return new CodeDeliveryProxy(runtimeBaseUrl, apiKey);
}

export async function routeCodeDeliveryApi(
  context: CodeApiRouteContext,
): Promise<boolean> {
  // POST /api/code/delivery/repo/status
  if (context.url.pathname === '/api/code/delivery/repo/status') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }

    let body: DeliveryRepoStatusInput;
    try {
      body = await readJsonBody<DeliveryRepoStatusInput>(context.request);
    } catch {
      sendJson(context.response, 400, {
        error: { code: 'invalid_body', message: 'Request body must be valid JSON.' },
      });
      return true;
    }

    if (!body.workspacePath?.trim()) {
      sendJson(context.response, 400, {
        error: { code: 'missing_workspace', message: 'workspacePath is required.' },
      });
      return true;
    }

    try {
      const proxy = createDeliveryProxy(context);
      const result = await proxy.inspectRepoStatus(body);
      sendJson(context.response, 200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Repo status failed.';
      sendJson(context.response, 502, {
        error: { code: 'delivery_failed', message },
      });
    }
    return true;
  }

  // POST /api/code/delivery/repo/commit
  if (context.url.pathname === '/api/code/delivery/repo/commit') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }

    let body: DeliveryCommitInput;
    try {
      body = await readJsonBody<DeliveryCommitInput>(context.request);
    } catch {
      sendJson(context.response, 400, {
        error: { code: 'invalid_body', message: 'Request body must be valid JSON.' },
      });
      return true;
    }

    if (!body.workspacePath?.trim()) {
      sendJson(context.response, 400, {
        error: { code: 'missing_workspace', message: 'workspacePath is required.' },
      });
      return true;
    }

    try {
      const proxy = createDeliveryProxy(context);
      const result = body.apply
        ? await proxy.applyCommit(body)
        : await proxy.previewCommit(body);
      sendJson(context.response, 200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Commit failed.';
      sendJson(context.response, 502, {
        error: { code: 'delivery_failed', message },
      });
    }
    return true;
  }

  // POST /api/code/delivery/repo/push
  if (context.url.pathname === '/api/code/delivery/repo/push') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }

    let body: DeliveryPushInput;
    try {
      body = await readJsonBody<DeliveryPushInput>(context.request);
    } catch {
      sendJson(context.response, 400, {
        error: { code: 'invalid_body', message: 'Request body must be valid JSON.' },
      });
      return true;
    }

    if (!body.workspacePath?.trim()) {
      sendJson(context.response, 400, {
        error: { code: 'missing_workspace', message: 'workspacePath is required.' },
      });
      return true;
    }

    try {
      const proxy = createDeliveryProxy(context);
      const result = body.apply
        ? await proxy.applyPush(body)
        : await proxy.previewPush(body);
      sendJson(context.response, 200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Push failed.';
      sendJson(context.response, 502, {
        error: { code: 'delivery_failed', message },
      });
    }
    return true;
  }

  // POST /api/code/delivery/artifacts/export
  if (context.url.pathname === '/api/code/delivery/artifacts/export') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }

    let body: DeliveryArtifactExportInput;
    try {
      body = await readJsonBody<DeliveryArtifactExportInput>(context.request);
    } catch {
      sendJson(context.response, 400, {
        error: { code: 'invalid_body', message: 'Request body must be valid JSON.' },
      });
      return true;
    }

    try {
      const proxy = createDeliveryProxy(context);
      const result = await proxy.publishArtifacts(body);
      sendJson(context.response, 200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Artifact export failed.';
      sendJson(context.response, 502, {
        error: { code: 'delivery_failed', message },
      });
    }
    return true;
  }

  return false;
}
