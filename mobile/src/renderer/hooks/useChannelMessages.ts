import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  buildAttachmentResolver,
  createMobileApiClient,
  type MobileApiClient,
  MobileApiError,
} from '../../api/client';
import { loadConnectionConfig } from '../../api/persistence';
import type { ResolveAttachmentUrl } from '../MessageBody';
import {
  type MobileAppShellPayload,
  type MobileChannelMessagesPayload,
  type MobileRenderedMessage,
  selectMobileMessages,
} from '../../../../src/mobile/index.js';

/**
 * State machine for the live channel-messages fetch (PLAN-084 Phase 4b).
 *
 *   - `loading` — initial mount, or a refetch is in flight
 *   - `unconfigured` — no `baseUrl` in persisted ConnectionConfig
 *   - `channelNotFound` — the channel id is not present in the
 *     desktop's app-shell payload (e.g. user followed a stale deep
 *     link, or used a placeholder id like `new-chat`)
 *   - `error` — fetch failed (`MobileApiError` with status + body)
 *   - `data` — last successful fetch's title + projected messages,
 *     plus a `resolveAttachmentUrl` bound to the same base URL so
 *     bubble attachments resolve back to the desktop instead of to
 *     the device itself.
 */
export type ChannelMessagesState =
  | { kind: 'loading' }
  | { kind: 'unconfigured' }
  | { kind: 'channelNotFound' }
  | { kind: 'error'; error: MobileApiError }
  | {
      kind: 'data';
      channelTitle: string;
      messages: MobileRenderedMessage[];
      resolveAttachmentUrl: ResolveAttachmentUrl;
    };

/** Composer-side state for the send mutation (PLAN-084 Phase 4c). */
export type ChannelSendState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'error'; error: MobileApiError };

export interface ChannelMessagesHook {
  state: ChannelMessagesState;
  /** Re-runs the load. Used by pull-to-refresh and after sends. */
  refetch: () => void;
  /** Sends a new message body to the channel. Resolves once the
   *  desktop has acknowledged the user message and the messages list
   *  has been refetched. The assistant's reply may still be in flight
   *  when this resolves; the next refetch (manual or pull-to-refresh)
   *  picks it up. Phase 4c will swap this for SSE / WebSocket
   *  streaming so the reply lands without a refetch. */
  send: (body: string) => Promise<void>;
  sendState: ChannelSendState;
}

const APP_SHELL_PATH = '/api/app-shell';

function messagesPath(channelId: string): string {
  return `/api/channels/${encodeURIComponent(channelId)}/messages`;
}

interface ShellAndMessages {
  shell: MobileAppShellPayload;
  messagesPayload: MobileChannelMessagesPayload;
}

async function loadShellAndMessages(
  client: MobileApiClient,
  channelId: string,
): Promise<ShellAndMessages> {
  const [shell, messagesPayload] = await Promise.all([
    client.get<MobileAppShellPayload>(APP_SHELL_PATH),
    client.get<MobileChannelMessagesPayload>(messagesPath(channelId)),
  ]);
  return { shell, messagesPayload };
}

function buildDataState(
  client: MobileApiClient,
  shell: MobileAppShellPayload,
  messagesPayload: MobileChannelMessagesPayload,
  channelId: string,
): ChannelMessagesState {
  const channel = shell.chat.channels.find(
    (candidate) => candidate.id === channelId,
  );
  if (!channel) {
    return { kind: 'channelNotFound' };
  }
  return {
    kind: 'data',
    channelTitle: channel.title,
    messages: selectMobileMessages(messagesPayload.messages, shell.chat.cats),
    resolveAttachmentUrl: buildAttachmentResolver(client),
  };
}

function classifyFetchError(error: unknown): ChannelMessagesState {
  if (error instanceof MobileApiError) {
    if (error.status === 404) {
      return { kind: 'channelNotFound' };
    }
    return { kind: 'error', error };
  }
  return {
    kind: 'error',
    error: new MobileApiError(
      error instanceof Error ? error.message : 'Unknown error.',
      null,
      error,
    ),
  };
}

export function useChannelMessages(channelId: string): ChannelMessagesHook {
  const [state, setState] = useState<ChannelMessagesState>({ kind: 'loading' });
  const [sendState, setSendState] = useState<ChannelSendState>({ kind: 'idle' });
  const [version, setVersion] = useState(0);
  const activeRef = useRef(true);
  const initialFocusRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    setState({ kind: 'loading' });
    (async () => {
      try {
        const config = await loadConnectionConfig();
        if (!activeRef.current) {
          return;
        }
        if (!config.baseUrl) {
          setState({ kind: 'unconfigured' });
          return;
        }
        const client = createMobileApiClient(config);
        const { shell, messagesPayload } = await loadShellAndMessages(
          client,
          channelId,
        );
        if (!activeRef.current) {
          return;
        }
        setState(buildDataState(client, shell, messagesPayload, channelId));
      } catch (error) {
        if (!activeRef.current) {
          return;
        }
        setState(classifyFetchError(error));
      }
    })();
    return () => {
      activeRef.current = false;
    };
  }, [channelId, version]);

  // Refetch on each screen focus after the first mount, so returning
  // from Settings or another tab picks up new messages without a
  // manual pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      if (initialFocusRef.current) {
        initialFocusRef.current = false;
        return;
      }
      setVersion((current) => current + 1);
    }, []),
  );

  const refetch = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);

  const send = useCallback(
    async (body: string): Promise<void> => {
      const trimmed = body.trim();
      if (trimmed.length === 0) {
        return;
      }
      setSendState({ kind: 'sending' });
      try {
        const config = await loadConnectionConfig();
        if (!config.baseUrl) {
          setSendState({
            kind: 'error',
            error: new MobileApiError(
              'Set a desktop base URL in Settings before sending.',
              null,
              null,
            ),
          });
          return;
        }
        const client = createMobileApiClient(config);
        await client.post(messagesPath(channelId), { body: trimmed });
        setSendState({ kind: 'idle' });
        // Refetch to pick up both the persisted user message and the
        // first assistant reply (when fast). The user can pull-to-
        // refresh again to catch later replies until streaming lands.
        setVersion((current) => current + 1);
      } catch (error) {
        if (error instanceof MobileApiError) {
          setSendState({ kind: 'error', error });
        } else {
          setSendState({
            kind: 'error',
            error: new MobileApiError(
              error instanceof Error ? error.message : 'Send failed.',
              null,
              error,
            ),
          });
        }
      }
    },
    [channelId],
  );

  return { state, refetch, send, sendState };
}
