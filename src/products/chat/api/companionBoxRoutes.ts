import { matchRoute, readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import { resolveSkillProfileManifest } from '../../../shared/skillProfiles.js';
import { createDefaultRoomRoutingState } from '../state/roomRouting.js';
import { requireCat, requireChannel } from '../state/model.js';
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
  UpdateCompanionResponseProfileInput,
} from '../companion/contracts.js';
import {
  handleCanonicalCatError,
  handleRestError,
  sendRestError,
  type ChatApiRouteContext,
} from './shared.js';

async function resolveCatContext(context: ChatApiRouteContext, catId: string) {
  const state = await context.dependencies.chatStore.read();
  const cat = requireCat(state, catId);
  return { state, cat };
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
    sendJson(context.response, 201, {
      box: result.box,
      source: result.source,
      derivedRecords: result.derivedRecords,
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
    sendJson(context.response, 201, { memory });
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
    sendJson(context.response, 200, { responseProfile });
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
            leadParticipantId: cat.id,
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
