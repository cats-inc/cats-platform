import {
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
  type RouteContext,
} from '../../../shared/http.js';
import { createWorkExternalBindingDelegate } from '../state/workExternalBindingDelegate.js';
import {
  WORK_EXTERNAL_LINK_ISSUE_TOOL,
  WORK_EXTERNAL_UNLINK_ISSUE_TOOL,
  type WorkExternalLinkIssueInput,
  type WorkExternalUnlinkIssueInput,
} from '../shared/workToolSurface.js';
import { WORK_API_EXTERNAL_BINDINGS_PATH } from '../shared/apiPaths.js';
import type { WorkApiDependencies } from './index.js';

export async function routeWorkExternalBindingApi(
  context: RouteContext<WorkApiDependencies>,
): Promise<boolean> {
  if (context.url.pathname !== WORK_API_EXTERNAL_BINDINGS_PATH) {
    return false;
  }
  if (context.method !== 'POST' && context.method !== 'DELETE') {
    sendMethodNotAllowed(context.response, ['POST', 'DELETE']);
    return true;
  }

  const body = await readJsonBody<Record<string, unknown>>(context.request);
  const core = await context.dependencies.coreStore.readCore();
  const delegate = createWorkExternalBindingDelegate({
    coreStore: context.dependencies.coreStore,
    now: context.dependencies.now,
  });
  const toolName = context.method === 'POST'
    ? WORK_EXTERNAL_LINK_ISSUE_TOOL
    : WORK_EXTERNAL_UNLINK_ISSUE_TOOL;
  const mutationContext = {
    actorRef: core.ownerProfile.actorId,
    actionId: buildExternalBindingActionId(body, toolName),
    runId: 'work-api:external-bindings',
  };
  const result = context.method === 'POST'
    ? await delegate.linkIssue(
      body as unknown as WorkExternalLinkIssueInput,
      mutationContext,
    )
    : await delegate.unlinkIssue(
      body as unknown as WorkExternalUnlinkIssueInput,
      mutationContext,
    );

  if (result.status === 'applied') {
    sendJson(context.response, 200, result.result);
    return true;
  }
  if (result.status === 'pending_approval') {
    sendJson(context.response, 202, result);
    return true;
  }

  sendJson(context.response, 400, {
    error: {
      code: result.error.code,
      message: result.error.message,
      details: result.error.details ?? null,
    },
  });
  return true;
}

function buildExternalBindingActionId(
  input: Record<string, unknown>,
  toolName: string,
): string {
  return [
    'work-api',
    toolName,
    readActionIdPart(input.localKind),
    readActionIdPart(input.localId),
    readActionIdPart(input.provider),
    readActionIdPart(input.externalId),
  ].join(':');
}

function readActionIdPart(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : 'unknown';
}
