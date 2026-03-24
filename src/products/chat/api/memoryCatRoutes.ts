import { matchRoute, readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import {
  addDurableMemory,
  listDurableMemoryBySubject,
  removeDurableMemory,
  updateDurableMemory,
} from '../../../core/model.js';
import { createCatActorId } from '../../../core/actors.js';
import { requireCat } from '../state/model.js';
import {
  handleRestError,
  sendRestError,
  type ChatApiRouteContext,
} from './shared.js';
import {
  buildCatMemoryRecord,
  buildDurableMemoryUpdates,
  CreateDurableMemoryInput,
  findCatMemoryRecord,
  readOptionalFlushBody,
  trySyncCanonicalCatMemory,
  UpdateDurableMemoryInput,
  validateCategory,
  validateFlushReason,
} from './memoryRouteShared.js';

async function handleListCatMemory(
  context: ChatApiRouteContext,
  catId: string,
): Promise<void> {
  try {
    const core = await context.dependencies.chatStore.readCore();
    const subjectId = createCatActorId(catId);
    const records = listDurableMemoryBySubject(core, 'cat', subjectId);
    sendJson(context.response, 200, { records });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleCreateCatMemory(
  context: ChatApiRouteContext,
  catId: string,
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

    const record = buildCatMemoryRecord(catId, body);
    const core = await context.dependencies.chatStore.readCore();
    const nextCore = addDurableMemory(core, record);
    await context.dependencies.chatStore.writeCore(nextCore);
    await trySyncCanonicalCatMemory(context, catId);
    sendJson(context.response, 201, { memory: record });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleUpdateCatMemory(
  context: ChatApiRouteContext,
  catId: string,
  memoryId: string,
): Promise<void> {
  try {
    const core = await context.dependencies.chatStore.readCore();
    if (!findCatMemoryRecord(core, catId, memoryId)) {
      sendRestError(context, 404, 'memory_not_found', `Cat memory not found: ${memoryId}`);
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
    await trySyncCanonicalCatMemory(context, catId);

    const updated = nextCore.durableMemory.find((record) => record.id === memoryId);
    sendJson(context.response, 200, { memory: updated });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleDeleteCatMemory(
  context: ChatApiRouteContext,
  catId: string,
  memoryId: string,
): Promise<void> {
  try {
    const core = await context.dependencies.chatStore.readCore();
    if (!findCatMemoryRecord(core, catId, memoryId)) {
      sendRestError(context, 404, 'memory_not_found', `Cat memory not found: ${memoryId}`);
      return;
    }
    const nextCore = removeDurableMemory(core, memoryId);
    await context.dependencies.chatStore.writeCore(nextCore);
    await trySyncCanonicalCatMemory(context, catId);
    sendJson(context.response, 200, { deleted: true, memoryId });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleListCanonicalCatMemory(
  context: ChatApiRouteContext,
  catId: string,
): Promise<void> {
  try {
    const state = await context.dependencies.chatStore.read();
    requireCat(state, catId);
    const records = await context.dependencies.memoryService.listCanonicalRecords({
      subjectKind: 'cat',
      subjectId: catId,
    });
    sendJson(context.response, 200, { records });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleFlushCanonicalCatMemory(
  context: ChatApiRouteContext,
  catId: string,
): Promise<void> {
  try {
    const state = await context.dependencies.chatStore.read();
    requireCat(state, catId);
    const body = await readOptionalFlushBody(context);
    if (!validateFlushReason(body.reason)) {
      sendRestError(context, 400, 'invalid_flush_reason', 'Invalid memory flush reason.');
      return;
    }
    const flush = await context.dependencies.memoryService.flushCompanionBox({
      catId,
      companionStore: context.dependencies.companionStore,
      reason: body.reason,
      now: context.dependencies.now?.(),
    });
    sendJson(context.response, 200, { flush });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleGetCatRetrievalContext(
  context: ChatApiRouteContext,
  catId: string,
): Promise<void> {
  try {
    const state = await context.dependencies.chatStore.read();
    const cat = requireCat(state, catId);
    const channelId = context.url.searchParams.get('channelId')?.trim() ?? '';
    const channel = channelId
      ? state.channels.find((candidate) => candidate.id === channelId) ?? null
      : null;
    const retrieval = await context.dependencies.memoryService.buildCompanionRetrievalContext({
      cat,
      channel: {
        id: channel?.id ?? null,
        title: channel?.title ?? `${cat.name} Memory`,
        topic: channel?.topic ?? 'Companion retrieval preview.',
        workingMemory: channel?.workingMemory,
        roomRouting: channel?.roomRouting,
      },
      transport: 'web',
      companionStore: context.dependencies.companionStore,
      now: context.dependencies.now?.(),
    });
    sendJson(context.response, 200, { retrieval });
  } catch (error) {
    handleRestError(context, error);
  }
}

export async function routeCatMemoryApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
  const catCanonicalMatch = matchRoute(
    context.url.pathname,
    /^\/api\/cats\/([^/]+)\/memory\/canonical$/u,
  );
  if (catCanonicalMatch) {
    if (context.method === 'GET') {
      await handleListCanonicalCatMemory(context, catCanonicalMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET']);
    return true;
  }

  const catFlushMatch = matchRoute(
    context.url.pathname,
    /^\/api\/cats\/([^/]+)\/memory\/flush$/u,
  );
  if (catFlushMatch) {
    if (context.method === 'POST') {
      await handleFlushCanonicalCatMemory(context, catFlushMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['POST']);
    return true;
  }

  const catRetrievalMatch = matchRoute(
    context.url.pathname,
    /^\/api\/cats\/([^/]+)\/memory\/retrieval-context$/u,
  );
  if (catRetrievalMatch) {
    if (context.method === 'GET') {
      await handleGetCatRetrievalContext(context, catRetrievalMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET']);
    return true;
  }

  const catMemoryItemMatch = matchRoute(
    context.url.pathname,
    /^\/api\/cats\/([^/]+)\/memory\/([^/]+)$/u,
  );
  if (catMemoryItemMatch) {
    if (context.method === 'PUT') {
      await handleUpdateCatMemory(context, catMemoryItemMatch[0]!, catMemoryItemMatch[1]!);
      return true;
    }
    if (context.method === 'DELETE') {
      await handleDeleteCatMemory(context, catMemoryItemMatch[0]!, catMemoryItemMatch[1]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['PUT', 'DELETE']);
    return true;
  }

  const catMemoryMatch = matchRoute(
    context.url.pathname,
    /^\/api\/cats\/([^/]+)\/memory$/u,
  );
  if (catMemoryMatch) {
    if (context.method === 'GET') {
      await handleListCatMemory(context, catMemoryMatch[0]!);
      return true;
    }
    if (context.method === 'POST') {
      await handleCreateCatMemory(context, catMemoryMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  return false;
}
