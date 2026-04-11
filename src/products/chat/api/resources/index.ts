import type {
  ChatApiRouteContext,
} from '../routeSupport.js';
import { routeChatDebugResourceApi } from './debugRoutes.js';
import { routeChatChannelResourceApi } from './channelRoutes.js';
import { routeParallelChatGroupResourceApi } from './parallelChatGroupRoutes.js';
import { routeChatEventApi } from './eventRoutes.js';
import { routeChatOrchestratorResourceApi } from './orchestratorRoutes.js';
import { routeChatPreferenceResourceApi } from './preferenceRoutes.js';

export async function routeChatResourceApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
  if (await routeChatDebugResourceApi(context)) {
    return true;
  }

  if (await routeChatEventApi(context)) {
    return true;
  }

  if (await routeChatPreferenceResourceApi(context)) {
    return true;
  }

  if (await routeChatOrchestratorResourceApi(context)) {
    return true;
  }

  if (await routeParallelChatGroupResourceApi(context)) {
    return true;
  }

  if (await routeChatChannelResourceApi(context)) {
    return true;
  }

  return false;
}
