import { matchRoute, readJsonBody, sendJson, sendMethodNotAllowed } from '../../../../shared/http.js';
import {
  addDurableMemory,
  listDurableMemoryBySubject,
  removeDurableMemory,
  updateDurableMemory,
} from '../../../../core/model/index.js';
import { OWNER_ACTOR_ID } from '../../../../core/actors.js';
import {
  handleRestError,
  sendRestError,
  type ChatApiRouteContext,
} from '../routeSupport.js';
import {
  buildDurableMemoryUpdates,
  buildOwnerMemoryRecord,
  CreateDurableMemoryInput,
  findOwnerMemoryRecord,
  readOptionalFlushBody,
  trySyncCanonicalOwnerMemory,
  UpdateDurableMemoryInput,
  validateCategory,
  validateFlushReason,
} from './shared.js';

async function handleListOwnerMemory(
  context: ChatApiRouteContext,
): Promise<void> {
  try {
    const core = await context.dependencies.chatStore.readCore();
    const records = listDurableMemoryBySubject(core, 'owner', OWNER_ACTOR_ID);
    sendJson(context.response, 200, { records });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleCreateOwnerMemory(
  context: ChatApiRouteContext,
): Promise<void> {
  try {
    const body = await readJsonBody<CreateDurableMemoryInput>(context.request);

    if (!body.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
      sendRestError(context, 400, 'content_required', 'Memory content is required.');
      return;
    }

    if (!validateCategory(body.category)) {
      sendRestError(context, 400, 'invalid_category', 'Invalid memory category.');
      return;
    }

    const record = buildOwnerMemoryRecord(body);
    const core = await context.dependencies.chatStore.readCore();
    const nextCore = addDurableMemory(core, record);
    await context.dependencies.chatStore.writeCore(nextCore);
    await trySyncCanonicalOwnerMemory(context, 'manual');
    sendJson(context.response, 201, { memory: record });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleUpdateOwnerMemory(
  context: ChatApiRouteContext,
  memoryId: string,
): Promise<void> {
  try {
    const core = await context.dependencies.chatStore.readCore();
    if (!findOwnerMemoryRecord(core, memoryId)) {
      sendRestError(context, 404, 'memory_not_found', `Owner memory not found: ${memoryId}`);
      return;
    }
    const body = await readJsonBody<UpdateDurableMemoryInput>(context.request);

    if (body.content !== undefined) {
      if (typeof body.content !== 'string' || body.content.trim().length === 0) {
        sendRestError(context, 400, 'content_required', 'Memory content must be a non-empty string.');
        return;
      }
    }

    if (body.category !== undefined && !validateCategory(body.category)) {
      sendRestError(context, 400, 'invalid_category', 'Invalid memory category.');
      return;
    }

    const nextCore = updateDurableMemory(core, memoryId, buildDurableMemoryUpdates(body));
    await context.dependencies.chatStore.writeCore(nextCore);
    await trySyncCanonicalOwnerMemory(context, 'manual');

    const updated = nextCore.durableMemory.find((record) => record.id === memoryId);
    sendJson(context.response, 200, { memory: updated });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleDeleteOwnerMemory(
  context: ChatApiRouteContext,
  memoryId: string,
): Promise<void> {
  try {
    const core = await context.dependencies.chatStore.readCore();
    if (!findOwnerMemoryRecord(core, memoryId)) {
      sendRestError(context, 404, 'memory_not_found', `Owner memory not found: ${memoryId}`);
      return;
    }
    const nextCore = removeDurableMemory(core, memoryId);
    await context.dependencies.chatStore.writeCore(nextCore);
    await trySyncCanonicalOwnerMemory(context, 'manual');
    sendJson(context.response, 200, { deleted: true, memoryId });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleListCanonicalOwnerMemory(
  context: ChatApiRouteContext,
): Promise<void> {
  try {
    const core = await context.dependencies.chatStore.readCore();
    const records = await context.dependencies.memoryService.listCanonicalRecords({
      subjectKind: 'owner',
      subjectId: core.ownerProfile.actorId,
    });
    sendJson(context.response, 200, { records });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleFlushCanonicalOwnerMemory(
  context: ChatApiRouteContext,
): Promise<void> {
  try {
    const body = await readOptionalFlushBody(context);
    if (!validateFlushReason(body.reason)) {
      sendRestError(context, 400, 'invalid_flush_reason', 'Invalid memory flush reason.');
      return;
    }
    const flush = await context.dependencies.memoryService.flushOwnerProfile({
      reason: body.reason,
      now: context.dependencies.now?.(),
    });
    sendJson(context.response, 200, { flush });
  } catch (error) {
    handleRestError(context, error);
  }
}

export async function routeOwnerMemoryApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/owner/memory/canonical') {
    if (context.method === 'GET') {
      await handleListCanonicalOwnerMemory(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET']);
    return true;
  }

  if (context.url.pathname === '/api/owner/memory/flush') {
    if (context.method === 'POST') {
      await handleFlushCanonicalOwnerMemory(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['POST']);
    return true;
  }

  if (context.url.pathname === '/api/owner/memory') {
    if (context.method === 'GET') {
      await handleListOwnerMemory(context);
      return true;
    }
    if (context.method === 'POST') {
      await handleCreateOwnerMemory(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  const ownerMemoryItemMatch = matchRoute(
    context.url.pathname,
    /^\/api\/owner\/memory\/([^/]+)$/u,
  );
  if (ownerMemoryItemMatch) {
    if (context.method === 'PUT') {
      await handleUpdateOwnerMemory(context, ownerMemoryItemMatch[0]!);
      return true;
    }
    if (context.method === 'DELETE') {
      await handleDeleteOwnerMemory(context, ownerMemoryItemMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['PUT', 'DELETE']);
    return true;
  }

  return false;
}
