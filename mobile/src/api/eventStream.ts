import EventSource from 'react-native-sse';

import type { ConnectionConfig } from './persistence';
import type {
  MobileChatEvent,
  MobileChatEventKind,
} from '../../../src/mobile/index.js';

/**
 * SSE client wrapper for `/api/events/chat`. PLAN-084 Phase 4c —
 * replaces the 5s polling fallback with a real subscription so
 * assistant replies (and sidebar mutations) arrive as soon as the
 * desktop emits them.
 *
 * `react-native-sse` is the EventSource polyfill; RN's runtime does
 * not ship a native EventSource. The wrapper here just narrows the
 * polyfill API down to what `useChannelMessages` and friends
 * actually need: open the stream, get `MobileChatEvent`s back,
 * close it on cleanup.
 */

export type ChatEventListener = (event: MobileChatEvent) => void;

export interface ChatEventStreamHandle {
  close(): void;
}

export interface ChatEventStreamOptions {
  bearerToken?: string | null;
}

const SUBSCRIBED_KINDS: MobileChatEventKind[] = [
  'room_updated',
  'recents_changed',
  'unread_changed',
  'transport_ingress',
  'transport_outbound',
  'session_state_changed',
];

const EVENTS_PATH = '/api/events/chat';

/**
 * Opens an SSE connection to `${config.baseUrl}/api/events/chat` and
 * invokes `listener` with each parsed `MobileChatEvent`. Returns a
 * handle whose `close()` shuts the stream and removes all listeners.
 *
 * Returns `null` when no `baseUrl` is configured. Caller is expected
 * to fall back to focus-only refetch in that case (the live data
 * path is already gated on `baseUrl` upstream).
 */
export function openChatEventStream(
  config: ConnectionConfig,
  listener: ChatEventListener,
  options: ChatEventStreamOptions = {},
): ChatEventStreamHandle | null {
  if (!config.baseUrl) {
    return null;
  }
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, '');
  const url = `${baseUrl}${EVENTS_PATH}`;

  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
  };
  const bearerToken = options.bearerToken?.trim();
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  const source = new EventSource<MobileChatEventKind>(url, {
    headers,
    pollingInterval: 0, // do not auto-reconnect on close; caller decides
  });

  const handle = (event: { data: string | null; type: string }) => {
    if (!event.data) {
      return;
    }
    try {
      const parsed = JSON.parse(event.data) as MobileChatEvent;
      listener(parsed);
    } catch {
      // Malformed frame — drop it. SSE delivers JSON we control on
      // the server side, but defensively avoid throwing into the
      // event-loop callback.
    }
  };

  for (const kind of SUBSCRIBED_KINDS) {
    source.addEventListener(kind, handle);
  }

  return {
    close() {
      source.removeAllEventListeners();
      source.close();
    },
  };
}
