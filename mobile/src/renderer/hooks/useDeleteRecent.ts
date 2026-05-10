import { useCallback, useState } from 'react';

import { MobileApiError } from '../../api/client';
import { loadMobileAuthenticatedSession } from '../../api/authSession';
import { loadConnectionConfig } from '../../api/persistence';
import {
  getMobileApiCopy,
  resolveDefaultMobileLocale,
} from '../../../../src/mobile/index.js';

/**
 * Mutation hook for `DELETE /api/channels/{id}` (the Recents-row
 * delete action). Mirrors web's `deleteChatChannel` semantics: no
 * confirmation step on either surface — the swipe-to-reveal +
 * second-tap on the red button is the commit on mobile.
 *
 * State shape is per-channelId (a `Set` of in-flight ids) rather
 * than a single state machine, because:
 *
 *   - Multiple rows can be deleted in parallel; tracking them
 *     independently lets each row render its own spinner without
 *     blocking the others.
 *   - Multi-tap dedupe — a second tap on the same row's Delete
 *     button while the first DELETE is in flight is a no-op,
 *     preventing the renderer from issuing duplicate DELETEs to
 *     the desktop.
 *
 * Callers do NOT need to call `refetch()` after a successful
 * delete: `useMobileAppShell` subscribes to the desktop's SSE
 * `recents_changed` event so the app-shell payload re-fetches on
 * its own. (See `useMobileAppShell.ts` for the SSE wiring.)
 */

export interface DeleteRecentHook {
  /**
   * Issues the DELETE. Resolves on success, rejects with
   * `MobileApiError` on failure. Calling while a delete on the same
   * channelId is already in flight is a no-op (resolves
   * immediately). The hook tracks the in-flight set so callers can
   * render per-row UI via `isDeleting(channelId)`.
   */
  delete: (channelId: string) => Promise<void>;
  /** True while a DELETE for this channelId is in flight. */
  isDeleting: (channelId: string) => boolean;
  /** The most recent failure, if any. Reset by the next `delete`
   *  call or by `reset`. */
  lastError: MobileApiError | null;
  reset: () => void;
}

const channelDetailPath = (channelId: string): string =>
  `/api/channels/${encodeURIComponent(channelId)}`;

export function useDeleteRecent(): DeleteRecentHook {
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [lastError, setLastError] = useState<MobileApiError | null>(null);
  const copy = getMobileApiCopy(resolveDefaultMobileLocale());

  const isDeleting = useCallback(
    (channelId: string) => pending.has(channelId),
    [pending],
  );

  const deleteRecent = useCallback(
    async (channelId: string): Promise<void> => {
      if (pending.has(channelId)) {
        // Multi-tap dedupe — the row already has a DELETE in flight.
        return;
      }
      setLastError(null);
      setPending((prev) => {
        const next = new Set(prev);
        next.add(channelId);
        return next;
      });
      try {
        const config = await loadConnectionConfig();
        if (!config.baseUrl) {
          const error = new MobileApiError(
            copy.configureBaseUrlForClient,
            null,
            null,
          );
          setLastError(error);
          throw error;
        }
        const session = await loadMobileAuthenticatedSession(config);
        if (session.kind !== 'authenticated') {
          throw new MobileApiError(copy.authenticationRequired, 401, null);
        }
        await session.client.del(channelDetailPath(channelId));
        // Note: we deliberately keep the channelId in `pending` on
        // success. The SSE-driven refetch on `useMobileAppShell`
        // unmounts the row shortly after; clearing here would let
        // the spinner flicker back to the Delete label for a beat
        // before the row vanishes. Clearing happens when the
        // component unmounts.
      } catch (error) {
        const apiError =
          error instanceof MobileApiError
            ? error
            : new MobileApiError(
                error instanceof Error ? error.message : copy.unknownError,
                null,
                error,
              );
        setLastError(apiError);
        // On failure, clear the pending entry so the row's button
        // re-enables for a retry (the row is still visible because
        // the server didn't actually delete the channel).
        setPending((prev) => {
          if (!prev.has(channelId)) {
            return prev;
          }
          const next = new Set(prev);
          next.delete(channelId);
          return next;
        });
        throw apiError;
      }
    },
    [copy, pending],
  );

  const reset = useCallback(() => {
    setLastError(null);
    setPending(new Set());
  }, []);

  return {
    delete: deleteRecent,
    isDeleting,
    lastError,
    reset,
  };
}
