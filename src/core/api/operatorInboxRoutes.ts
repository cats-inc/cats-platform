import { listCoreOperatorInboxItems } from '../operatorInbox.js';
import type { CoreApiRouteContext } from './types.js';
import { handleCoreError } from './shared.js';
import { sendJson, sendMethodNotAllowed } from '../../shared/http.js';

async function handleCoreOperatorInbox(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  sendJson(context.response, 200, {
    tasks: listCoreOperatorInboxItems(core),
  });
}

export async function routeCoreOperatorInboxApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname !== '/api/core/operator-inbox') {
    return false;
  }

  if (context.method !== 'GET') {
    sendMethodNotAllowed(context.response, ['GET']);
    return true;
  }

  try {
    await handleCoreOperatorInbox(context);
  } catch (error) {
    handleCoreError(context, error);
  }
  return true;
}
