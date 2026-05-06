import { useCallback, useState } from 'react';

import { createMobileApiClient, MobileApiError } from '../../api/client';
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
 * Callers typically pair the mutation with a refetch of the parent
 * sidebar data (`useProductSidebarData.refetch`) so the row
 * disappears once the desktop has acked. The hook does NOT mutate
 * any local list itself; that stays the call site's responsibility
 * because the server is the source of truth for which channels
 * still exist.
 */

export type DeleteRecentState =
  | { kind: 'idle' }
  | { kind: 'deleting'; channelId: string }
  | { kind: 'error'; error: MobileApiError };

export interface DeleteRecentHook {
  state: DeleteRecentState;
  /**
   * Issues the DELETE. Resolves on success, rejects with
   * `MobileApiError` on failure. The hook also moves to
   * `state.kind === 'error'` on rejection so the screen can render
   * the message inline if it doesn't handle the rejection itself.
   */
  delete: (channelId: string) => Promise<void>;
  reset: () => void;
}

const channelDetailPath = (channelId: string): string =>
  `/api/channels/${encodeURIComponent(channelId)}`;

export function useDeleteRecent(): DeleteRecentHook {
  const [state, setState] = useState<DeleteRecentState>({ kind: 'idle' });
  const copy = getMobileApiCopy(resolveDefaultMobileLocale());

  const deleteRecent = useCallback(
    async (channelId: string): Promise<void> => {
      setState({ kind: 'deleting', channelId });
      try {
        const config = await loadConnectionConfig();
        if (!config.baseUrl) {
          const error = new MobileApiError(
            copy.configureBaseUrlForClient,
            null,
            null,
          );
          setState({ kind: 'error', error });
          throw error;
        }
        const client = createMobileApiClient(config);
        await client.del(channelDetailPath(channelId));
        setState({ kind: 'idle' });
      } catch (error) {
        const apiError =
          error instanceof MobileApiError
            ? error
            : new MobileApiError(
                error instanceof Error ? error.message : copy.unknownError,
                null,
                error,
              );
        setState({ kind: 'error', error: apiError });
        throw apiError;
      }
    },
    [copy],
  );

  const reset = useCallback(() => {
    setState({ kind: 'idle' });
  }, []);

  return { state, delete: deleteRecent, reset };
}
