import { matchRoute, sendJson, sendMethodNotAllowed } from '../../../../shared/http.js';
import { buildMemoryFlushSummary } from '../../../../platform/memory/maintenance.js';
import {
  handleRestError,
  sendRestError,
  type ChatApiRouteContext,
} from '../routeSupport.js';
import {
  readOptionalFlushBody,
  validateFlushReason,
} from './shared.js';

async function handleFlushChannelMemory(
  context: ChatApiRouteContext,
  channelId: string,
): Promise<void> {
  try {
    const body = await readOptionalFlushBody(context);
    if (!validateFlushReason(body.reason)) {
      sendRestError(context, 400, 'invalid_flush_reason', 'Invalid memory flush reason.');
      return;
    }
    const flush = await context.dependencies.memoryService.flushChannel({
      channelId,
      reason: body.reason,
      now: context.dependencies.now?.(),
    });
    sendJson(context.response, 200, {
      flush,
      summary: buildMemoryFlushSummary([flush]),
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleGetChannelRetrievalContext(
  context: ChatApiRouteContext,
  channelId: string,
): Promise<void> {
  try {
    const catId = context.url.searchParams.get('catId')?.trim() || null;
    const retrieval = await context.dependencies.memoryService.buildChannelRetrievalContext({
      channelId,
      catId,
      transport: 'web',
      companionStore: context.dependencies.companionStore,
      now: context.dependencies.now?.(),
    });
    sendJson(context.response, 200, { retrieval });
  } catch (error) {
    handleRestError(context, error);
  }
}

export async function routeChannelMemoryApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
  const channelFlushMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/memory\/flush$/u,
  );
  if (channelFlushMatch) {
    if (context.method === 'POST') {
      await handleFlushChannelMemory(context, channelFlushMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['POST']);
    return true;
  }

  const channelRetrievalMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/memory\/retrieval-context$/u,
  );
  if (channelRetrievalMatch) {
    if (context.method === 'GET') {
      await handleGetChannelRetrievalContext(context, channelRetrievalMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET']);
    return true;
  }

  return false;
}
