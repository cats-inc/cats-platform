import type { CoreApiRouteContext } from './types.js';
import { routeCoreApprovalsApi } from './controlApprovals.js';
import { routeCoreOperatorActionsApi } from './controlOperatorActions.js';
import { routeCoreOwnerProfileApi } from './controlOwnerProfile.js';

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
