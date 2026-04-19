import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../../../shared/http.js';
import {
  selectChannel,
  updateNewChatDefaults,
} from '../../state/model/index.js';
import { parseProviderModelSelection } from '../../../../shared/providerSelection.js';
import {
  createDefaultFolderBrowsePreferences,
  normalizeFolderBrowsePreferences,
  writeFolderBrowseRememberedPath,
} from '../../../shared/folderBrowsePreferences.js';
import { CONCURRENT_PRESENTATION_MODES } from '../contracts.js';
import {
  DEFAULT_CHAT_SCOPE_ID,
  handleRestError,
  nowFrom,
  requireValidChatScopeId,
  type ChatApiRouteContext,
} from '../routeSupport.js';
import type { ChatState } from '../../api/contracts.js';

function serializePreferences(state: ChatState) {
  return {
    selectedChannelId: state.selectedChannelId,
    showVerboseMessages: state.showVerboseMessages,
    showLiveProgressDetails: state.showLiveProgressDetails ?? false,
    concurrentPresentationMode: state.concurrentPresentationMode ?? 'inline_stack',
    newChatDefaults: state.newChatDefaults,
    folderBrowsePreferences: state.folderBrowsePreferences ?? createDefaultFolderBrowsePreferences(),
  };
}

function applyPreferencePatch(
  state: ChatState,
  body: {
    showVerboseMessages?: boolean;
    showLiveProgressDetails?: boolean;
    concurrentPresentationMode?: string;
    newChatDefaults?: {
      provider?: string;
      instance?: string | null;
      model?: string | null;
      modelSelection?: unknown;
    };
    folderBrowsePreference?: {
      surface?: string;
      directLaneCatId?: string | null;
      path?: string | null;
    };
  },
): ChatState {
  let nextState = state;

  if (typeof body.showVerboseMessages === 'boolean') {
    nextState = {
      ...nextState,
      showVerboseMessages: body.showVerboseMessages,
    };
  }

  if (typeof body.showLiveProgressDetails === 'boolean') {
    nextState = {
      ...nextState,
      showLiveProgressDetails: body.showLiveProgressDetails,
    };
  }

  if (typeof body.concurrentPresentationMode === 'string'
    && (CONCURRENT_PRESENTATION_MODES as readonly string[]).includes(body.concurrentPresentationMode)) {
    nextState = {
      ...nextState,
      concurrentPresentationMode: body.concurrentPresentationMode as typeof nextState.concurrentPresentationMode,
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

  if (body.folderBrowsePreference && typeof body.folderBrowsePreference === 'object') {
    const surface = body.folderBrowsePreference.surface;
    if (surface === 'chat' || surface === 'work' || surface === 'code') {
      nextState = {
        ...nextState,
        folderBrowsePreferences: writeFolderBrowseRememberedPath(
          normalizeFolderBrowsePreferences(nextState.folderBrowsePreferences),
          {
            surface,
            directLaneCatId: body.folderBrowsePreference.directLaneCatId ?? null,
          },
          body.folderBrowsePreference.path ?? null,
        ),
      };
    }
  }

  return nextState;
}

async function handleRestGetPreferences(
  context: ChatApiRouteContext,
  chatScopeId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    const state = await context.dependencies.chatStore.read();
    sendJson(context.response, 200, {
      preferences: serializePreferences(state),
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
      showLiveProgressDetails?: boolean;
      concurrentPresentationMode?: string;
      newChatDefaults?: {
        provider?: string;
        instance?: string | null;
        model?: string | null;
        modelSelection?: unknown;
      };
      folderBrowsePreference?: {
        surface?: string;
        directLaneCatId?: string | null;
        path?: string | null;
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
          nextState = applyPreferencePatch(nextState, body);
          return context.dependencies.chatStore.write(nextState);
        })
        : (async () => {
          let nextState = await context.dependencies.chatStore.read();
          nextState = applyPreferencePatch(nextState, body);
          return context.dependencies.chatStore.write(nextState);
        })()
    );

    sendJson(context.response, 200, {
      preferences: serializePreferences(persisted),
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
