import type { ChatApiRouteContext } from './shared.js';
import { routeCatMemoryApi } from './memoryCatRoutes.js';
import { routeChannelMemoryApi } from './memoryChannelRoutes.js';
import { routeOwnerMemoryApi } from './memoryOwnerRoutes.js';

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
