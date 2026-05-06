import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  buildAttachmentResolver,
  createMobileApiClient,
  MobileApiError,
} from '../../api/client';
import { resolveMobileDraftApiEntryKind } from '../../api/fixtures/productSidebar';
import { loadConnectionConfig } from '../../api/persistence';
import {
  getMobileApiCopy,
  getMobileChannelTitle,
  getMobileTabsCopy,
  resolveDefaultMobileLocale,
  type MobileCreateChannelResponse,
  type MobileProductMode,
} from '../../../../src/mobile/index.js';
import type { ResolveAttachmentUrl } from '../MessageBody';
import {
  type ChannelMessagesHook,
  type ChannelMessagesState,
  type ChannelSendState,
} from './useChannelMessages';

const CREATE_CHANNEL_PATH = '/api/channels';

function messagesPath(channelId: string): string {
  return `/api/channels/${encodeURIComponent(channelId)}/messages`;
}

const NOOP_RESOLVE_ATTACHMENT_URL: ResolveAttachmentUrl = () => null;

/**
 * Mirror of the web `<NewChatDraft>` lifecycle on mobile.
 *
 * On web, tapping `+ New Chat` does NOT call `POST /api/channels` — it
 * navigates to a draft route (`/chat/new`) that renders pure UI state.
 * The channel is only created on first message send (see
 * `prepareComposerChannelDispatch` in
 * `src/products/shared/renderer/composerDispatch.ts`).
 *
 * Mobile previously diverged: the sidebar handlers (`chat/index.tsx`,
 * `code/index.tsx`, `work/index.tsx`) eagerly POSTed `/api/channels` on
 * tap, leaving an empty channel in Recents every time the user changed
 * their mind. This hook brings mobile in line with web — the draft
 * route mounts the same `ChatView`, but `state` is synthesised
 * client-side and `send` is overridden to:
 *
 *   1. POST `/api/channels` with the draft's title + entryKind.
 *   2. POST the first message body to the freshly-created channel.
 *   3. `router.replace` the draft route with the real channel route so
 *      the back button skips the now-stale draft.
 *
 * Returns the same `ChannelMessagesHook` shape as
 * `useChannelMessages`, so `ChatView` consumes both interchangeably.
 *
 * `unconfigured` is preserved so the user gets the same "Connect to
 * your desktop" panel they'd get from a real channel route — without a
 * baseUrl there's nothing to create against.
 */
export function useDraftChannel(
  productMode: MobileProductMode,
  entryActionId: string,
): ChannelMessagesHook {
  const router = useRouter();
  const tabsCopy = getMobileTabsCopy(resolveDefaultMobileLocale());
  const apiCopy = getMobileApiCopy(resolveDefaultMobileLocale());

  const [unconfigured, setUnconfigured] = useState<boolean | null>(null);
  const [sendState, setSendState] = useState<ChannelSendState>({ kind: 'idle' });
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    (async () => {
      const config = await loadConnectionConfig();
      if (cancelledRef.current) {
        return;
      }
      setUnconfigured(!config.baseUrl);
    })();
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const channelTitle = getMobileChannelTitle(tabsCopy, productMode, entryActionId);

  const state: ChannelMessagesState =
    unconfigured === null
      ? { kind: 'loading' }
      : unconfigured
        ? { kind: 'unconfigured' }
        : {
            kind: 'data',
            channelTitle,
            messages: [],
            resolveAttachmentUrl: NOOP_RESOLVE_ATTACHMENT_URL,
          };

  const send = useCallback(
    async (body: string): Promise<void> => {
      const trimmed = body.trim();
      if (trimmed.length === 0) {
        return;
      }
      const apiEntryKind = resolveMobileDraftApiEntryKind(
        productMode,
        entryActionId,
      );
      if (apiEntryKind === null) {
        // Defensive — `+ Parallel X` is intercepted by
        // `getMobileDesktopOnlyAlertCopy` before this route mounts. If
        // we somehow landed here, refuse to create silently rather than
        // stamping out a default channel.
        setSendState({
          kind: 'error',
          error: new MobileApiError(apiCopy.createChannelFailed, null, null),
        });
        return;
      }
      setSendState({ kind: 'sending' });
      try {
        const config = await loadConnectionConfig();
        if (!config.baseUrl) {
          setSendState({
            kind: 'error',
            error: new MobileApiError(
              apiCopy.configureBaseUrlBeforeSending,
              null,
              null,
            ),
          });
          return;
        }
        const client = createMobileApiClient(config);
        // Drop the attachment-resolver result; we just instantiate the
        // client to share the connection config + headers behaviour.
        void buildAttachmentResolver;

        const created = await client.post<MobileCreateChannelResponse>(
          CREATE_CHANNEL_PATH,
          {
            title: channelTitle,
            topic: '',
            originSurface: productMode,
            entryKind: apiEntryKind,
          },
        );
        const newChannelId = created.channel.id;
        await client.post(messagesPath(newChannelId), { body: trimmed });
        setSendState({ kind: 'idle' });
        router.replace(`/(tabs)/${productMode}/${newChannelId}`);
      } catch (error) {
        if (error instanceof MobileApiError) {
          setSendState({ kind: 'error', error });
        } else {
          setSendState({
            kind: 'error',
            error: new MobileApiError(
              error instanceof Error ? error.message : apiCopy.sendFailed,
              null,
              error,
            ),
          });
        }
      }
    },
    [apiCopy, channelTitle, entryActionId, productMode, router],
  );

  const refetch = useCallback(() => {
    // No fetch on draft surface; pull-to-refresh is a no-op.
  }, []);

  return { state, refetch, send, sendState };
}
