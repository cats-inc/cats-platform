import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../../../shared/http.js';
import {
  wakeChannelEntryParticipant,
} from '../../state/runtimeActions.js';
import {
  selectChannel,
} from '../../state/model/index.js';
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
    }>(context.request);
    let nextState = await context.dependencies.chatStore.read();

    if (body.selectedChannelId !== undefined) {
      nextState = selectChannel(
        nextState,
        body.selectedChannelId,
        nowFrom(context.dependencies),
      );
      const wake = await wakeChannelEntryParticipant(
        nextState,
        body.selectedChannelId,
        context.dependencies.runtimeClient,
        nowFrom(context.dependencies),
        {
          companionStore: context.dependencies.companionStore,
          memoryService: context.dependencies.memoryService,
        },
      );
      nextState = wake.state;
    }

    if (typeof body.showVerboseMessages === 'boolean') {
      nextState = {
        ...nextState,
        showVerboseMessages: body.showVerboseMessages,
      };
    }

    const persisted = await context.dependencies.chatStore.write(nextState);
    sendJson(context.response, 200, {
      preferences: {
        selectedChannelId: persisted.selectedChannelId,
        showVerboseMessages: persisted.showVerboseMessages,
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
