import { routeBotBindingApi } from './botBindingRoutes.js';
import { routeCanonicalCatApi } from './canonicalCatRoutes.js';
import { routeCompanionBoxApi } from './companionBoxRoutes.js';
import { routeMemoryApi } from './memoryRoutes.js';
import { routeChatResourceApi } from './resourceRoutes.js';
import { routeChatShellApi } from './shellRoutes.js';
import { routeSetupApi } from './setupRoutes.js';
import {
  CHAT_API_SLICE,
  type ChatApiDependencies,
  type ChatApiRouteContext,
} from './shared.js';

export { CHAT_API_SLICE };
export type { ChatApiDependencies };

export async function routeChatApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
  if (await routeChatShellApi(context)) {
    return true;
  }

  if (await routeSetupApi(context)) {
    return true;
  }

  if (await routeCanonicalCatApi(context)) {
    return true;
  }

  if (await routeCompanionBoxApi(context)) {
    return true;
  }

  if (await routeMemoryApi(context)) {
    return true;
  }

  if (await routeBotBindingApi(context)) {
    return true;
  }

  if (await routeChatResourceApi(context)) {
    return true;
  }

  return false;
}
