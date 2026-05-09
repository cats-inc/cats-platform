import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson, sendMethodNotAllowed } from '../../shared/http.js';
import type { CoreStore } from '../../core/store.js';
import type { ChatApiDependencies } from '../../products/chat/api/routeSupport.js';
import type { ChatEvent } from '../../products/chat/api/chatEventHub.js';
import {
  ARTIFACT_ENTITY_SUBSCRIPTION_VERSION,
  buildArtifactSubscriptionPatches,
  buildArtifactSubscriptionState,
  buildArtifactSubscriptionStateFromCore,
  type ArtifactSubscriptionState,
} from '../../platform/orchestration/entitySubscriptions/artifact.js';
import {
  buildChannelSubscriptionPatches,
  buildChannelSubscriptionState,
  CHANNEL_ENTITY_SUBSCRIPTION_VERSION,
  type ChannelSubscriptionState,
} from '../../platform/orchestration/entitySubscriptions/channel.js';
import {
  SUPPORTED_ENTITY_SUBSCRIPTION_KINDS,
  type EntitySubscriptionKind,
  writeEntitySubscriptionHeaders,
  writeEntitySubscriptionSseEvent,
} from '../../platform/orchestration/entitySubscriptions/index.js';

export interface EntitySubscriptionRouteContext {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  method: string;
  dependencies: ChatApiDependencies & {
    coreStore: CoreStore;
  };
  artifactRefreshMs?: number;
}

export const ARTIFACT_ENTITY_SUBSCRIPTION_REFRESH_MS = 500;
const ENTITY_SUBSCRIPTION_KIND_LABEL = SUPPORTED_ENTITY_SUBSCRIPTION_KINDS.join('|');

function normalizeSubscriptionId(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function isSupportedEntitySubscriptionKind(
  value: string | null,
): value is EntitySubscriptionKind {
  return SUPPORTED_ENTITY_SUBSCRIPTION_KINDS.includes(value as EntitySubscriptionKind);
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

function writeSubscriptionHeartbeat(response: ServerResponse): ReturnType<typeof setInterval> {
  return setInterval(() => {
    if (!response.writableEnded) {
      response.write(': ping\n\n');
    }
  }, 15_000);
}

async function routeChannelSubscription(
  context: EntitySubscriptionRouteContext,
  id: string,
): Promise<void> {
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
    return;
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

  const heartbeat = writeSubscriptionHeartbeat(context.response);
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
}

async function routeArtifactSubscription(
  context: EntitySubscriptionRouteContext,
  id: string,
): Promise<void> {
  let latestState: ArtifactSubscriptionState;
  try {
    latestState = await buildArtifactSubscriptionState(context.dependencies.coreStore, id);
  } catch (error) {
    sendJson(context.response, 404, {
      error: {
        code: 'subscription_entity_not_found',
        message: error instanceof Error ? error.message : `Artifact not found: ${id}`,
      },
    });
    return;
  }

  writeEntitySubscriptionHeaders(context.response);
  writeEntitySubscriptionSseEvent(context.response, {
    event: 'snapshot',
    data: {
      kind: 'artifact',
      id,
      version: ARTIFACT_ENTITY_SUBSCRIPTION_VERSION,
      state: latestState,
    },
  });

  const heartbeat = writeSubscriptionHeartbeat(context.response);
  let refreshQueue = Promise.resolve();

  const refresh = (nextStateInput?: ArtifactSubscriptionState | null): void => {
    refreshQueue = refreshQueue
      .then(async () => {
        if (context.response.writableEnded) {
          return;
        }

        const nextState = nextStateInput !== undefined
          ? nextStateInput
          : await buildArtifactSubscriptionState(context.dependencies.coreStore, id)
            .catch(() => null);

        const patches = buildArtifactSubscriptionPatches(latestState, nextState);
        for (const patch of patches) {
          if (context.response.writableEnded) {
            return;
          }
          writeEntitySubscriptionSseEvent(context.response, {
            event: 'patch',
            data: {
              kind: 'artifact',
              id,
              version: ARTIFACT_ENTITY_SUBSCRIPTION_VERSION,
              patch,
            },
          });
        }

        if (!nextState) {
          writeEntitySubscriptionSseEvent(context.response, {
            event: 'close',
            data: {
              reason: `Artifact not found: ${id}`,
            },
          });
          context.response.end();
          return;
        }

        latestState = nextState;
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

  const unsubscribeCore = context.dependencies.coreStore.subscribeCore?.((core) => {
    let nextState: ArtifactSubscriptionState | null;
    try {
      nextState = buildArtifactSubscriptionStateFromCore(core, id);
    } catch {
      nextState = null;
    }
    refresh(nextState);
  });
  const refreshInterval = unsubscribeCore
    ? null
    : setInterval(
      refresh,
      context.artifactRefreshMs ?? ARTIFACT_ENTITY_SUBSCRIPTION_REFRESH_MS,
    );
  refresh();

  context.response.on('close', () => {
    clearInterval(heartbeat);
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
    unsubscribeCore?.();
  });
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
  if (!isSupportedEntitySubscriptionKind(kind) || !id) {
    sendJson(context.response, 400, {
      error: {
        code: 'invalid_subscription',
        message: `Expected /api/subscribe?kind=<${ENTITY_SUBSCRIPTION_KIND_LABEL}>&id=<entity-id>.`,
      },
    });
    return true;
  }

  if (kind === 'channel') {
    await routeChannelSubscription(context, id);
    return true;
  }

  await routeArtifactSubscription(context, id);
  return true;
}
