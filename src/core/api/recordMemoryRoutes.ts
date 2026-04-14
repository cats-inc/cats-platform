import { randomUUID } from 'node:crypto';

import { matchRoute, readJsonBody, sendJson, sendMethodNotAllowed } from '../../shared/http.js';
import {
  addDurableMemory,
  listDurableMemoryBySubject,
  removeDurableMemory,
  updateDurableMemory,
} from '../model/index.js';
import {
  CoreApiError,
  CoreNotFoundError,
  CoreValidationError,
} from '../errors.js';
import type {
  DurableMemoryCategory,
  DurableMemoryRecord,
} from '../types.js';
import type { CoreApiRouteContext } from './types.js';
import {
  handleCoreError,
} from './shared.js';
import { syncCanonicalScopedMemoryBestEffort } from '../../platform/memory/maintenance.js';

type ScopedMemorySubjectKind = 'project' | 'relationship';

interface CreateScopedMemoryInput {
  category: DurableMemoryCategory;
  content: string;
  confidence?: number | null;
  sourceRefs?: string[];
}

interface UpdateScopedMemoryInput {
  content?: string;
  category?: DurableMemoryCategory;
  confidence?: number | null;
  sourceRefs?: string[];
}

interface FlushMemoryInput {
  reason?: unknown;
}

interface ScopedMemoryListQuery {
  categories?: DurableMemoryCategory[];
  sourceRefs?: string[];
  minConfidence?: number;
  maxConfidence?: number;
  limit?: number;
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

function validateFlushReason(value: unknown): value is
  | 'manual'
  | 'session_hydration'
  | 'pre_reset'
  | 'pre_compaction'
  | 'channel_handoff'
  | 'owner_profile_sync'
  | undefined {
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

function requestHasJsonBody(context: CoreApiRouteContext): boolean {
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

async function readOptionalFlushBody(
  context: CoreApiRouteContext,
): Promise<FlushMemoryInput> {
  if (!requestHasJsonBody(context)) {
    return {};
  }
  return readJsonBody<FlushMemoryInput>(context.request);
}

function readNonEmptyString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(
    values
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  ));
}

function parseBooleanQuery(value: string | null): boolean {
  return value !== 'false';
}

function parseTransportQuery(
  value: string | null,
): 'telegram' | 'line' | 'web' | null {
  return value === 'telegram' || value === 'line' || value === 'web'
    ? value
    : null;
}

function readQueryValues(
  searchParams: URLSearchParams,
  key: string,
): string[] {
  const values = searchParams.getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return Array.from(new Set(values));
}

function readOptionalNumberQuery(
  searchParams: URLSearchParams,
  key: string,
): number | undefined {
  const raw = searchParams.get(key);
  if (raw === null || raw.trim().length === 0) {
    return undefined;
  }

  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) {
    throw new CoreValidationError(`${key} must be a number.`, 'invalid_query_number');
  }

  return parsed;
}

function readPositiveIntegerQuery(
  searchParams: URLSearchParams,
  key: string,
): number | undefined {
  const raw = searchParams.get(key);
  if (raw === null || raw.trim().length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new CoreValidationError(`${key} must be a positive integer.`, 'invalid_query_limit');
  }

  return parsed;
}

function readScopedMemoryListQuery(
  searchParams: URLSearchParams,
): ScopedMemoryListQuery {
  const rawCategories = readQueryValues(searchParams, 'category');
  const invalidCategory = rawCategories.find((value) => !validateCategory(value));
  if (invalidCategory) {
    throw new CoreValidationError('Invalid memory category.', 'invalid_category');
  }

  return {
    categories: rawCategories.length > 0 ? rawCategories as DurableMemoryCategory[] : undefined,
    sourceRefs: (() => {
      const values = readQueryValues(searchParams, 'sourceRef');
      return values.length > 0 ? values : undefined;
    })(),
    minConfidence: readOptionalNumberQuery(searchParams, 'minConfidence'),
    maxConfidence: readOptionalNumberQuery(searchParams, 'maxConfidence'),
    limit: readPositiveIntegerQuery(searchParams, 'limit'),
  };
}

