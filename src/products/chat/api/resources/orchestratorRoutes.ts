import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../../../shared/http.js';
import {
  updateGlobalOrchestrator,
} from '../../state/model/index.js';
import type {
  UpdateGlobalOrchestratorInput,
} from '../contracts.js';
import {
  DEFAULT_CHAT_SCOPE_ID,
  handleRestError,
  nowFrom,
  requireValidChatScopeId,
  type ChatApiRouteContext,
} from '../shared.js';

const ORCHESTRATOR_ALLOWED_METHODS = ['GET', 'PATCH', 'PUT'];

async function handleRestGetOrchestrator(
  context: ChatApiRouteContext,
  chatScopeId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    const [state, runtime] = await Promise.all([
      context.dependencies.chatStore.read(),
      context.dependencies.runtimeClient.getHealth(),
    ]);
    sendJson(context.response, 200, {
      orchestrator: {
        ...state.globalOrchestrator,
        status: runtime.reachable ? 'ready' : 'warming',
      },
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestUpdateOrchestrator(
  context: ChatApiRouteContext,
  chatScopeId: string,
): Promise<void> {
  try {
    requireValidChatScopeId(chatScopeId);
    const body = await readJsonBody<UpdateGlobalOrchestratorInput>(
      context.request,
    );
    const nextState = updateGlobalOrchestrator(
      await context.dependencies.chatStore.read(),
      body,
      nowFrom(context.dependencies),
    );
    const [persisted, runtime] = await Promise.all([
      context.dependencies.chatStore.write(nextState),
      context.dependencies.runtimeClient.getHealth(),
    ]);
    sendJson(context.response, 200, {
      orchestrator: {
        ...persisted.globalOrchestrator,
        status: runtime.reachable ? 'ready' : 'warming',
      },
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

export async function routeChatOrchestratorResourceApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname !== '/api/orchestrator') {
    return false;
  }

  if (context.method === 'GET') {
    await handleRestGetOrchestrator(context, DEFAULT_CHAT_SCOPE_ID);
    return true;
  }
  if (context.method === 'PATCH') {
    await handleRestUpdateOrchestrator(context, DEFAULT_CHAT_SCOPE_ID);
    return true;
  }
  sendMethodNotAllowed(context.response, ORCHESTRATOR_ALLOWED_METHODS);
  return true;
}
