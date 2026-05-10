import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  buildAttachmentResolver,
  type MobileApiClient,
  MobileApiError,
} from '../../api/client';
import { loadMobileAuthenticatedSession } from '../../api/authSession';
import {
  type ChatEventStreamHandle,
  openChatEventStream,
} from '../../api/eventStream';
import { loadConnectionConfig } from '../../api/persistence';
import type { ResolveAttachmentUrl } from '../MessageBody';
import {
  getMobileApiCopy,
  resolveDefaultMobileLocale,
  type MobileApiCopy,
  type MobileAppShellPayload,
  type MobileChannelMessagesPayload,
  type MobileRenderedMessage,
  type MobileRoomUpdatedDetail,
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
  | { kind: 'unauthenticated' }
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

function classifyFetchError(error: unknown, copy: MobileApiCopy): ChannelMessagesState {
  if (error instanceof MobileApiError) {
    if (error.status === 404) {
      return { kind: 'channelNotFound' };
    }
    return { kind: 'error', error };
  }
  return {
    kind: 'error',
    error: new MobileApiError(
      error instanceof Error ? error.message : copy.unknownError,
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
  const copy = getMobileApiCopy(resolveDefaultMobileLocale());

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
        const session = await loadMobileAuthenticatedSession(config);
        if (!activeRef.current) {
          return;
        }
        if (session.kind === 'unconfigured') {
          setState({ kind: 'unconfigured' });
          return;
        }
        if (session.kind === 'unauthenticated') {
          setState({ kind: 'unauthenticated' });
          return;
        }
        const { shell, messagesPayload } = await loadShellAndMessages(
          session.client,
          channelId,
        );
        if (!activeRef.current) {
          return;
        }
        setState(buildDataState(session.client, shell, messagesPayload, channelId));
      } catch (error) {
        if (!activeRef.current) {
          return;
        }
        setState(classifyFetchError(error, copy));
      }
    })();
    return () => {
      activeRef.current = false;
    };
  }, [channelId, copy, version]);

  // While ChatView is the focused screen, open an SSE subscription
  // to `/api/events/chat` and refetch the conversation when the
  // server emits a `room_updated` event for this channel — the
  // mutation kinds covered are `message_added` (assistant reply
  // arrived), `updated` (composer / cat assignments / etc.), and
  // `created` (rare on a focused channel, but harmless to refetch).
  //
  // The stream opens on focus and closes on blur / unmount via the
  // `useFocusEffect` cleanup, so background tabs do not hold a
  // connection open to the desktop.
  //
  // We also bump version once on focus so coming back from another
  // tab catches anything we missed while the stream was closed.
  useFocusEffect(
    useCallback(() => {
      if (initialFocusRef.current) {
        initialFocusRef.current = false;
      } else {
        setVersion((current) => current + 1);
      }

      let active = true;
      let handle: ChatEventStreamHandle | null = null;

      (async () => {
        try {
          const config = await loadConnectionConfig();
          if (!active || !config.baseUrl) {
            return;
          }
          const session = await loadMobileAuthenticatedSession(config);
          if (!active || session.kind !== 'authenticated') {
            return;
          }
          handle = openChatEventStream(
            config,
            (event) => {
              if (event.type !== 'room_updated') {
                return;
              }
              if (event.channelId !== channelId) {
                return;
              }
              const detail = event.detail as MobileRoomUpdatedDetail | null;
              if (
                detail !== null &&
                detail !== undefined &&
                typeof detail === 'object' &&
                'mutation' in detail &&
                (detail.mutation === 'message_added' ||
                  detail.mutation === 'updated' ||
                  detail.mutation === 'created')
              ) {
                setVersion((current) => current + 1);
              }
            },
            { bearerToken: session.bearerToken },
          );
        } catch {
          // SSE open failures degrade gracefully — focus refetch + the
          // post-send refetch + pull-to-refresh still keep the
          // conversation up to date.
        }
      })();

      return () => {
        active = false;
        handle?.close();
        handle = null;
      };
    }, [channelId]),
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
              copy.configureBaseUrlBeforeSending,
              null,
              null,
            ),
          });
          return;
        }
        const session = await loadMobileAuthenticatedSession(config);
        if (session.kind !== 'authenticated') {
          setSendState({
            kind: 'error',
            error: new MobileApiError(copy.authenticationRequired, 401, null),
          });
          return;
        }
        await session.client.post(messagesPath(channelId), { body: trimmed });
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
              error instanceof Error ? error.message : copy.sendFailed,
              null,
              error,
            ),
          });
        }
      }
    },
    [channelId, copy],
  );

  return { state, refetch, send, sendState };
}
