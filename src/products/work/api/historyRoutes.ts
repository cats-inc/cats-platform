import { handleCoreError } from '../../../core/api/shared.js';
import { CoreConflictError, CoreValidationError } from '../../../core/errors.js';
import { ownerSubjectKey, setOwnerEntry } from '../../../core/ownerLifecycle.js';
import { getOwnerRecord } from '../../../core/ownerManagement.js';
import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import { applyHistory, exportHistory, isTerminalHistory, previewHistory, validateHistoryRequest } from '../state/historyManagement.js';
import type { WorkApiRouteContext } from './index.js';
import { listExecutionHistory } from '../state/historyListing.js';

export async function routeWorkHistoryApi(context: WorkApiRouteContext): Promise<boolean> {
  if (context.url.pathname === '/api/work/history') {
    if (context.method !== 'GET') { sendMethodNotAllowed(context.response, ['GET']); return true; }
    try { sendJson(context.response, 200, listExecutionHistory(await context.dependencies.coreStore.readCore(), context.url.searchParams)); }
    catch (error) { handleCoreError(context, error); }
    return true;
  }
  const match = /^\/api\/work\/history\/(preview|apply|export|listing)$/u.exec(context.url.pathname);
  if (!match) return false;
  if (context.method !== 'POST') { sendMethodNotAllowed(context.response, ['POST']); return true; }
  try {
    const body = await readJsonBody<Record<string, unknown>>(context.request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CoreValidationError('A history request is required.');
    if (match[1] === 'preview') sendJson(context.response, 200, previewHistory(await context.dependencies.coreStore.readCore(), body));
    else if (match[1] === 'export') sendJson(context.response, 200, exportHistory(await context.dependencies.coreStore.readCore(), body));
    else if (match[1] === 'listing') {
      const request = validateHistoryRequest({ ...body, scope: 'history' });
      if (!['archive', 'restore'].includes(String(body.action))) throw new CoreValidationError('Choose archive or restore.');
      const core = await context.dependencies.coreStore.updateCore(current => {
        if (body.revision !== (current.ownerLifecycle?.revision ?? 0)) throw new CoreConflictError('Refresh the list and try again.', 'owner_revision_stale');
        let next = current;
        for (const subject of request.subjects) {
          const record = getOwnerRecord(next, subject.family, subject.id);
          if (!record || body.action === 'archive' && !isTerminalHistory(record)) throw new CoreConflictError('Only completed history can be archived. Stop active work first.', 'owner_history_active');
          next = setOwnerEntry(next, subject.family, subject.id, { listing: body.action === 'archive' ? 'archived' : 'visible' });
        }
        return next;
      });
      sendJson(context.response, 200, { revision: core.ownerLifecycle?.revision ?? 0, subjects: request.subjects.map(subject => ownerSubjectKey(subject.family, subject.id)) });
    } else {
      let receipt: ReturnType<typeof applyHistory>['receipt'] | undefined;
      await context.dependencies.coreStore.updateCore(core => { const result = applyHistory(core, body); receipt = result.receipt; return result.core; });
      sendJson(context.response, 200, { receipt, reclaimedBytes: null });
    }
  } catch (error) { handleCoreError(context, error); }
  return true;
}
