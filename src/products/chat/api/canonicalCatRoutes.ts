import { matchRoute, readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import { buildChannelView, requireCat } from '../workspace/model.js';
import type { AssignChannelCatInput, CreateCatInput } from './contracts.js';
import {
  handleCanonicalCatError,
  mapChannelCat,
  persistCatAssignmentRemoval,
  persistCatAssignmentUpdate,
  persistCreatedCat,
  persistDeletedCat,
  type ChatApiRouteContext,
} from './shared.js';

async function handleCanonicalListCats(
  context: ChatApiRouteContext,
): Promise<void> {
  try {
    const state = await context.dependencies.chatStore.read();
    sendJson(context.response, 200, { cats: state.cats });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

async function handleCanonicalCreateCat(
  context: ChatApiRouteContext,
): Promise<void> {
  try {
    const body = await readJsonBody<CreateCatInput>(context.request);
    const persisted = await persistCreatedCat(context, body);
    sendJson(context.response, 201, { cat: persisted.cats[0] });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

async function handleCanonicalGetCat(
  context: ChatApiRouteContext,
  catId: string,
): Promise<void> {
  try {
    const state = await context.dependencies.chatStore.read();
    sendJson(context.response, 200, { cat: requireCat(state, catId) });
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
      await context.dependencies.chatStore.read(),
      channelId,
    );
    sendJson(context.response, 200, {
      cats: view.assignedCats.map(mapChannelCat),
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
    const body = await readJsonBody<Omit<AssignChannelCatInput, 'catId'>>(
      context.request,
    );
    const { persisted, isNew } = await persistCatAssignmentUpdate(context, channelId, {
      catId: catId,
      ...body,
    });
    const assignment = buildChannelView(persisted, channelId).assignedCats.find(
      (candidate) => candidate.catId === catId,
    );
    sendJson(context.response, isNew ? 201 : 200, {
      cat: assignment ? mapChannelCat(assignment) : null,
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
    await persistCatAssignmentRemoval(context, channelId, catId);
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
