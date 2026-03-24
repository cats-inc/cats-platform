import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import type { UpdateSelectedChannelInput } from './contracts.js';
import {
  buildAppShellPayload,
  errorStatusCode,
  type ChatApiRouteContext,
  nowFrom,
} from './shared.js';
import { selectChannel } from '../state/model/index.js';

async function handleAppShell(
  context: ChatApiRouteContext,
): Promise<void> {
  const state = await context.dependencies.chatStore.read();
  sendJson(
    context.response,
    200,
    await buildAppShellPayload(context.dependencies, state),
  );
}

async function handleSelectionUpdate(
  context: ChatApiRouteContext,
): Promise<void> {
  try {
    const body = await readJsonBody<UpdateSelectedChannelInput>(context.request);
    const nextState = selectChannel(
      await context.dependencies.chatStore.read(),
      body.selectedChannelId,
      nowFrom(context.dependencies),
    );
    const persisted = await context.dependencies.chatStore.write(nextState);
    sendJson(
      context.response,
      200,
      await buildAppShellPayload(context.dependencies, persisted),
    );
  } catch (error) {
    sendJson(context.response, errorStatusCode(error), {
      error:
        error instanceof Error
          ? error.message
          : 'Failed to update chat selection',
    });
  }
}

export async function routeChatShellApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/app-shell') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleAppShell(context);
    return true;
  }

  if (context.url.pathname === '/api/views/app-shell') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleAppShell(context);
    return true;
  }

  return false;
}