function ensureProjectExists(
  projectId: string,
  core: Awaited<ReturnType<CoreApiRouteContext['dependencies']['coreStore']['readCore']>>,
): void {
  if (!core.projects.some((project) => project.id === projectId)) {
    throw new CoreNotFoundError(
      `Project not found: ${projectId}`,
      'project_not_found',
    );
  }
}

function buildScopedMemoryRecord(
  subjectKind: ScopedMemorySubjectKind,
  subjectId: string,
  body: CreateScopedMemoryInput,
  now: Date,
): DurableMemoryRecord {
  const nowIso = now.toISOString();
  return {
    id: `mem-${randomUUID()}`,
    subjectType: subjectKind,
    subjectId,
    category: body.category,
    content: body.content.trim(),
    confidence: body.confidence ?? null,
    sourceRefs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

function buildScopedMemoryUpdates(
  body: UpdateScopedMemoryInput,
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

function findScopedMemoryRecord(
  core: { durableMemory: DurableMemoryRecord[] },
  subjectKind: ScopedMemorySubjectKind,
  subjectId: string,
  memoryId: string,
): DurableMemoryRecord | null {
  return core.durableMemory.find((record) =>
    record.id === memoryId
    && record.subjectType === subjectKind
    && record.subjectId === subjectId
  ) ?? null;
}

async function maybeSyncScopedMemory(
  context: CoreApiRouteContext,
  subjectKind: ScopedMemorySubjectKind,
  subjectId: string,
) {
  if (!context.dependencies.memoryService) {
    return null;
  }

  return syncCanonicalScopedMemoryBestEffort({
    subjectKind,
    subjectId,
    memoryService: context.dependencies.memoryService,
    now: context.dependencies.now?.(),
  });
}

async function handleListScopedMemory(
  context: CoreApiRouteContext,
  subjectKind: ScopedMemorySubjectKind,
  subjectId: string,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  if (subjectKind === 'project') {
    ensureProjectExists(subjectId, core);
  }

  const query = readScopedMemoryListQuery(context.url.searchParams);
  const records = listDurableMemoryBySubject(core, subjectKind, subjectId, query);
  sendJson(context.response, 200, { records });
}

async function handleCreateScopedMemory(
  context: CoreApiRouteContext,
  subjectKind: ScopedMemorySubjectKind,
  subjectId: string,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  if (subjectKind === 'project') {
    ensureProjectExists(subjectId, core);
  }

  const body = await readJsonBody<CreateScopedMemoryInput>(context.request);
  if (!body.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
    throw new CoreValidationError('Memory content is required.', 'content_required');
  }
  if (!validateCategory(body.category)) {
    throw new CoreValidationError('Invalid memory category.', 'invalid_category');
  }

  const record = buildScopedMemoryRecord(
    subjectKind,
    subjectId,
    body,
    context.dependencies.now?.() ?? new Date(),
  );
  const nextCore = addDurableMemory(core, record);
  await context.dependencies.coreStore.writeCore(nextCore);
  const canonicalSync = await maybeSyncScopedMemory(context, subjectKind, subjectId);
  sendJson(context.response, 201, {
    memory: record,
    canonicalSync,
  });
}

async function handleUpdateScopedMemory(
  context: CoreApiRouteContext,
  subjectKind: ScopedMemorySubjectKind,
  subjectId: string,
  memoryId: string,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  if (subjectKind === 'project') {
    ensureProjectExists(subjectId, core);
  }
  if (!findScopedMemoryRecord(core, subjectKind, subjectId, memoryId)) {
    throw new CoreNotFoundError(
      `Scoped memory not found: ${memoryId}`,
      'memory_not_found',
    );
  }

  const body = await readJsonBody<UpdateScopedMemoryInput>(context.request);
  if (
    body.content !== undefined
    && (typeof body.content !== 'string' || body.content.trim().length === 0)
  ) {
    throw new CoreValidationError(
      'Memory content must be a non-empty string.',
      'content_required',
    );
  }
  if (body.category !== undefined && !validateCategory(body.category)) {
    throw new CoreValidationError('Invalid memory category.', 'invalid_category');
  }

  const nextCore = updateDurableMemory(core, memoryId, buildScopedMemoryUpdates(body));
  await context.dependencies.coreStore.writeCore(nextCore);
  const canonicalSync = await maybeSyncScopedMemory(context, subjectKind, subjectId);
  sendJson(context.response, 200, {
    memory: nextCore.durableMemory.find((record) => record.id === memoryId) ?? null,
    canonicalSync,
  });
}

async function handleDeleteScopedMemory(
  context: CoreApiRouteContext,
  subjectKind: ScopedMemorySubjectKind,
  subjectId: string,
  memoryId: string,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  if (subjectKind === 'project') {
    ensureProjectExists(subjectId, core);
  }
  if (!findScopedMemoryRecord(core, subjectKind, subjectId, memoryId)) {
    throw new CoreNotFoundError(
      `Scoped memory not found: ${memoryId}`,
      'memory_not_found',
    );
  }

  const nextCore = removeDurableMemory(core, memoryId);
  await context.dependencies.coreStore.writeCore(nextCore);
  const canonicalSync = await maybeSyncScopedMemory(context, subjectKind, subjectId);
  sendJson(context.response, 200, {
    deleted: true,
    memoryId,
    canonicalSync,
  });
}

async function handleListScopedCanonicalMemory(
  context: CoreApiRouteContext,
  subjectKind: ScopedMemorySubjectKind,
  subjectId: string,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  if (subjectKind === 'project') {
    ensureProjectExists(subjectId, core);
  }
  if (!context.dependencies.memoryService) {
    throw new CoreApiError(
      'Memory service is unavailable.',
      'memory_service_unavailable',
      503,
    );
  }

  const records = await context.dependencies.memoryService.listCanonicalRecords({
    subjectKind,
    subjectId,
  });
  sendJson(context.response, 200, { records });
}

async function handleFlushScopedCanonicalMemory(
  context: CoreApiRouteContext,
  subjectKind: ScopedMemorySubjectKind,
  subjectId: string,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  if (subjectKind === 'project') {
    ensureProjectExists(subjectId, core);
  }
  if (!context.dependencies.memoryService) {
    throw new CoreApiError(
      'Memory service is unavailable.',
      'memory_service_unavailable',
      503,
    );
  }

  const body = await readOptionalFlushBody(context);
  if (!validateFlushReason(body.reason)) {
    throw new CoreValidationError('Invalid memory flush reason.', 'invalid_flush_reason');
  }

  const sync = await syncCanonicalScopedMemoryBestEffort({
    subjectKind,
    subjectId,
    memoryService: context.dependencies.memoryService,
    reason: body.reason,
    now: context.dependencies.now?.(),
  });
  sendJson(context.response, 200, {
    canonicalSync: sync,
    flush: sync.flush,
    summary: sync.summary,
  });
}

async function handleGetScopedRetrievalContext(
  context: CoreApiRouteContext,
  subjectKind: ScopedMemorySubjectKind,
  subjectId: string,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  if (subjectKind === 'project') {
    ensureProjectExists(subjectId, core);
  }
  if (!context.dependencies.memoryService) {
    throw new CoreApiError(
      'Memory service is unavailable.',
      'memory_service_unavailable',
      503,
    );
  }

  const catId = readNonEmptyString(context.url.searchParams.get('catId'));
  const channelId = readNonEmptyString(context.url.searchParams.get('channelId'));
  const projectIds = uniqueStrings([
    ...(subjectKind === 'project' ? [subjectId] : []),
    ...context.url.searchParams.getAll('projectId'),
  ]);
  const relationshipIds = uniqueStrings([
    ...(subjectKind === 'relationship' ? [subjectId] : []),
    ...context.url.searchParams.getAll('relationshipId'),
  ]);
  const retrieval = await context.dependencies.memoryService.buildRetrievalContext({
    catId,
    channelId,
    includeOwnerProfile: parseBooleanQuery(context.url.searchParams.get('includeOwnerProfile')),
    transport: parseTransportQuery(context.url.searchParams.get('transport')),
    projectIds,
    relationshipIds,
    queryHints: uniqueStrings(context.url.searchParams.getAll('queryHint')),
    now: context.dependencies.now?.(),
  });
  sendJson(context.response, 200, { retrieval });
}

async function routeScopedMemoryApi(
  context: CoreApiRouteContext,
  input: {
    subjectKind: ScopedMemorySubjectKind;
    pathPrefix: 'projects' | 'relationships';
  },
): Promise<boolean> {
  const canonicalMatch = matchRoute(
    context.url.pathname,
    new RegExp(`^/api/core/${input.pathPrefix}/([^/]+)/memory/canonical$`, 'u'),
  );
  if (canonicalMatch) {
    if (context.method === 'GET') {
      await handleListScopedCanonicalMemory(context, input.subjectKind, canonicalMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET']);
    return true;
  }

  const flushMatch = matchRoute(
    context.url.pathname,
    new RegExp(`^/api/core/${input.pathPrefix}/([^/]+)/memory/flush$`, 'u'),
  );
  if (flushMatch) {
    if (context.method === 'POST') {
      await handleFlushScopedCanonicalMemory(context, input.subjectKind, flushMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['POST']);
    return true;
  }

  const retrievalMatch = matchRoute(
    context.url.pathname,
    new RegExp(`^/api/core/${input.pathPrefix}/([^/]+)/memory/retrieval-context$`, 'u'),
  );
  if (retrievalMatch) {
    if (context.method === 'GET') {
      await handleGetScopedRetrievalContext(context, input.subjectKind, retrievalMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET']);
    return true;
  }

  const itemMatch = matchRoute(
    context.url.pathname,
    new RegExp(`^/api/core/${input.pathPrefix}/([^/]+)/memory/([^/]+)$`, 'u'),
  );
  if (itemMatch) {
    if (context.method === 'PUT') {
      await handleUpdateScopedMemory(
        context,
        input.subjectKind,
        itemMatch[0]!,
        itemMatch[1]!,
      );
      return true;
    }
    if (context.method === 'DELETE') {
      await handleDeleteScopedMemory(
        context,
        input.subjectKind,
        itemMatch[0]!,
        itemMatch[1]!,
      );
      return true;
    }
    sendMethodNotAllowed(context.response, ['PUT', 'DELETE']);
    return true;
  }

  const collectionMatch = matchRoute(
    context.url.pathname,
    new RegExp(`^/api/core/${input.pathPrefix}/([^/]+)/memory$`, 'u'),
  );
  if (collectionMatch) {
    if (context.method === 'GET') {
      await handleListScopedMemory(context, input.subjectKind, collectionMatch[0]!);
      return true;
    }
    if (context.method === 'POST') {
      await handleCreateScopedMemory(context, input.subjectKind, collectionMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  return false;
}

export async function routeCoreMemoryRecordApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
  try {
    if (await routeScopedMemoryApi(context, {
      subjectKind: 'project',
      pathPrefix: 'projects',
    })) {
      return true;
    }

    if (await routeScopedMemoryApi(context, {
      subjectKind: 'relationship',
      pathPrefix: 'relationships',
    })) {
      return true;
    }

    return false;
  } catch (error) {
    handleCoreError(context, error);
    return true;
  }
}
