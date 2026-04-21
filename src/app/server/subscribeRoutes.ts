import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson, sendMethodNotAllowed } from '../../shared/http.js';
import type { ChatApiDependencies } from '../../products/chat/api/routeSupport.js';
import type { ChatEvent } from '../../products/chat/api/chatEventHub.js';
import {
  buildChannelSubscriptionPatches,
  buildChannelSubscriptionState,
  CHANNEL_ENTITY_SUBSCRIPTION_VERSION,
  type ChannelSubscriptionState,
} from '../../platform/orchestration/entitySubscriptions/channel.js';
import {
  writeEntitySubscriptionHeaders,
  writeEntitySubscriptionSseEvent,
} from '../../platform/orchestration/entitySubscriptions/index.js';

export interface EntitySubscriptionRouteContext {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  method: string;
  dependencies: ChatApiDependencies;
}

function normalizeSubscriptionId(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function shouldRefreshChannelSubscription(
  event: ChatEvent,
  channelId: string,
): boolean {
  if (event.channelId === channelId) {
    return true;
  }

  return event.kind === 'recents_changed' && !event.channelId;
}

export async function routeEntitySubscriptionApi(
  context: EntitySubscriptionRouteContext,
): Promise<boolean> {
  if (context.url.pathname !== '/api/subscribe') {
    return false;
  }

  if (context.method !== 'GET') {
    sendMethodNotAllowed(context.response, ['GET']);
    return true;
  }

  const kind = normalizeSubscriptionId(context.url.searchParams.get('kind'));
  const id = normalizeSubscriptionId(context.url.searchParams.get('id'));
  if (kind !== 'channel' || !id) {
    sendJson(context.response, 400, {
      error: {
        code: 'invalid_subscription',
        message: 'Expected /api/subscribe?kind=channel&id=<channel-id>.',
      },
    });
    return true;
  }

  let latestState: ChannelSubscriptionState;
  try {
    latestState = await buildChannelSubscriptionState(context.dependencies, id);
  } catch (error) {
    sendJson(context.response, 404, {
      error: {
        code: 'subscription_entity_not_found',
        message: error instanceof Error ? error.message : `Channel not found: ${id}`,
      },
    });
    return true;
  }

  writeEntitySubscriptionHeaders(context.response);
  writeEntitySubscriptionSseEvent(context.response, {
    event: 'snapshot',
    data: {
      kind: 'channel',
      id,
      version: CHANNEL_ENTITY_SUBSCRIPTION_VERSION,
      state: latestState,
    },
  });

  const heartbeat = setInterval(() => {
    if (!context.response.writableEnded) {
      context.response.write(': ping\n\n');
    }
  }, 15_000);
  let refreshQueue = Promise.resolve();

  const refresh = (): void => {
    refreshQueue = refreshQueue
      .then(async () => {
        if (context.response.writableEnded) {
          return;
        }
        const nextState = await buildChannelSubscriptionState(context.dependencies, id);
        const patches = buildChannelSubscriptionPatches(latestState, nextState);
        latestState = nextState;
        for (const patch of patches) {
          if (context.response.writableEnded) {
            return;
          }
          writeEntitySubscriptionSseEvent(context.response, {
            event: 'patch',
            data: {
              kind: 'channel',
              id,
              version: CHANNEL_ENTITY_SUBSCRIPTION_VERSION,
              patch,
            },
          });
        }
      })
      .catch((error: unknown) => {
        if (context.response.writableEnded) {
          return;
        }
        writeEntitySubscriptionSseEvent(context.response, {
          event: 'close',
          data: {
            reason: error instanceof Error ? error.message : 'Subscription refresh failed',
          },
        });
        context.response.end();
      });
  };

  const unsubscribe = context.dependencies.eventHub?.subscribe((event) => {
    if (shouldRefreshChannelSubscription(event, id)) {
      refresh();
    }
  });
  refresh();

  context.response.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe?.();
  });

  return true;
}
