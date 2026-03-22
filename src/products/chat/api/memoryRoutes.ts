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

async function handleListCatMemory(
  context: ChatApiRouteContext,
  catId: string,
): Promise<void> {
  try {
    const core = await context.dependencies.chatStore.readCore();
    const subjectId = createCatActorId(catId);
    const records = listDurableMemoryBySubject(core, 'cat', subjectId);
    sendJson(context.response, 200, { memory: records });
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
    sendJson(context.response, 201, { memory: record });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleUpdateCatMemory(
  context: ChatApiRouteContext,
  _catId: string,
  memoryId: string,
): Promise<void> {
  try {
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

    const core = await context.dependencies.chatStore.readCore();
    const nextCore = updateDurableMemory(core, memoryId, updates);
    await context.dependencies.chatStore.writeCore(nextCore);

    const updated = nextCore.durableMemory.find((record) => record.id === memoryId);
    sendJson(context.response, 200, { memory: updated });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleDeleteCatMemory(
  context: ChatApiRouteContext,
  _catId: string,
  memoryId: string,
): Promise<void> {
  try {
    const core = await context.dependencies.chatStore.readCore();
    const nextCore = removeDurableMemory(core, memoryId);
    await context.dependencies.chatStore.writeCore(nextCore);
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
    sendJson(context.response, 200, { memory: records });
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
    sendJson(context.response, 201, { memory: record });
  } catch (error) {
    handleRestError(context, error);
  }
}

export async function routeMemoryApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
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

  const catMemoryItemMatch = matchRoute(
    context.url.pathname,
    /^\/api\/cats\/([^/]+)\/memory\/([^/]+)$/u,
  );
  if (catMemoryItemMatch) {
    if (context.method === 'PUT') {
      await handleUpdateCatMemory(context, catMemoryItemMatch[0], catMemoryItemMatch[1]);
      return true;
    }
    if (context.method === 'DELETE') {
      await handleDeleteCatMemory(context, catMemoryItemMatch[0], catMemoryItemMatch[1]);
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
      await handleListCatMemory(context, catMemoryMatch[0]);
      return true;
    }
    if (context.method === 'POST') {
      await handleCreateCatMemory(context, catMemoryMatch[0]);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  return false;
}
