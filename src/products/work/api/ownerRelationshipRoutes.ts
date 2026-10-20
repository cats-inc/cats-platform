import { handleCoreError } from '../../../core/api/shared.js';
import { CoreValidationError } from '../../../core/errors.js';
import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import { applyOrphanLinks, applyOwnerRelationship, ownerLinkView, ownerRelationshipView, previewOrphanLinks, repairOwnerLink } from '../state/ownerRelationships.js';
import type { WorkApiRouteContext } from './index.js';

export async function routeOwnerRelationships(context: WorkApiRouteContext): Promise<boolean> {
  const batch = context.url.pathname === '/api/work/relationships/orphan-links';
  const match = /^\/api\/work\/relationships\/([^/]+)\/([^/]+)$/u.exec(context.url.pathname);
  if (!batch && !match) return false;
  try {
    if (batch && context.method === 'POST') {
      const body = await readJsonBody<Record<string, unknown>>(context.request);
      if (!body || !['preview', 'apply'].includes(String(body.action))) throw new CoreValidationError('Preview or apply an exact orphan-link selection.');
      if (body?.action === 'preview') sendJson(context.response, 200, previewOrphanLinks(await context.dependencies.coreStore.readCore(), body.ids));
      else { await context.dependencies.coreStore.updateCore(core => applyOrphanLinks(core, body)); sendJson(context.response, 200, { removed: body.ids }); }
    } else if (match) {
      const family = match[1], id = decodeURIComponent(match[2]);
      if (context.method === 'GET') { const core = await context.dependencies.coreStore.readCore(); sendJson(context.response, 200, family === 'link' ? ownerLinkView(core, id) : ownerRelationshipView(core, family, id)); }
      else if (context.method === 'POST') { const body = await readJsonBody<Record<string, unknown>>(context.request); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CoreValidationError('A relationship command is required.'); const core = await context.dependencies.coreStore.updateCore(core => family === 'link' ? repairOwnerLink(core, id, body) : applyOwnerRelationship(core, family, id, body)); sendJson(context.response, 200, family === 'link' ? { merged: !core.workGraphLinks.some(link => link.id === id), view: core.workGraphLinks.some(link => link.id === id) ? ownerLinkView(core, id) : null } : ownerRelationshipView(core, family, id)); }
      else sendMethodNotAllowed(context.response, ['GET', 'POST']);
    } else sendMethodNotAllowed(context.response, ['POST']);
  } catch (error) { handleCoreError(context, error); }
  return true;
}
