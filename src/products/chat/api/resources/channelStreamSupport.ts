import { collectParticipantSessionIds, resolveParticipantSessionId } from '../../shared/channelParticipants.js';
import { isDirectLaneChannel } from '../../shared/channelTopology.js';
import { requireChannel } from '../../state/model/index.js';
import type { ChatApiRouteContext } from '../routeSupport.js';

const CHANNEL_STREAM_SESSION_WAIT_MS = 1500;
const CHANNEL_STREAM_SESSION_POLL_MS = 75;

export function resolveChannelStreamSessionId(
  channel: ReturnType<typeof requireChannel>,
): string | null {
  const defaultRecipientId = channel.roomRouting?.defaultRecipientId ?? null;
  if (isDirectLaneChannel(channel)) {
    if (!defaultRecipientId) {
      return null;
    }
    const leadSessionId = resolveParticipantSessionId(channel, defaultRecipientId, {
      statuses: ['ready', 'initializing'],
    });
    if (leadSessionId) {
      return leadSessionId;
    }
    return null;
  }

  if (defaultRecipientId) {
    const leadSessionId = resolveParticipantSessionId(channel, defaultRecipientId, {
      statuses: ['ready', 'initializing'],
    });
    if (leadSessionId) {
      return leadSessionId;
    }
  }

  const participantSessionId = collectParticipantSessionIds(channel, {
    statuses: ['ready', 'initializing'],
  })[0] ?? null;
  if (participantSessionId) {
    return participantSessionId;
  }

  return channel.orchestratorLease?.sessionId?.trim() || null;
}

function waitForStreamLease(
  durationMs: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, durationMs);

    function onAbort(): void {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve();
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function waitForChannelStreamSessionId(
  context: ChatApiRouteContext,
  channelId: string,
  signal: AbortSignal,
): Promise<string | null> {
  const deadline = Date.now() + CHANNEL_STREAM_SESSION_WAIT_MS;

  while (!signal.aborted) {
    const state = await context.dependencies.chatStore.read();
    const channel = requireChannel(state, channelId);
    const sessionId = resolveChannelStreamSessionId(channel);
    if (sessionId) {
      return sessionId;
    }
    if (Date.now() >= deadline) {
      return null;
    }
    await waitForStreamLease(CHANNEL_STREAM_SESSION_POLL_MS, signal);
  }

  return null;
}

export function writeSseEvent(
  context: ChatApiRouteContext,
  event: string,
  data: Record<string, unknown>,
): void {
  const payload = typeof data.type === 'string'
    ? data
    : { ...data, type: event };
  context.response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}
