import { randomUUID } from 'node:crypto';

import { readJsonBody } from '../../../../shared/http.js';
import {
  createCatActorId,
  OWNER_ACTOR_ID,
} from '../../../../core/actors.js';
import type {
  DurableMemoryCategory,
  DurableMemoryRecord,
} from '../../../../core/types.js';
import type { MemoryFlushReason } from '../../../../platform/memory/index.js';
import {
  syncCanonicalCompanionMemoryBestEffort,
  syncCanonicalOwnerMemoryBestEffort,
} from '../../../../platform/memory/maintenance.js';
import type { ChatApiRouteContext } from '../routeSupport.js';

export interface CreateDurableMemoryInput {
  category: DurableMemoryCategory;
  content: string;
  confidence?: number | null;
  sourceRefs?: string[];
}

export interface UpdateDurableMemoryInput {
  content?: string;
  category?: DurableMemoryCategory;
  confidence?: number | null;
  sourceRefs?: string[];
}

interface FlushMemoryInput {
  reason?: MemoryFlushReason | unknown;
}

export function requestHasJsonBody(context: ChatApiRouteContext): boolean {
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

export function validateCategory(value: unknown): value is DurableMemoryCategory {
  return (
    value === 'preference'
    || value === 'fact'
    || value === 'policy'
    || value === 'style'
    || value === 'relationship'
    || value === 'lesson'
  );
}

export function validateFlushReason(value: unknown): value is MemoryFlushReason | undefined {
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

export async function readOptionalFlushBody(
  context: ChatApiRouteContext,
): Promise<FlushMemoryInput> {
  if (!requestHasJsonBody(context)) {
    return {};
  }
  return readJsonBody<FlushMemoryInput>(context.request);
}

export async function trySyncCanonicalCatMemory(
  context: ChatApiRouteContext,
  catId: string,
): Promise<void> {
  await syncCanonicalCompanionMemoryBestEffort({
    catId,
    companionStore: context.dependencies.companionStore,
    memoryService: context.dependencies.memoryService,
    reason: 'manual',
    now: context.dependencies.now?.(),
    coreStore: context.dependencies.chatStore,
  });
}

export async function trySyncCanonicalOwnerMemory(
  context: ChatApiRouteContext,
  reason: MemoryFlushReason = 'owner_profile_sync',
): Promise<void> {
  await syncCanonicalOwnerMemoryBestEffort({
    memoryService: context.dependencies.memoryService,
    reason,
    now: context.dependencies.now?.(),
    coreStore: context.dependencies.chatStore,
  });
}

export function findCatMemoryRecord(
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

export function findOwnerMemoryRecord(
  core: { durableMemory: DurableMemoryRecord[] },
  memoryId: string,
): DurableMemoryRecord | null {
  return core.durableMemory.find((record) =>
    record.id === memoryId
    && record.subjectType === 'owner'
    && record.subjectId === OWNER_ACTOR_ID,
  ) ?? null;
}

export function buildCatMemoryRecord(
  catId: string,
  body: CreateDurableMemoryInput,
): DurableMemoryRecord {
  const now = new Date().toISOString();
  return {
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
}

export function buildOwnerMemoryRecord(
  body: CreateDurableMemoryInput,
): DurableMemoryRecord {
  const now = new Date().toISOString();
  return {
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
}

export function buildDurableMemoryUpdates(
  body: UpdateDurableMemoryInput,
): Partial<Pick<DurableMemoryRecord, 'content' | 'confidence' | 'category' | 'sourceRefs'>> {
  const updates: Partial<Pick<DurableMemoryRecord, 'content' | 'confidence' | 'category' | 'sourceRefs'>> = {};

  if (body.content !== undefined) {
    updates.content = body.content.trim();
  }

  if (body.category !== undefined) {
    updates.category = body.category;
  }

  if (body.confidence !== undefined) {
    updates.confidence = body.confidence;
  }

  if (body.sourceRefs !== undefined) {
    updates.sourceRefs = Array.isArray(body.sourceRefs) ? body.sourceRefs : [];
  }

  return updates;
}
