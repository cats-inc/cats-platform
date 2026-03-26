import { buildCoreMemoryMaintenanceSummary } from '../memoryMaintenance.js';
import type { CoreApiRouteContext } from './types.js';
import { handleCoreError } from './shared.js';
import { sendJson, sendMethodNotAllowed } from '../../shared/http.js';

async function handleCoreMemoryMaintenance(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  sendJson(context.response, 200, {
    maintenance: buildCoreMemoryMaintenanceSummary(core),
  });
}

export async function routeCoreMemoryMaintenanceApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname !== '/api/core/memory-maintenance') {
    return false;
  }

  if (context.method !== 'GET') {
    sendMethodNotAllowed(context.response, ['GET']);
    return true;
  }

  try {
    await handleCoreMemoryMaintenance(context);
  } catch (error) {
    handleCoreError(context, error);
  }
  return true;
}
