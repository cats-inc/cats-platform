import { useEffect, useState } from 'react';

import {
  buildAttachmentResolver,
  createMobileApiClient,
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

export interface ChannelMessagesHook {
  state: ChannelMessagesState;
  refetch: () => void;
}

const APP_SHELL_PATH = '/api/app-shell';

function messagesPath(channelId: string): string {
  return `/api/channels/${encodeURIComponent(channelId)}/messages`;
}

export function useChannelMessages(channelId: string): ChannelMessagesHook {
  const [state, setState] = useState<ChannelMessagesState>({ kind: 'loading' });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ kind: 'loading' });
    (async () => {
      try {
        const config = await loadConnectionConfig();
        if (!active) {
          return;
        }
        if (!config.baseUrl) {
          setState({ kind: 'unconfigured' });
          return;
        }
        const client = createMobileApiClient(config);
        const [shell, messagesPayload] = await Promise.all([
          client.get<MobileAppShellPayload>(APP_SHELL_PATH),
          client.get<MobileChannelMessagesPayload>(messagesPath(channelId)),
        ]);
        if (!active) {
          return;
        }
        const channel = shell.chat.channels.find(
          (candidate) => candidate.id === channelId,
        );
        if (!channel) {
          setState({ kind: 'channelNotFound' });
          return;
        }
        const messages = selectMobileMessages(
          messagesPayload.messages,
          shell.chat.cats,
        );
        const resolveAttachmentUrl = buildAttachmentResolver(client);
        setState({
          kind: 'data',
          channelTitle: channel.title,
          messages,
          resolveAttachmentUrl,
        });
      } catch (error) {
        if (!active) {
          return;
        }
        if (error instanceof MobileApiError) {
          // 404 on the messages endpoint is the "this channel id was
          // never created" case (e.g. a +New chat placeholder route).
          if (error.status === 404) {
            setState({ kind: 'channelNotFound' });
            return;
          }
          setState({ kind: 'error', error });
        } else {
          setState({
            kind: 'error',
            error: new MobileApiError(
              error instanceof Error ? error.message : 'Unknown error.',
              null,
              error,
            ),
          });
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [channelId, version]);

  const refetch = () => {
    setVersion((current) => current + 1);
  };

  return { state, refetch };
}
