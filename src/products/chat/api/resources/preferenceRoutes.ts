import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../../../shared/http.js';
import {
  selectChannel,
  updateNewChatDefaults,
} from '../../state/model/index.js';
import { parseProviderModelSelection } from '../../../../shared/providerSelection.js';
import {
  DEFAULT_CHAT_SCOPE_ID,
  handleRestError,
  nowFrom,
  requireValidChatScopeId,
  type ChatApiRouteContext,
} from '../routeSupport.js';

async function handleRestGetPreferences(
  context: ChatApiRouteContext,
  chatScopeId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    const state = await context.dependencies.chatStore.read();
    sendJson(context.response, 200, {
      preferences: {
        selectedChannelId: state.selectedChannelId,
        showVerboseMessages: state.showVerboseMessages,
        newChatDefaults: state.newChatDefaults,
      },
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestUpdatePreferences(
  context: ChatApiRouteContext,
  chatScopeId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    const body = await readJsonBody<{
      selectedChannelId?: string;
      showVerboseMessages?: boolean;
      newChatDefaults?: {
        provider?: string;
        instance?: string | null;
        model?: string | null;
        modelSelection?: unknown;
      };
    }>(context.request);
    const persisted = await (
      body.selectedChannelId !== undefined
        ? context.dependencies.mutationGate.run(body.selectedChannelId, async () => {
          let nextState = await context.dependencies.chatStore.read();

          nextState = selectChannel(
            nextState,
            body.selectedChannelId!,
            nowFrom(context.dependencies),
          );

          if (typeof body.showVerboseMessages === 'boolean') {
            nextState = {
              ...nextState,
              showVerboseMessages: body.showVerboseMessages,
            };
          }

          if (body.newChatDefaults && typeof body.newChatDefaults === 'object') {
            nextState = updateNewChatDefaults(nextState, {
              provider: body.newChatDefaults.provider,
              instance: body.newChatDefaults.instance,
              model: body.newChatDefaults.model,
              modelSelection: parseProviderModelSelection(body.newChatDefaults.modelSelection),
            });
          }

          return context.dependencies.chatStore.write(nextState);
        })
        : (async () => {
          let nextState = await context.dependencies.chatStore.read();

          if (typeof body.showVerboseMessages === 'boolean') {
            nextState = {
              ...nextState,
              showVerboseMessages: body.showVerboseMessages,
            };
          }

          if (body.newChatDefaults && typeof body.newChatDefaults === 'object') {
            nextState = updateNewChatDefaults(nextState, {
              provider: body.newChatDefaults.provider,
              instance: body.newChatDefaults.instance,
              model: body.newChatDefaults.model,
              modelSelection: parseProviderModelSelection(body.newChatDefaults.modelSelection),
            });
          }

          return context.dependencies.chatStore.write(nextState);
        })()
    );

    sendJson(context.response, 200, {
      preferences: {
        selectedChannelId: persisted.selectedChannelId,
        showVerboseMessages: persisted.showVerboseMessages,
        newChatDefaults: persisted.newChatDefaults,
      },
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

export async function routeChatPreferenceResourceApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname !== '/api/preferences') {
    return false;
  }

  if (context.method === 'GET') {
    await handleRestGetPreferences(context, DEFAULT_CHAT_SCOPE_ID);
    return true;
  }
  if (context.method === 'PATCH') {
    await handleRestUpdatePreferences(context, DEFAULT_CHAT_SCOPE_ID);
    return true;
  }
  sendMethodNotAllowed(context.response, ['GET', 'PATCH']);
  return true;
}
