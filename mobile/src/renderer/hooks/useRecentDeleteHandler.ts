import { useCallback } from 'react';
import { Alert } from 'react-native';

import {
  getMobileProductSidebarCopy,
  getMobileTabsCopy,
  resolveDefaultMobileLocale,
} from '../../../../src/mobile/index.js';
import { useDeleteRecent } from './useDeleteRecent';

export interface RecentDeleteHandlerHook {
  /**
   * Callback for the trimmed product sidebar's revealed Delete
   * action. Issues the DELETE, lets `useMobileAppShell`'s SSE
   * subscription refresh the list, and surfaces a failure Alert
   * when the call rejects. Multi-tap dedupe lives inside
   * `useDeleteRecent` — calling this with the same channelId
   * while a previous call is still in flight is a no-op.
   */
  onDelete: (channelId: string) => void;
  /** True while a DELETE on this channelId is still in flight. */
  isDeleting: (channelId: string) => boolean;
}

/**
 * Builds the `onDelete / isDeleting` pair the trimmed product
 * sidebar consumes. Centralised so chat / code / work `index.tsx`
 * don't each re-implement the lifecycle. Mirrors web's
 * `deleteChatChannel` semantics: no confirmation step — the swipe
 * is the commit. The list re-renders via SSE from
 * `useMobileAppShell`, NOT via an explicit refetch here, so the
 * delete is always reconciled against server truth.
 */
export function useRecentDeleteHandler(): RecentDeleteHandlerHook {
  const deleteRecent = useDeleteRecent();
  const locale = resolveDefaultMobileLocale();
  const tabsCopy = getMobileTabsCopy(locale);
  const sidebarCopy = getMobileProductSidebarCopy(locale);

  const onDelete = useCallback(
    (channelId: string) => {
      void (async () => {
        try {
          await deleteRecent.delete(channelId);
          // Don't refetch here — `useMobileAppShell` subscribes to
          // the desktop's `recents_changed` SSE event and refetches
          // automatically when the server publishes the mutation.
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          Alert.alert(sidebarCopy.deleteFailedTitle, message, [
            { text: tabsCopy.desktopOnlyOkAction, style: 'cancel' },
          ]);
        }
      })();
    },
    [deleteRecent, sidebarCopy.deleteFailedTitle, tabsCopy.desktopOnlyOkAction],
  );

  return { onDelete, isDeleting: deleteRecent.isDeleting };
}
