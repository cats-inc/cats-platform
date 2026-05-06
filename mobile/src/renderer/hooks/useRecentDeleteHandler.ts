import { useCallback } from 'react';
import { Alert } from 'react-native';

import {
  getMobileProductSidebarCopy,
  getMobileTabsCopy,
  resolveDefaultMobileLocale,
} from '../../../../src/mobile/index.js';
import { useDeleteRecent } from './useDeleteRecent';

/**
 * Builds the `onDeleteRecent` callback the trimmed product sidebar
 * passes through `Swipeable`'s revealed Delete action. Centralised
 * so chat / code / work `index.tsx` don't each re-implement the
 * "DELETE → refetch → Alert on failure" lifecycle. Mirrors web's
 * `deleteChatChannel` semantics: no confirmation step — the swipe
 * is the commit.
 *
 *   - On success: refetch the parent sidebar data so the row
 *     disappears once the desktop has acked. Optimistic local
 *     removal would be nicer; the trade-off is that an optimistic
 *     remove + failed DELETE leaves the UI lying about the
 *     desktop's state until the next refetch fires. Refetch-on-
 *     ack is server-truth-first.
 *   - On failure: refetch (in case the channel actually was
 *     deleted server-side) and surface the error message via
 *     Alert. Title pulls from `MobileProductSidebarCopy.deleteFailedTitle`;
 *     body is the underlying `MobileApiError.message`.
 */
export function useRecentDeleteHandler(
  refetch: () => void,
): (channelId: string) => void {
  const deleteRecent = useDeleteRecent();
  const locale = resolveDefaultMobileLocale();
  const tabsCopy = getMobileTabsCopy(locale);
  const sidebarCopy = getMobileProductSidebarCopy(locale);

  return useCallback(
    (channelId: string) => {
      void (async () => {
        try {
          await deleteRecent.delete(channelId);
          refetch();
        } catch (error) {
          refetch();
          const message = error instanceof Error ? error.message : '';
          Alert.alert(sidebarCopy.deleteFailedTitle, message, [
            { text: tabsCopy.desktopOnlyOkAction, style: 'cancel' },
          ]);
        }
      })();
    },
    [deleteRecent, refetch, sidebarCopy.deleteFailedTitle, tabsCopy.desktopOnlyOkAction],
  );
}
