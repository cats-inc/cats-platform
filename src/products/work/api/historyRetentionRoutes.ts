import { handleCoreError } from '../../../core/api/shared.js';
import { CoreValidationError } from '../../../core/errors.js';
import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import { historyRetentionView, updateHistoryRetention } from '../state/historyRetention.js';
import type { WorkApiRouteContext } from './index.js';

export async function routeHistoryRetention(context: WorkApiRouteContext): Promise<boolean> {
  if (context.url.pathname !== '/api/work/history/retention') return false;
  if (!['GET', 'PATCH'].includes(context.method)) { sendMethodNotAllowed(context.response, ['GET', 'PATCH']); return true; }
  try {
    let core;
    if (context.method === 'PATCH') {
      const input = await readJsonBody<Record<string, unknown>>(context.request);
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CoreValidationError('A retention policy is required.');
      core = await context.dependencies.coreStore.updateCore(current => updateHistoryRetention(current, input));
    } else core = await context.dependencies.coreStore.readCore();
    sendJson(context.response, 200, historyRetentionView(core, context.dependencies.now?.()));
  } catch (error) { handleCoreError(context, error); }
  return true;
}
