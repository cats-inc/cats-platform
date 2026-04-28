import { matchRoute, readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import { resolveSkillProfileManifest } from '../../../shared/skillProfiles.js';
import { createDefaultRoomRoutingState } from '../state/room-routing/index.js';
import { requireCat, requireChannel } from '../state/model/index.js';
import {
  isCompanionExpressionMode,
  isCompanionMemoryCategory,
  isCompanionOutputMode,
  isCompanionSourceKind,
  isCompanionSourceStorageMode,
} from '../companion/validation.js';
import type {
  CreateCompanionMemoryInput,
  CreateCompanionSourceInput,
  UpdateCompanionSourceInput,
  UpdateCompanionResponseProfileInput,
} from '../companion/contracts.js';
import { projectCompanionProfile } from '../companion/profileReadModel.js';
import { syncCanonicalCompanionMemoryBestEffort } from '../../../platform/memory/maintenance.js';
import {
  type CanonicalSyncAwareCompanionBoxStore,
  type CompanionCanonicalSyncResult,
} from '../state/companionMemoryAdapter.js';
import {
  handleCanonicalCatError,
  handleRestError,
  sendRestError,
  type ChatApiRouteContext,
} from './routeSupport.js';

async function resolveCatContext(context: ChatApiRouteContext, catId: string) {
  const state = await context.dependencies.chatStore.read();
  const cat = requireCat(state, catId);
  return { state, cat };
}

function isCanonicalSyncAwareCompanionBoxStore(
  store: ChatApiRouteContext['dependencies']['companionStore'],
): store is CanonicalSyncAwareCompanionBoxStore {
  return typeof (store as CanonicalSyncAwareCompanionBoxStore).consumePendingCanonicalSync === 'function';
}

async function syncCanonicalCompanionMemory(
  context: ChatApiRouteContext,
  catId: string,
): Promise<CompanionCanonicalSyncResult> {
  if (isCanonicalSyncAwareCompanionBoxStore(context.dependencies.companionStore)) {
    const pending = context.dependencies.companionStore.consumePendingCanonicalSync(catId);
    if (pending) {
      return pending;
    }
  }
  return syncCanonicalCompanionMemoryBestEffort({
    catId,
    companionStore: context.dependencies.companionStore,
    memoryService: context.dependencies.memoryService,
    reason: 'manual',
    now: context.dependencies.now?.(),
    coreStore: context.dependencies.chatStore,
  });
}

async function handleGetCompanionBox(
  context: ChatApiRouteContext,
  catId: string,
): Promise<void> {
  try {
    await resolveCatContext(context, catId);
    const summary = await context.dependencies.companionStore.getBoxSummary(catId);
    sendJson(context.response, 200, { companionBox: summary });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

function validateCreateSourceInput(
  context: ChatApiRouteContext,
  body: Partial<CreateCompanionSourceInput>,
): body is CreateCompanionSourceInput {
  if (!isCompanionSourceKind(body.kind)) {
    sendRestError(context, 400, 'invalid_companion_source_kind', 'Invalid companion source kind.');
    return false;
  }
  if (!isCompanionSourceStorageMode(body.storageMode)) {
    sendRestError(
      context,
      400,
      'invalid_companion_storage_mode',
      'Invalid companion source storage mode.',
    );
    return false;
  }
  if (body.storageMode === 'linked_path' && (!body.linkedPath || body.linkedPath.trim().length === 0)) {
    sendRestError(
      context,
      400,
      'linked_path_required',
      'linkedPath is required when storageMode is linked_path.',
    );
    return false;
  }

  const hasMaterial = Boolean(
    body.textContent?.trim()
    || body.ownerNote?.trim()
    || body.linkedPath?.trim()
    || body.sourceUrl?.trim()
    || body.originalFileName?.trim()
    || (body.metadata && Object.keys(body.metadata).length > 0),
  );
  if (!hasMaterial) {
    sendRestError(
      context,
      400,
      'companion_source_material_required',
      'Companion source ingestion requires text, path, url, file metadata, or metadata payload.',
    );
    return false;
  }

  return true;
}

async function handleListCompanionSources(
  context: ChatApiRouteContext,
  catId: string,
): Promise<void> {
  try {
    await resolveCatContext(context, catId);
    const sources = await context.dependencies.companionStore.listSources(catId);
    sendJson(context.response, 200, { sources });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

async function handleCreateCompanionSource(
  context: ChatApiRouteContext,
  catId: string,
): Promise<void> {
  try {
    await resolveCatContext(context, catId);
    const body = await readJsonBody<Partial<CreateCompanionSourceInput>>(context.request);
    if (!validateCreateSourceInput(context, body)) {
      return;
    }
    const result = await context.dependencies.companionStore.ingestSource(catId, body);
    const canonicalSync = await syncCanonicalCompanionMemory(context, catId);
    sendJson(context.response, 201, {
      box: result.box,
      source: result.source,
      derivedRecords: result.derivedRecords,
      canonicalSync,
    });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

function validateUpdateSourceInput(
  context: ChatApiRouteContext,
  body: Partial<UpdateCompanionSourceInput>,
): body is UpdateCompanionSourceInput {
  const hasChanges = [
    'title',
    'ownerNote',
    'textContent',
    'linkedPath',
    'sourceUrl',
    'mimeType',
    'originalFileName',
    'metadata',
  ].some((key) => Object.hasOwn(body, key));
  if (!hasChanges) {
    sendRestError(
      context,
      400,
      'companion_source_update_required',
      'Companion source updates require at least one mutable field.',
    );
    return false;
  }
  return true;
}

async function handleUpdateCompanionSource(
  context: ChatApiRouteContext,
  catId: string,
  sourceId: string,
): Promise<void> {
  try {
    await resolveCatContext(context, catId);
    const existingSources = await context.dependencies.companionStore.listSources(catId);
    const existingSource = existingSources.find((record) => record.id === sourceId);
    if (!existingSource) {
      sendRestError(context, 404, 'companion_source_not_found', `Companion source not found: ${sourceId}`);
      return;
    }
    const body = await readJsonBody<Partial<UpdateCompanionSourceInput>>(context.request);
    if (!validateUpdateSourceInput(context, body)) {
      return;
    }
    if (
      existingSource.storageMode === 'linked_path'
      && body.linkedPath !== undefined
      && (!body.linkedPath || body.linkedPath.trim().length === 0)
    ) {
      sendRestError(
        context,
        400,
        'linked_path_required',
        'linkedPath is required when updating a linked_path companion source.',
      );
      return;
    }
    if (existingSource.storageMode !== 'linked_path' && body.linkedPath !== undefined) {
      sendRestError(
        context,
        400,
        'linked_path_not_supported',
        'linkedPath can only be updated for linked_path companion sources.',
      );
      return;
    }
    const result = await context.dependencies.companionStore.updateSource(catId, sourceId, body);
    const canonicalSync = await syncCanonicalCompanionMemory(context, catId);
    sendJson(context.response, 200, {
      box: result.box,
      source: result.source,
      derivedRecords: result.derivedRecords,
      canonicalSync,
    });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

async function handleDeleteCompanionSource(
  context: ChatApiRouteContext,
  catId: string,
  sourceId: string,
): Promise<void> {
  try {
    await resolveCatContext(context, catId);
    const existingSources = await context.dependencies.companionStore.listSources(catId);
    if (!existingSources.some((record) => record.id === sourceId)) {
      sendRestError(context, 404, 'companion_source_not_found', `Companion source not found: ${sourceId}`);
      return;
    }
    const result = await context.dependencies.companionStore.deleteSource(catId, sourceId);
    const canonicalSync = await syncCanonicalCompanionMemory(context, catId);
    sendJson(context.response, 200, {
      deleted: true,
      sourceId: result.sourceId,
      removedDerivedIds: result.removedDerivedIds,
      prunedMemoryIds: result.prunedMemoryIds,
      canonicalSync,
    });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

async function handleListCompanionDerived(
  context: ChatApiRouteContext,
  catId: string,
): Promise<void> {
  try {
    await resolveCatContext(context, catId);
    const derived = await context.dependencies.companionStore.listDerived(catId);
    sendJson(context.response, 200, { derived });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

async function handleGetCompanionProfileReadModel(
  context: ChatApiRouteContext,
  catId: string,
): Promise<void> {
  try {
    await resolveCatContext(context, catId);
    const [sources, derived] = await Promise.all([
      context.dependencies.companionStore.listSources(catId),
      context.dependencies.companionStore.listDerived(catId),
    ]);
    const profile = projectCompanionProfile({ sources, derived });
    sendJson(context.response, 200, { profile });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

async function handleListCompanionMemory(
  context: ChatApiRouteContext,
  catId: string,
): Promise<void> {
  try {
    await resolveCatContext(context, catId);
    const memory = await context.dependencies.companionStore.listMemory(catId);
    sendJson(context.response, 200, { memory });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

async function handleCreateCompanionMemory(
  context: ChatApiRouteContext,
  catId: string,
): Promise<void> {
  try {
    await resolveCatContext(context, catId);
    const body = await readJsonBody<Partial<CreateCompanionMemoryInput>>(context.request);
    if (!isCompanionMemoryCategory(body.category)) {
      sendRestError(
        context,
        400,
        'invalid_companion_memory_category',
        'Invalid companion memory category.',
      );
      return;
    }
    if (!body.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
      sendRestError(
        context,
        400,
        'companion_memory_content_required',
        'Companion memory content is required.',
      );
      return;
    }
    const memory = await context.dependencies.companionStore.createMemory(catId, {
      category: body.category,
      content: body.content,
      summary: body.summary ?? null,
      sourceIds: Array.isArray(body.sourceIds) ? body.sourceIds : [],
      metadata: body.metadata ?? {},
    });
    const canonicalSync = await syncCanonicalCompanionMemory(context, catId);
    sendJson(context.response, 201, { memory, canonicalSync });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

async function handleDeleteCompanionMemory(
  context: ChatApiRouteContext,
  catId: string,
  memoryId: string,
): Promise<void> {
  try {
    await resolveCatContext(context, catId);
    const result = await context.dependencies.companionStore.deleteMemory(catId, memoryId);
    if (!result.deleted) {
      sendRestError(context, 404, 'companion_memory_not_found', `Companion memory not found: ${memoryId}`);
      return;
    }
    sendJson(context.response, 200, { deleted: true, memoryId });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

async function handleUpdateCompanionMemoryStatus(
  context: ChatApiRouteContext,
  catId: string,
  memoryId: string,
): Promise<void> {
  try {
    await resolveCatContext(context, catId);
    const body = await readJsonBody<{ status?: string }>(context.request);
    if (body.status !== 'active' && body.status !== 'archived') {
      sendRestError(context, 400, 'invalid_companion_memory_status', 'Status must be "active" or "archived".');
      return;
    }
    const memory = await context.dependencies.companionStore.updateMemoryStatus(catId, memoryId, body.status);
    sendJson(context.response, 200, { memory });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

async function handleGetCompanionResponseProfile(
  context: ChatApiRouteContext,
  catId: string,
): Promise<void> {
  try {
    await resolveCatContext(context, catId);
    const responseProfile = await context.dependencies.companionStore.getResponseProfile(catId);
    sendJson(context.response, 200, { responseProfile });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

async function handleUpdateCompanionResponseProfile(
  context: ChatApiRouteContext,
  catId: string,
): Promise<void> {
  try {
    await resolveCatContext(context, catId);
    const body = await readJsonBody<UpdateCompanionResponseProfileInput>(context.request);
    if (body.expressionMode !== undefined && !isCompanionExpressionMode(body.expressionMode)) {
      sendRestError(
        context,
        400,
        'invalid_companion_expression_mode',
        'Invalid companion expression mode.',
      );
      return;
    }
    if (body.outputMode !== undefined && !isCompanionOutputMode(body.outputMode)) {
      sendRestError(
        context,
        400,
        'invalid_companion_output_mode',
        'Invalid companion output mode.',
      );
      return;
    }
    const responseProfile = await context.dependencies.companionStore.updateResponseProfile(
      catId,
      body,
    );
    const canonicalSync = await syncCanonicalCompanionMemory(context, catId);
    sendJson(context.response, 200, { responseProfile, canonicalSync });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

async function handleGetCompanionSessionContext(
  context: ChatApiRouteContext,
  catId: string,
): Promise<void> {
  try {
    const { state, cat } = await resolveCatContext(context, catId);
    const channelId = context.url.searchParams.get('channelId')?.trim() ?? '';
    const channel = channelId
      ? requireChannel(state, channelId)
      : {
          id: null,
          title: `${cat.name} Companion`,
          topic: 'Companion hydration preview.',
          roomRouting: createDefaultRoomRoutingState({
            mode: 'direct_cat_chat',
            defaultRecipientId: cat.id,
          }),
          workingMemory: undefined,
        };
    const requestedSkills = resolveSkillProfileManifest({
      profileId: cat.skillProfile,
      catId: cat.id,
      roomMode: channel.roomRouting?.mode ?? 'direct_cat_chat',
      transport: 'web',
      metadata: { catId: cat.id },
    })?.requestedSkills ?? [];
    const sessionContext = await context.dependencies.companionStore.buildSessionContext({
      cat,
      channel: {
        id: channel.id,
        title: channel.title,
        topic: channel.topic,
        roomRouting: channel.roomRouting,
        workingMemory: channel.workingMemory,
      },
      requestedSkills,
      transport: 'web',
    });
    sendJson(context.response, 200, { sessionContext });
  } catch (error) {
    handleRestError(context, error);
  }
}

export async function routeCompanionBoxApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
  const sessionContextMatch = matchRoute(
    context.url.pathname,
    /^\/api\/cats\/([^/]+)\/companion-box\/session-context$/u,
  );
  if (sessionContextMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleGetCompanionSessionContext(context, sessionContextMatch[0]!);
    return true;
  }

  const responseProfileMatch = matchRoute(
    context.url.pathname,
    /^\/api\/cats\/([^/]+)\/companion-box\/response-profile$/u,
  );
  if (responseProfileMatch) {
    if (context.method === 'GET') {
      await handleGetCompanionResponseProfile(context, responseProfileMatch[0]!);
      return true;
    }
    if (context.method === 'PATCH') {
      await handleUpdateCompanionResponseProfile(context, responseProfileMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'PATCH']);
    return true;
  }

  const memoryItemMatch = matchRoute(
    context.url.pathname,
    /^\/api\/cats\/([^/]+)\/companion-box\/memory\/([^/]+)$/u,
  );
  if (memoryItemMatch) {
    if (context.method === 'DELETE') {
      await handleDeleteCompanionMemory(context, memoryItemMatch[0]!, memoryItemMatch[1]!);
      return true;
    }
    if (context.method === 'PATCH') {
      await handleUpdateCompanionMemoryStatus(context, memoryItemMatch[0]!, memoryItemMatch[1]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['DELETE', 'PATCH']);
    return true;
  }

  const memoryMatch = matchRoute(
    context.url.pathname,
    /^\/api\/cats\/([^/]+)\/companion-box\/memory$/u,
  );
  if (memoryMatch) {
    if (context.method === 'GET') {
      await handleListCompanionMemory(context, memoryMatch[0]!);
      return true;
    }
    if (context.method === 'POST') {
      await handleCreateCompanionMemory(context, memoryMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  const profileMatch = matchRoute(
    context.url.pathname,
    /^\/api\/cats\/([^/]+)\/companion-box\/profile$/u,
  );
  if (profileMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleGetCompanionProfileReadModel(context, profileMatch[0]!);
    return true;
  }

  const derivedMatch = matchRoute(
    context.url.pathname,
    /^\/api\/cats\/([^/]+)\/companion-box\/derived$/u,
  );
  if (derivedMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleListCompanionDerived(context, derivedMatch[0]!);
    return true;
  }

  const sourcesMatch = matchRoute(
    context.url.pathname,
    /^\/api\/cats\/([^/]+)\/companion-box\/sources$/u,
  );
  if (sourcesMatch) {
    if (context.method === 'GET') {
      await handleListCompanionSources(context, sourcesMatch[0]!);
      return true;
    }
    if (context.method === 'POST') {
      await handleCreateCompanionSource(context, sourcesMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  const sourceItemMatch = matchRoute(
    context.url.pathname,
    /^\/api\/cats\/([^/]+)\/companion-box\/sources\/([^/]+)$/u,
  );
  if (sourceItemMatch) {
    if (context.method === 'PUT') {
      await handleUpdateCompanionSource(context, sourceItemMatch[0]!, sourceItemMatch[1]!);
      return true;
    }
    if (context.method === 'DELETE') {
      await handleDeleteCompanionSource(context, sourceItemMatch[0]!, sourceItemMatch[1]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['PUT', 'DELETE']);
    return true;
  }

  const companionBoxMatch = matchRoute(
    context.url.pathname,
    /^\/api\/cats\/([^/]+)\/companion-box$/u,
  );
  if (companionBoxMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleGetCompanionBox(context, companionBoxMatch[0]!);
    return true;
  }

  return false;
}
