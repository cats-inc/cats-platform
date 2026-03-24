import type { CoreApiRouteContext } from './apiTypes.js';
import { routeCoreApprovalsApi } from './apiControlApprovals.js';
import { routeCoreOperatorActionsApi } from './apiControlOperatorActions.js';
import { routeCoreOwnerProfileApi } from './apiControlOwnerProfile.js';

export async function routeCoreControlApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
  if (await routeCoreApprovalsApi(context)) {
    return true;
  }

  if (await routeCoreOperatorActionsApi(context)) {
    return true;
  }

  if (await routeCoreOwnerProfileApi(context)) {
    return true;
  }

  return false;
}
