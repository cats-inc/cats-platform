import type { ChatApiRouteContext } from '../shared.js';
import { routeCatMemoryApi } from './catRoutes.js';
import { routeChannelMemoryApi } from './channelRoutes.js';
import { routeOwnerMemoryApi } from './ownerRoutes.js';

export async function routeMemoryApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
  if (await routeOwnerMemoryApi(context)) {
    return true;
  }

  if (await routeChannelMemoryApi(context)) {
    return true;
  }

  if (await routeCatMemoryApi(context)) {
    return true;
  }

  return false;
}
