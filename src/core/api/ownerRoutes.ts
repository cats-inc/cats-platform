import { applyOwnerAction, listOwnerRecords, ownerActionView } from '../ownerActions.js';
import { createHash } from 'node:crypto';
import type { PlanningOwnerFamily } from '../ownerActionContracts.js';
import { handleCoreError } from './shared.js';
import { CoreConflictError, CoreValidationError } from '../errors.js';
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
      if (id === 'batch') {
        if (!body || !['preview', 'archive', 'restore'].includes(String(body.action)) || !Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 100 || body.ids.some(id => typeof id !== 'string')) throw new CoreValidationError('Select 1–100 records and archive or restore.');
        const ids = [...new Set(body.ids as string[])].sort();
        const batchToken = (token: string) => createHash('sha256').update(JSON.stringify({ token, ids })).digest('hex');
        if (body.action === 'preview') {
          const core = await context.dependencies.coreStore.readCore();
          const views = ids.map(id => ownerActionView(core, family, id));
          sendJson(context.response, 200, { token: batchToken(views[0].token), items: views.map(view => ({ id: view.id, title: view.title, actions: view.actions.filter(item => ['archive', 'restore'].includes(item.action)) })) });
        } else {
          await context.dependencies.coreStore.updateCore(core => {
            const views = ids.map(id => ownerActionView(core, family, id));
            if (batchToken(views[0].token) !== body.token) throw new CoreConflictError('The selection changed. Preview it again.');
            let next = core;
            for (const id of ids) next = applyOwnerAction(next, family, id, { action: body.action, token: ownerActionView(next, family, id).token });
            return next;
          });
          sendJson(context.response, 200, { ids, action: body.action });
        }
        return true;
      }
      const core = await context.dependencies.coreStore.updateCore(current => applyOwnerAction(current, family, id, body));
      sendJson(context.response, 200, { removed: body.action === 'delete', view: body.action === 'delete' ? null : ownerActionView(core, family, id) });
    } else sendMethodNotAllowed(context.response, id ? ['GET', 'POST'] : ['GET']);
  } catch (error) { handleCoreError(context, error); }
  return true;
}
