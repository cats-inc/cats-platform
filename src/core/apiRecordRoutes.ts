import type { CoreApiRouteContext } from './apiTypes.js';
import { routeCoreExecutionRecordApi } from './apiRecordExecutionRoutes.js';
import { routeCoreGovernanceRecordApi } from './apiRecordGovernanceRoutes.js';
import { routeCorePlanningRecordApi } from './apiRecordPlanningRoutes.js';

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
