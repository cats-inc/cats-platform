import { useCallback, useEffect, useRef, useState } from 'react';

export interface ChatEventCallbacks {
  onRoomUpdated?: (channelId: string) => void;
  onRecentsChanged?: () => void;
  onUnreadChanged?: () => void;
  onTransportIngress?: (channelId: string) => void;
}

export interface ChatEventState {
  connected: boolean;
}

export function useChatEvents(
  callbacks: ChatEventCallbacks,
  enabled = true,
): ChatEventState {
  const [connected, setConnected] = useState(false);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const connect = useCallback(() => {
    if (!enabled) return undefined;

    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let source: EventSource | null = null;

    function open() {
      source = new EventSource('/api/events/chat');

      source.addEventListener('connected', () => {
        retryCount = 0;
        setConnected(true);
      });

      source.addEventListener('room_updated', (event) => {
        try {
          const data = JSON.parse(event.data) as { channelId?: string };
          if (data.channelId) {
            callbacksRef.current.onRoomUpdated?.(data.channelId);
          }
        } catch { /* ignore parse errors */ }
      });

      source.addEventListener('recents_changed', () => {
        callbacksRef.current.onRecentsChanged?.();
      });

      source.addEventListener('unread_changed', () => {
        callbacksRef.current.onUnreadChanged?.();
      });

      source.addEventListener('transport_ingress', (event) => {
        try {
          const data = JSON.parse(event.data) as { channelId?: string };
          if (data.channelId) {
            callbacksRef.current.onTransportIngress?.(data.channelId);
          }
        } catch { /* ignore parse errors */ }
        callbacksRef.current.onRecentsChanged?.();
      });

      source.onerror = () => {
        setConnected(false);
        source?.close();
        source = null;

        if (retryCount < 8) {
          const delay = Math.min(150 * Math.pow(2, retryCount), 10_000);
          retryCount += 1;
          retryTimer = setTimeout(open, delay);
        }
      };
    }

    open();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
      source = null;
      setConnected(false);
    };
  }, [enabled]);

  useEffect(() => {
    return connect();
  }, [connect]);

  return { connected };
}
