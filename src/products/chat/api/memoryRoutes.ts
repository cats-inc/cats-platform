import { randomUUID } from 'node:crypto';

import { matchRoute, readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import {
  addDurableMemory,
  updateDurableMemory,
  removeDurableMemory,
  listDurableMemoryBySubject,
  createCatActorId,
  OWNER_ACTOR_ID,
} from '../../../core/model.js';
import type {
  DurableMemoryCategory,
  DurableMemoryRecord,
  DurableMemorySubjectType,
} from '../../../core/types.js';
import type { MemoryFlushReason } from '../../../platform/memory/index.js';
import { requireCat } from '../state/model.js';
import {
  handleRestError,
  sendRestError,
  type ChatApiRouteContext,
} from './shared.js';

interface CreateDurableMemoryInput {
  subjectType?: DurableMemorySubjectType;
  subjectId?: string;
  category: DurableMemoryCategory;
  content: string;
  confidence?: number | null;
  sourceRefs?: string[];
}

interface UpdateDurableMemoryInput {
  content?: string;
  category?: DurableMemoryCategory;
  confidence?: number | null;
  sourceRefs?: string[];
}

interface FlushMemoryInput {
  reason?: MemoryFlushReason | unknown;
}

function requestHasJsonBody(context: ChatApiRouteContext): boolean {
  const transferEncoding = context.request.headers['transfer-encoding'];
  if (Array.isArray(transferEncoding)) {
    if (transferEncoding.some((value) => value.trim().length > 0)) {
      return true;
    }
  } else if (
    typeof transferEncoding === 'string'
    && transferEncoding.trim().length > 0
  ) {
    return true;
  }

  const contentLengthHeader = context.request.headers['content-length'];
  const rawContentLength = Array.isArray(contentLengthHeader)
    ? contentLengthHeader[0]
    : contentLengthHeader;
  if (rawContentLength === undefined) {
    return false;
  }

  const contentLength = Number.parseInt(rawContentLength, 10);
  return !Number.isFinite(contentLength) || contentLength > 0;
}

function validateCategory(value: unknown): value is DurableMemoryCategory {
  return (
    value === 'preference'
    || value === 'fact'
    || value === 'policy'
    || value === 'style'
    || value === 'relationship'
    || value === 'lesson'
  );
}

function validateSubjectType(value: unknown): value is DurableMemorySubjectType {
  return (
    value === 'cat'
    || value === 'owner'
    || value === 'relationship'
    || value === 'project'
  );
}

function validateFlushReason(value: unknown): value is MemoryFlushReason | undefined {
  return (
    value === undefined
    || value === 'manual'
    || value === 'session_hydration'
    || value === 'pre_reset'
    || value === 'pre_compaction'
    || value === 'channel_handoff'
    || value === 'owner_profile_sync'
  );
}

async function readOptionalFlushBody(
  context: ChatApiRouteContext,
): Promise<FlushMemoryInput> {
  if (!requestHasJsonBody(context)) {
    return {};
  }
  return readJsonBody<FlushMemoryInput>(context.request);
}

async function syncCanonicalCatMemory(
  context: ChatApiRouteContext,
  catId: string,
): Promise<void> {
  await context.dependencies.memoryService.flushCompanionBox({
    catId,
    companionStore: context.dependencies.companionStore,
    reason: 'manual',
    now: context.dependencies.now?.(),
  });
}

function reportCanonicalSyncFailure(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[cats-memory-sync] ${scope}: ${message}\n`);
}

async function trySyncCanonicalCatMemory(
  context: ChatApiRouteContext,
  catId: string,
): Promise<void> {
  try {
    await syncCanonicalCatMemory(context, catId);
  } catch (error) {
    reportCanonicalSyncFailure(`cat:${catId}`, error);
  }
}

async function syncCanonicalOwnerMemory(
  context: ChatApiRouteContext,
  reason: MemoryFlushReason = 'owner_profile_sync',
): Promise<void> {
  await context.dependencies.memoryService.flushOwnerProfile({
    reason,
    now: context.dependencies.now?.(),
  });
}

async function trySyncCanonicalOwnerMemory(
  context: ChatApiRouteContext,
  reason: MemoryFlushReason = 'owner_profile_sync',
): Promise<void> {
  try {
    await syncCanonicalOwnerMemory(context, reason);
  } catch (error) {
    reportCanonicalSyncFailure('owner', error);
  }
}

function findCatMemoryRecord(
  core: { durableMemory: DurableMemoryRecord[] },
  catId: string,
  memoryId: string,
): DurableMemoryRecord | null {
  const subjectId = createCatActorId(catId);
  return core.durableMemory.find((record) =>
    record.id === memoryId
    && record.subjectType === 'cat'
    && record.subjectId === subjectId,
  ) ?? null;
}

function findOwnerMemoryRecord(
  core: { durableMemory: DurableMemoryRecord[] },
  memoryId: string,
): DurableMemoryRecord | null {
  return core.durableMemory.find((record) =>
    record.id === memoryId
    && record.subjectType === 'owner'
    && record.subjectId === OWNER_ACTOR_ID,
  ) ?? null;
}

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

    const now = new Date().toISOString();
    const record: DurableMemoryRecord = {
      id: `mem-${randomUUID()}`,
      subjectType: 'cat',
      subjectId: createCatActorId(catId),
      category: body.category,
      content: body.content.trim(),
      confidence: body.confidence ?? null,
      sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [],
      createdAt: now,
      updatedAt: now,
    };

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
    const updates: Partial<Pick<DurableMemoryRecord, 'content' | 'confidence' | 'category' | 'sourceRefs'>> = {};

    if (body.content !== undefined) {
      if (typeof body.content !== 'string' || body.content.trim().length === 0) {
        sendRestError(context, 400, 'content_required', 'Memory content must be a non-empty string.');
        return;
      }
      updates.content = body.content.trim();
    }

    if (body.category !== undefined) {
      if (!validateCategory(body.category)) {
        sendRestError(context, 400, 'invalid_category', 'Invalid memory category.');
        return;
      }
      updates.category = body.category;
    }

    if (body.confidence !== undefined) {
      updates.confidence = body.confidence;
    }

    if (body.sourceRefs !== undefined) {
      updates.sourceRefs = Array.isArray(body.sourceRefs) ? body.sourceRefs : [];
    }

    const nextCore = updateDurableMemory(core, memoryId, updates);
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

    const now = new Date().toISOString();
    const record: DurableMemoryRecord = {
      id: `mem-${randomUUID()}`,
      subjectType: 'owner',
      subjectId: OWNER_ACTOR_ID,
      category: body.category,
      content: body.content.trim(),
      confidence: body.confidence ?? null,
      sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [],
      createdAt: now,
      updatedAt: now,
    };

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
    const updates: Partial<Pick<DurableMemoryRecord, 'content' | 'confidence' | 'category' | 'sourceRefs'>> = {};

    if (body.content !== undefined) {
      if (typeof body.content !== 'string' || body.content.trim().length === 0) {
        sendRestError(context, 400, 'content_required', 'Memory content must be a non-empty string.');
        return;
      }
      updates.content = body.content.trim();
    }

    if (body.category !== undefined) {
      if (!validateCategory(body.category)) {
        sendRestError(context, 400, 'invalid_category', 'Invalid memory category.');
        return;
      }
      updates.category = body.category;
    }

    if (body.confidence !== undefined) {
      updates.confidence = body.confidence;
    }

    if (body.sourceRefs !== undefined) {
      updates.sourceRefs = Array.isArray(body.sourceRefs) ? body.sourceRefs : [];
    }

    const nextCore = updateDurableMemory(core, memoryId, updates);
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

async function handleFlushChannelMemory(
  context: ChatApiRouteContext,
  channelId: string,
): Promise<void> {
  try {
    const body = await readOptionalFlushBody(context);
    if (!validateFlushReason(body.reason)) {
      sendRestError(context, 400, 'invalid_flush_reason', 'Invalid memory flush reason.');
      return;
    }
    const flush = await context.dependencies.memoryService.flushChannel({
      channelId,
      reason: body.reason,
      now: context.dependencies.now?.(),
    });
    sendJson(context.response, 200, { flush });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleGetChannelRetrievalContext(
  context: ChatApiRouteContext,
  channelId: string,
): Promise<void> {
  try {
    const catId = context.url.searchParams.get('catId')?.trim() || null;
    const retrieval = await context.dependencies.memoryService.buildChannelRetrievalContext({
      channelId,
      catId,
      transport: 'web',
      companionStore: context.dependencies.companionStore,
      now: context.dependencies.now?.(),
    });
    sendJson(context.response, 200, { retrieval });
  } catch (error) {
    handleRestError(context, error);
  }
}

export async function routeMemoryApi(
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

  const channelFlushMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/memory\/flush$/u,
  );
  if (channelFlushMatch) {
    if (context.method === 'POST') {
      await handleFlushChannelMemory(context, channelFlushMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['POST']);
    return true;
  }

  const channelRetrievalMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/memory\/retrieval-context$/u,
  );
  if (channelRetrievalMatch) {
    if (context.method === 'GET') {
      await handleGetChannelRetrievalContext(context, channelRetrievalMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET']);
    return true;
  }

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
