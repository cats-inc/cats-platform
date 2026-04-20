import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../../../shared/http.js';
import {
  selectChannel,
  updateNewChatDefaults,
} from '../../state/model/index.js';
import { parseProviderModelSelection } from '../../../../shared/providerSelection.js';
import {
  applyAdvancedDraftControlsPatch,
  createDefaultAdvancedDraftControlsPreferences,
  type AdvancedDraftControlsPatch,
} from '../../../shared/advancedDraftControls.js';
import {
  applyConversationBehaviorPatch,
  createDefaultConversationBehaviorPreferences,
  type ConversationBehaviorPatch,
} from '../../../shared/conversationBehavior.js';
import {
  createDefaultFolderBrowsePreferences,
  isFolderBrowsePreferenceSurface,
  normalizeFolderBrowsePreferences,
  writeFolderBrowseRememberedPath,
} from '../../../shared/folderBrowsePreferences.js';
import {
  DEFAULT_CHAT_SCOPE_ID,
  handleRestError,
  nowFrom,
  requireValidChatScopeId,
  type ChatApiRouteContext,
} from '../routeSupport.js';
import type { ChatState } from '../../api/contracts.js';

const PREFERENCES_MUTATION_GATE_KEY = 'preferences';

function serializePreferences(state: ChatState) {
  return {
    selectedChannelId: state.selectedChannelId,
    conversationBehavior:
      state.conversationBehavior ?? createDefaultConversationBehaviorPreferences(),
    newChatDefaults: state.newChatDefaults,
    advancedDraftControls:
      state.advancedDraftControls ?? createDefaultAdvancedDraftControlsPreferences(),
    folderBrowsePreferences: state.folderBrowsePreferences ?? createDefaultFolderBrowsePreferences(),
  };
}

function applyPreferencePatch(
  state: ChatState,
  body: {
    conversationBehavior?: ConversationBehaviorPatch;
    advancedDraftControls?: AdvancedDraftControlsPatch;
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

  if (body.conversationBehavior && typeof body.conversationBehavior === 'object') {
    nextState = {
      ...nextState,
      conversationBehavior: applyConversationBehaviorPatch(
        nextState.conversationBehavior,
        body.conversationBehavior,
      ),
    };
  }

  if (body.advancedDraftControls && typeof body.advancedDraftControls === 'object') {
    nextState = {
      ...nextState,
      advancedDraftControls: applyAdvancedDraftControlsPatch(
        nextState.advancedDraftControls,
        body.advancedDraftControls,
      ),
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
    if (isFolderBrowsePreferenceSurface(surface)) {
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
      conversationBehavior?: ConversationBehaviorPatch;
      advancedDraftControls?: AdvancedDraftControlsPatch;
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
    const persisted = await context.dependencies.mutationGate.run(
      PREFERENCES_MUTATION_GATE_KEY,
      async () => (
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
      ),
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
