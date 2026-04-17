import { readJsonBody, sendJson, sendMethodNotAllowed, type RouteContext } from '../../shared/http.js';
import {
  enqueueGuideCatAssistRefreshIfRuntimeReachable,
  type ChatApiDependencies,
} from '../../products/chat/api/routeSupport.js';
import {
  parseGuideCatStatusUpdateBody,
  parseGuideCatUpdateBody,
  type GuideCatUpdateBody,
} from './platformSetupRouteSupport.js';
import {
  clearGuideCat,
  updateGuideCatStatus,
  upsertGuideCat,
} from './platformSetupStateMutations.js';
type PlatformSetupContext = RouteContext<ChatApiDependencies>;

async function handleGuideCatUpdate(
  context: PlatformSetupContext,
): Promise<void> {
  let body: GuideCatUpdateBody;
  try {
    body = await readJsonBody<typeof body>(context.request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request body';
    sendJson(context.response, 400, { error: { code: 'bad_request', message } });
    return;
  }
  const parsedBody = parseGuideCatUpdateBody(body);
  if (!parsedBody.ok) {
    sendJson(context.response, 400, {
      error: { code: 'bad_request', message: parsedBody.message },
    });
    return;
  }
  const guideCatUpdate = parsedBody.value;

  const now = context.dependencies.now?.() ?? new Date();
  const nowIso = now.toISOString();
  let core = await context.dependencies.chatStore.readCore();
  const chatState = await context.dependencies.chatStore.read();
  core = upsertGuideCat(core, guideCatUpdate, nowIso);

  await context.dependencies.chatStore.writeSnapshot(chatState, core);
  await enqueueGuideCatAssistRefreshIfRuntimeReachable(context.dependencies, {
    guideCat: core.guideCat,
    ownerDisplayName: core.ownerProfile.displayName,
    now,
  });
  sendJson(context.response, 200, { guideCat: core.guideCat });
}

async function handleGuideCatStatusUpdate(
  context: PlatformSetupContext,
): Promise<void> {
  let body: { status?: string };
  try {
    body = await readJsonBody<typeof body>(context.request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request body';
    sendJson(context.response, 400, { error: { code: 'bad_request', message } });
    return;
  }

  const parsedBody = parseGuideCatStatusUpdateBody(body);
  if (!parsedBody.ok) {
    sendJson(context.response, 400, {
      error: { code: 'bad_request', message: parsedBody.message },
    });
    return;
  }

  const now = context.dependencies.now?.() ?? new Date();
  const nowIso = now.toISOString();
  let core = await context.dependencies.chatStore.readCore();
  const chatState = await context.dependencies.chatStore.read();

  const nextCore = updateGuideCatStatus(core, parsedBody.value, nowIso);
  if (!nextCore) {
    sendJson(context.response, 404, {
      error: { code: 'not_found', message: 'No Guide Cat exists' },
    });
    return;
  }
  core = nextCore;

  await context.dependencies.chatStore.writeSnapshot(chatState, core);
  if (core.guideCat?.status === 'active') {
    await enqueueGuideCatAssistRefreshIfRuntimeReachable(context.dependencies, {
      guideCat: core.guideCat,
      ownerDisplayName: core.ownerProfile.displayName,
      now,
    });
  }
  sendJson(context.response, 200, { guideCat: core.guideCat });
}

async function handleGuideCatDelete(
  context: PlatformSetupContext,
): Promise<void> {
  const now = context.dependencies.now?.() ?? new Date();
  let core = await context.dependencies.chatStore.readCore();
  const chatState = await context.dependencies.chatStore.read();
  core = clearGuideCat(core, now.toISOString());

  await context.dependencies.chatStore.writeSnapshot(chatState, core);
  sendJson(context.response, 200, { guideCat: null });
}

export async function routePlatformGuideCatApi(
  context: PlatformSetupContext,
): Promise<boolean> {
  if (context.url.pathname !== '/api/platform/guide-cat') {
    return false;
  }

  if (context.method === 'PUT') {
    await handleGuideCatUpdate(context);
    return true;
  }
  if (context.method === 'PATCH') {
    await handleGuideCatStatusUpdate(context);
    return true;
  }
  if (context.method === 'DELETE') {
    await handleGuideCatDelete(context);
    return true;
  }
  sendMethodNotAllowed(context.response, ['PUT', 'PATCH', 'DELETE']);
  return true;
}
