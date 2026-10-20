import { applyOwnerAction, listOwnerRecords, ownerActionView } from '../ownerActions.js';
import type { PlanningOwnerFamily } from '../ownerActionContracts.js';
import { handleCoreError } from './shared.js';
import type { CoreApiRouteContext } from './types.js';
import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../shared/http.js';

export async function routeCoreOwnerApi(context: CoreApiRouteContext): Promise<boolean> {
  const match = /^\/api\/core\/owner\/(project|work_item|task|artifact)(?:\/([^/]+))?$/u.exec(context.url.pathname);
  if (!match) return false;
  const family = match[1] as PlanningOwnerFamily;
  try {
    const id = match[2] ? decodeURIComponent(match[2]) : null;
    if (context.method === 'GET') {
      const core = await context.dependencies.coreStore.readCore();
      sendJson(context.response, 200, id ? ownerActionView(core, family, id) : { items: listOwnerRecords(core, family) });
    } else if (context.method === 'POST' && id) {
      const body = await readJsonBody<Record<string, unknown>>(context.request);
      const core = await context.dependencies.coreStore.updateCore(current => applyOwnerAction(current, family, id, body));
      sendJson(context.response, 200, { removed: body.action === 'delete', view: body.action === 'delete' ? null : ownerActionView(core, family, id) });
    } else sendMethodNotAllowed(context.response, id ? ['GET', 'POST'] : ['GET']);
  } catch (error) { handleCoreError(context, error); }
  return true;
}
