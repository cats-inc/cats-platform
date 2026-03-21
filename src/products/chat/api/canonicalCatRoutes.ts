import { matchRoute, readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import { buildChannelView, requirePal } from '../workspace/model.js';
import type { AssignChannelPalInput, CreateWorkspacePalInput } from './contracts.js';
import {
  handleCanonicalCatError,
  mapAssignmentToCat,
  persistAssignmentRemoval,
  persistAssignmentUpdate,
  persistCreatedPal,
  persistDeletedCat,
  type ChatApiRouteContext,
} from './shared.js';

async function handleCanonicalListCats(
  context: ChatApiRouteContext,
): Promise<void> {
  try {
    const state = await context.dependencies.workspaceStore.read();
    sendJson(context.response, 200, { cats: state.pals });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

async function handleCanonicalCreateCat(
  context: ChatApiRouteContext,
): Promise<void> {
  try {
    const body = await readJsonBody<CreateWorkspacePalInput>(context.request);
    const persisted = await persistCreatedPal(context, body);
    sendJson(context.response, 201, { cat: persisted.pals[0] });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

async function handleCanonicalGetCat(
  context: ChatApiRouteContext,
  catId: string,
): Promise<void> {
  try {
    const state = await context.dependencies.workspaceStore.read();
    sendJson(context.response, 200, { cat: requirePal(state, catId) });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

async function handleCanonicalDeleteCat(
  context: ChatApiRouteContext,
  catId: string,
): Promise<void> {
  try {
    await persistDeletedCat(context, catId);
    sendJson(context.response, 200, { deleted: true, catId });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

async function handleCanonicalListChannelCats(
  context: ChatApiRouteContext,
  channelId: string,
): Promise<void> {
  try {
    const view = buildChannelView(
      await context.dependencies.workspaceStore.read(),
      channelId,
    );
    sendJson(context.response, 200, {
      cats: view.assignedPals.map(mapAssignmentToCat),
    });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

async function handleCanonicalAssignChannelCat(
  context: ChatApiRouteContext,
  channelId: string,
  catId: string,
): Promise<void> {
  try {
    const body = await readJsonBody<Omit<AssignChannelPalInput, 'palId'>>(
      context.request,
    );
    const { persisted, isNew } = await persistAssignmentUpdate(context, channelId, {
      palId: catId,
      ...body,
    });
    const assignment = buildChannelView(persisted, channelId).assignedPals.find(
      (candidate) => candidate.palId === catId,
    );
    sendJson(context.response, isNew ? 201 : 200, {
      cat: assignment ? mapAssignmentToCat(assignment) : null,
    });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

async function handleCanonicalRemoveChannelCat(
  context: ChatApiRouteContext,
  channelId: string,
  catId: string,
): Promise<void> {
  try {
    await persistAssignmentRemoval(context, channelId, catId);
    sendJson(context.response, 200, { removed: true, channelId, catId });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

export async function routeCanonicalCatApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/cats') {
    if (context.method === 'GET') {
      await handleCanonicalListCats(context);
      return true;
    }
    if (context.method === 'POST') {
      await handleCanonicalCreateCat(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  const canonicalCatDetailMatch = matchRoute(
    context.url.pathname,
    /^\/api\/cats\/([^/]+)$/u,
  );
  if (canonicalCatDetailMatch) {
    if (context.method === 'GET') {
      await handleCanonicalGetCat(context, canonicalCatDetailMatch[0]);
      return true;
    }
    if (context.method === 'DELETE') {
      await handleCanonicalDeleteCat(context, canonicalCatDetailMatch[0]);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'DELETE']);
    return true;
  }

  const canonicalChannelCatDetailMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/cats\/([^/]+)$/u,
  );
  if (canonicalChannelCatDetailMatch) {
    if (context.method === 'PUT') {
      await handleCanonicalAssignChannelCat(
        context,
        canonicalChannelCatDetailMatch[0],
        canonicalChannelCatDetailMatch[1],
      );
      return true;
    }
    if (context.method === 'DELETE') {
      await handleCanonicalRemoveChannelCat(
        context,
        canonicalChannelCatDetailMatch[0],
        canonicalChannelCatDetailMatch[1],
      );
      return true;
    }
    sendMethodNotAllowed(context.response, ['PUT', 'DELETE']);
    return true;
  }

  const canonicalChannelCatsMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/cats$/u,
  );
  if (canonicalChannelCatsMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleCanonicalListChannelCats(context, canonicalChannelCatsMatch[0]);
    return true;
  }

  return false;
}
