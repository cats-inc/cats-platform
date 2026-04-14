import type { CoreApiRouteContext } from './types.js';
import { routeCoreExecutionRecordApi } from './recordExecutionRoutes.js';
import { routeCoreGovernanceRecordApi } from './recordGovernanceRoutes.js';
import { routeCoreInteractionRecordApi } from './recordInteractionRoutes.js';
import { routeCoreMemoryRecordApi } from './recordMemoryRoutes.js';
import { routeCorePlanningRecordApi } from './recordPlanningRoutes.js';
import { routeCoreStructuralRecordApi } from './recordStructuralRoutes.js';

export async function routeCoreRecordApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
  if (await routeCoreStructuralRecordApi(context)) {
    return true;
  }

  if (await routeCorePlanningRecordApi(context)) {
    return true;
  }

  if (await routeCoreInteractionRecordApi(context)) {
    return true;
  }

  if (await routeCoreExecutionRecordApi(context)) {
    return true;
  }

  if (await routeCoreGovernanceRecordApi(context)) {
    return true;
  }

  if (await routeCoreMemoryRecordApi(context)) {
    return true;
  }

  return false;
}
