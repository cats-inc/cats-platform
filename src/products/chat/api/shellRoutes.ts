import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import type { UpdateSelectedChannelInput } from './contracts.js';
import {
  buildAppShellPayload,
  errorStatusCode,
  type ChatApiRouteContext,
  nowFrom,
} from './shared.js';
import { selectChannel } from '../state/model.js';
import { wakeChannelEntryParticipant } from '../state/runtimeActions.js';

function requestedChatRouteChannelId(
  context: ChatApiRouteContext,
): string | null {
  const rawPath = context.request.headers['x-cats-route-path'];
  if (typeof rawPath !== 'string') {
    return null;
  }

  const match = rawPath.match(/^\/chats\/([^/?#]+)$/u);
  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[1] ?? '').trim() || null;
  } catch {
    return null;
  }
}

async function handleAppShell(
  context: ChatApiRouteContext,
): Promise<void> {
  let state = await context.dependencies.chatStore.read();
  const routeChannelId = requestedChatRouteChannelId(context);
  if (routeChannelId && routeChannelId === state.selectedChannelId) {
    const stateBeforeWake = state;
    const wake = await wakeChannelEntryParticipant(
      state,
      routeChannelId,
      context.dependencies.runtimeClient,
      nowFrom(context.dependencies),
    );
    state = wake.state;
    if (
      wake.state !== stateBeforeWake
      || wake.result?.status === 'started'
      || wake.result?.status === 'error'
    ) {
      state = await context.dependencies.chatStore.write(state);
    }
  }

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
