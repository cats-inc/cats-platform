import { bestEffortFlushRuntimeSessionMemory } from '../../../platform/memory/runtimeMaintenance.js';
import { RuntimeRequestError } from '../../../platform/runtime/client.js';
import { collectChannelSessionIds } from '../shared/channelParticipants.js';
import {
  channelDispatchCancellationRegistry,
} from '../state/runtime-dispatch/cancellation.js';
import { requireChannel } from '../state/model/index.js';
import { ChatApiError } from './routeErrors.js';
import type { ChatState } from './contracts.js';
import type { ChatApiRouteContext } from './routeSupport.js';

function normalizeSessionIds(
  sessionIds: Array<string | null | undefined>,
): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const candidate of sessionIds) {
    const sessionId = candidate?.trim();
    if (!sessionId || seen.has(sessionId)) {
      continue;
    }
    seen.add(sessionId);
    normalized.push(sessionId);
  }

  return normalized;
}

export async function closeSessionIds(
  context: ChatApiRouteContext,
  sessionIds: Array<string | null | undefined>,
): Promise<void> {
  const validSessionIds = normalizeSessionIds(sessionIds);

  await Promise.allSettled(
    validSessionIds.map(async (sessionId) => {
      await bestEffortFlushRuntimeSessionMemory({
        runtimeClient: context.dependencies.runtimeClient,
        sessionId,
        requestedPhase: 'pre_reset',
        memoryService: context.dependencies.memoryService,
        companionStore: context.dependencies.companionStore,
        coreStore: context.dependencies.chatStore,
        now: context.dependencies.now?.(),
      });
      await context.dependencies.runtimeClient.closeSession(sessionId);
    }),
  );
}

export async function cancelSessionIds(
  context: ChatApiRouteContext,
  sessionIds: Array<string | null | undefined>,
): Promise<number> {
  const validSessionIds = normalizeSessionIds(sessionIds);

  await Promise.allSettled(
    validSessionIds.map(async (sessionId) => {
      await context.dependencies.runtimeClient.cancelSession(sessionId);
    }),
  );

  return validSessionIds.length;
}

interface ProductDeleteRuntimeFailureDetail {
  sessionId: string;
  status: 'error';
  message: string;
  runtimeStatusCode?: number;
}

export async function cleanupSessionsForProductDelete(
  context: ChatApiRouteContext,
  sessionIds: Array<string | null | undefined>,
): Promise<void> {
  const validSessionIds = normalizeSessionIds(sessionIds);
  if (validSessionIds.length === 0) {
    return;
  }

  if (context.dependencies.config.debugKeepRuntimeSessionsOnProductDelete) {
    await closeSessionIds(context, validSessionIds);
    return;
  }

  const failures: ProductDeleteRuntimeFailureDetail[] = [];

  for (const sessionId of validSessionIds) {
    try {
      await bestEffortFlushRuntimeSessionMemory({
        runtimeClient: context.dependencies.runtimeClient,
        sessionId,
        requestedPhase: 'pre_reset',
        memoryService: context.dependencies.memoryService,
        companionStore: context.dependencies.companionStore,
        coreStore: context.dependencies.chatStore,
        now: context.dependencies.now?.(),
      });
    } catch {
      // Best-effort pre-delete maintenance should not block the actual delete.
    }

    try {
      const result = await context.dependencies.runtimeClient.deleteSession(sessionId);
      if (result.status === 'retained') {
        continue;
      }
    } catch (error) {
      if (error instanceof RuntimeRequestError && error.status === 404) {
        continue;
      }

      failures.push({
        sessionId,
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to delete linked runtime session.',
        ...(error instanceof RuntimeRequestError ? { runtimeStatusCode: error.status } : {}),
      });
    }
  }

  if (failures.length === 0) {
    return;
  }

  throw new ChatApiError(
    502,
    'runtime_session_delete_failed',
    'Failed to delete linked runtime sessions, so the product delete was cancelled.',
    {
      failures,
      failMode: 'fail_and_keep',
      debugOverrideEnv: 'CATS_DEBUG_KEEP_RUNTIME_SESSIONS_ON_PRODUCT_DELETE',
    },
  );
}

const CHANNEL_CANCELLATION_SETTLE_TIMEOUT_MS = 5_000;
const CHANNEL_CANCELLATION_SETTLE_POLL_MS = 100;

function waitForChannelCancellationPoll(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, CHANNEL_CANCELLATION_SETTLE_POLL_MS);
  });
}

export function collectActiveChannelSessionIds(
  channel: ReturnType<typeof requireChannel>,
): string[] {
  return collectChannelSessionIds(channel, {
    statuses: ['ready', 'initializing'],
  });
}

export function hasActiveChannelTurn(channel: ReturnType<typeof requireChannel>): boolean {
  return Boolean(channel.roomRouting?.workflow.activeTurn);
}

export async function waitForCancelledChannelTurns(
  context: ChatApiRouteContext,
  channelIds: string[],
): Promise<ChatState> {
  const deadline = Date.now() + CHANNEL_CANCELLATION_SETTLE_TIMEOUT_MS;
  let latestState = await context.dependencies.chatStore.read();

  while (Date.now() < deadline) {
    latestState = await context.dependencies.chatStore.read();
    const pendingRequest = channelIds.some((channelId) =>
      channelDispatchCancellationRegistry.read(channelId) != null,
    );
    const activeTurn = channelIds.some((channelId) =>
      hasActiveChannelTurn(requireChannel(latestState, channelId)),
    );
    if (!pendingRequest && !activeTurn) {
      return latestState;
    }
    await waitForChannelCancellationPoll();
  }

  return latestState;
}
