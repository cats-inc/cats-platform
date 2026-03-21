import type { CoreStore } from './store.js';
import type { RouteContext } from '../shared/http.js';
import { sendJson, sendMethodNotAllowed } from '../shared/http.js';
import { buildApprovalQueue } from './model.js';

export interface CoreApiDependencies {
  workspaceStore: Pick<CoreStore, 'readCore'>;
}

async function handleCoreState(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  sendJson(context.response, 200, await context.dependencies.workspaceStore.readCore());
}

async function handleCoreActors(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  const core = await context.dependencies.workspaceStore.readCore();
  sendJson(context.response, 200, { actors: core.actors });
}

async function handleCoreConversations(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  const core = await context.dependencies.workspaceStore.readCore();
  sendJson(context.response, 200, { conversations: core.conversations });
}

async function handleCoreTasks(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  const core = await context.dependencies.workspaceStore.readCore();
  sendJson(context.response, 200, { tasks: core.tasks });
}

async function handleCoreApprovals(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  const core = await context.dependencies.workspaceStore.readCore();
  sendJson(context.response, 200, { approvals: buildApprovalQueue(core) });
}

async function handleOwnerProfile(
  context: RouteContext<CoreApiDependencies>,
): Promise<void> {
  const core = await context.dependencies.workspaceStore.readCore();
  sendJson(context.response, 200, { ownerProfile: core.ownerProfile });
}

export async function routeCoreApi(
  context: RouteContext<CoreApiDependencies>,
): Promise<boolean> {
  if (context.url.pathname === '/api/core') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleCoreState(context);
    return true;
  }

  if (context.url.pathname === '/api/core/actors') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleCoreActors(context);
    return true;
  }

  if (context.url.pathname === '/api/core/conversations') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleCoreConversations(context);
    return true;
  }

  if (context.url.pathname === '/api/core/tasks') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleCoreTasks(context);
    return true;
  }

  if (context.url.pathname === '/api/core/approvals') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleCoreApprovals(context);
    return true;
  }

  if (context.url.pathname === '/api/core/owner-profile') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleOwnerProfile(context);
    return true;
  }

  return false;
}
