import { useCallback, useRef, type SetStateAction } from 'react';
import { fetchArchiveChannel, ConversationArchiveRequestError } from '../api/conversationArchive.js';
import { applyChannelSubscriptionStateToLoadState } from '../entitySubscriptionChannelDispatcher.js';
import type { AppLoadState } from '../workspaceAppViewState.js';

/** SSE accepted while an HTTP read is pending takes precedence over that read. */
export function useArchiveChannelRefresh(options: { channelId: string | null; scope: string;
  setState(action: SetStateAction<AppLoadState>): void; refreshAppShell(): void }) {
  const observed = useRef({ id: options.channelId, scope: options.scope, epoch: 0 });
  if (observed.current.id !== options.channelId || observed.current.scope !== options.scope) {
    observed.current = { id: options.channelId, scope: options.scope, epoch: 0 };
  }
  const observe = useCallback(() => { observed.current.epoch++; }, []);
  const refresh = useCallback(async (channelId: string, signal: AbortSignal): Promise<void> => {
    const ticket = observed.current;
    for (let attempt = 0; attempt < 2; attempt++) {
      const epoch = ticket.epoch, channel = await fetchArchiveChannel(channelId, signal);
      if (observed.current !== ticket || ticket.id !== channelId) return;
      if (ticket.epoch !== epoch) continue;
      const current = () => !signal.aborted && observed.current === ticket && ticket.epoch === epoch;
      options.setState(state => current() && state.status === 'ready' && state.payload.chat.selectedChannelId === channelId
        ? applyChannelSubscriptionStateToLoadState(state, { selectedChannelId: channelId, selectedChannel: channel,
          parallelChatGroups: state.payload.chat.parallelChatGroups }) : state);
      options.refreshAppShell();
      return;
    }
    throw new ConversationArchiveRequestError('archive_refresh_failed', 409);
  }, [options.setState, options.refreshAppShell]);
  return { refreshArchivedConversation: refresh, observeArchiveChannel: observe };
}
