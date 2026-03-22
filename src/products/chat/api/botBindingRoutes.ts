import { matchRoute, readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import { createBotBinding, removeBotBinding } from '../../../core/model.js';
import {
  buildAppShellPayload,
  handleRestError,
  nowFrom,
  sendRestError,
  type ChatApiRouteContext,
} from './shared.js';

interface CreateBotBindingInput {
  platform?: 'telegram' | 'line';
  botName: string;
  boundCatId: string;
  botToken?: string | null;
  webhookSecret?: string | null;
}

async function handleListBotBindings(
  context: ChatApiRouteContext,
): Promise<void> {
  try {
    const core = await context.dependencies.chatStore.readCore();
    sendJson(context.response, 200, { bindings: core.botBindings });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleCreateBotBinding(
  context: ChatApiRouteContext,
): Promise<void> {
  try {
    const body = await readJsonBody<CreateBotBindingInput>(context.request);
    if (!body.botName?.trim()) {
      sendRestError(context, 400, 'validation_error', 'botName is required');
      return;
    }
    if (!body.boundCatId?.trim()) {
      sendRestError(context, 400, 'validation_error', 'boundCatId is required');
      return;
    }

    const now = nowFrom(context.dependencies);
    let core = await context.dependencies.chatStore.readCore();
    const result = createBotBinding(
      core,
      {
        platform: body.platform ?? 'telegram',
        botName: body.botName,
        boundCatId: body.boundCatId,
        botToken: body.botToken,
        webhookSecret: body.webhookSecret,
      },
      now,
    );
    core = result.core;
    await context.dependencies.chatStore.writeCore(core);
    sendJson(
      context.response,
      201,
      await buildAppShellPayload(context.dependencies),
    );
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleDeleteBotBinding(
  context: ChatApiRouteContext,
  bindingId: string,
): Promise<void> {
  try {
    const now = nowFrom(context.dependencies);
    let core = await context.dependencies.chatStore.readCore();
    core = removeBotBinding(core, bindingId, now);
    await context.dependencies.chatStore.writeCore(core);
    sendJson(
      context.response,
      200,
      await buildAppShellPayload(context.dependencies),
    );
  } catch (error) {
    handleRestError(context, error);
  }
}

export async function routeBotBindingApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/bot-bindings') {
    if (context.method === 'GET') {
      await handleListBotBindings(context);
      return true;
    }
    if (context.method === 'POST') {
      await handleCreateBotBinding(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  const deleteMatch = matchRoute(
    context.url.pathname,
    /^\/api\/bot-bindings\/([^/]+)$/u,
  );
  if (deleteMatch) {
    if (context.method === 'DELETE') {
      await handleDeleteBotBinding(context, deleteMatch[0]);
      return true;
    }
    sendMethodNotAllowed(context.response, ['DELETE']);
    return true;
  }

  return false;
}
