import type { CoreApiRouteContext } from './types.js';
import { routeCoreExecutionRecordApi } from './recordExecutionRoutes.js';
import { routeCoreGovernanceRecordApi } from './recordGovernanceRoutes.js';
import { routeCorePlanningRecordApi } from './recordPlanningRoutes.js';

export async function routeCoreRecordApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
  if (await routeCorePlanningRecordApi(context)) {
    return true;
  }

  if (await routeCoreExecutionRecordApi(context)) {
    return true;
  }

  if (await routeCoreGovernanceRecordApi(context)) {
    return true;
  }

  return false;
}
