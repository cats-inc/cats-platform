import type {
  ChatApiRouteContext,
} from './shared.js';
import { routeChatChannelResourceApi } from './resourceChannelRoutes.js';
import { routeChatOrchestratorResourceApi } from './resourceOrchestratorRoutes.js';
import { routeChatPreferenceResourceApi } from './resourcePreferenceRoutes.js';

export async function routeChatResourceApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
  if (await routeChatPreferenceResourceApi(context)) {
    return true;
  }

  if (await routeChatOrchestratorResourceApi(context)) {
    return true;
  }

  if (await routeChatChannelResourceApi(context)) {
    return true;
  }

  return false;
}
