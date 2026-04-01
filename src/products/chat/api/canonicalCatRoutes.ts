import { matchRoute, readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import { buildChannelView, renameCat, requireCat, setBossCat, updateCatExecutionTarget, updateCatProducts, updateCatSkillProfile } from '../state/model/index.js';
import type { AssignChannelCatInput, CreateCatInput } from './contracts.js';
import type { ProviderModelSelection } from '../../../shared/providerSelection.js';
import {
  buildAppShellPayload,
  handleCanonicalCatError,
  handleRestError,
  mapChannelCat,
  persistArchivedCat,
  persistCatAssignmentRemoval,
  persistCatAssignmentUpdate,
  persistCreatedCat,
  persistDeletedCat,
  persistUnarchivedCat,
  persistUpdatedCat,
  type ChatApiRouteContext,
} from './routeSupport.js';

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

async function handleCanonicalUpdateCat(
  context: ChatApiRouteContext,
  catId: string,
): Promise<void> {
  try {
    const body = await readJsonBody<{
      skillProfile?: string | null;
      name?: string;
      makeBoss?: boolean;
      products?: string[];
      archive?: boolean;
      unarchive?: boolean;
      provider?: string;
      instance?: string | null;
      model?: string | null;
      modelSelection?: ProviderModelSelection | null;
      avatarUrl?: string | null;
    }>(context.request);
    const currentState = await context.dependencies.chatStore.read();
    let state = currentState;
    if (body.name !== undefined) {
      state = renameCat(state, catId, body.name);
    }
    if (body.skillProfile !== undefined) {
      state = updateCatSkillProfile(state, catId, body.skillProfile);
    }
    if (body.makeBoss) {
      state = setBossCat(state, catId);
    }
    if (body.products !== undefined) {
      state = updateCatProducts(state, catId, body.products);
    }
    if (body.provider !== undefined || body.instance !== undefined || body.model !== undefined || body.modelSelection !== undefined) {
      state = updateCatExecutionTarget(state, catId, {
        provider: body.provider,
        instance: body.instance,
        model: body.model,
        modelSelection: body.modelSelection,
      });
    }
    if (body.avatarUrl !== undefined) {
      const cat = state.cats.find((c) => c.id === catId);
      if (cat) {
        cat.avatarUrl = typeof body.avatarUrl === 'string' ? body.avatarUrl : null;
        cat.updatedAt = new Date().toISOString();
      }
    }
    if (body.archive && body.unarchive) {
      throw new Error('Cat cannot be archived and recovered at the same time');
    }
    if (body.archive) {
      state = await persistArchivedCat(context, state, catId);
    } else if (body.unarchive) {
      state = await persistUnarchivedCat(context, state, catId);
    } else {
      state = await persistUpdatedCat(context, currentState, state, catId);
    }
    sendJson(
      context.response,
      200,
      await buildAppShellPayload(context.dependencies, state),
    );
  } catch (error) {
    handleRestError(context, error);
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
    await context.dependencies.mutationGate.run(channelId, async () => {
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
    await context.dependencies.mutationGate.run(channelId, async () => {
      await persistCatAssignmentRemoval(context, channelId, catId);
      sendJson(context.response, 200, { removed: true, channelId, catId });
    });
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
      await handleCanonicalGetCat(context, canonicalCatDetailMatch[0]!);
      return true;
    }
    if (context.method === 'PATCH') {
      await handleCanonicalUpdateCat(context, canonicalCatDetailMatch[0]!);
      return true;
    }
    if (context.method === 'DELETE') {
      await handleCanonicalDeleteCat(context, canonicalCatDetailMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'PATCH', 'DELETE']);
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
        canonicalChannelCatDetailMatch[0]!,
        canonicalChannelCatDetailMatch[1]!,
      );
      return true;
    }
    if (context.method === 'DELETE') {
      await handleCanonicalRemoveChannelCat(
        context,
        canonicalChannelCatDetailMatch[0]!,
        canonicalChannelCatDetailMatch[1]!,
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
    await handleCanonicalListChannelCats(context, canonicalChannelCatsMatch[0]!);
    return true;
  }

  return false;
}
