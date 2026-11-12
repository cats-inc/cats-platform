import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { ChatChannelView } from '../../../chat/api/contracts.js';
import type { TranscriptChannelView } from '../../../chat/shared/transcript.js';
import { getTranscriptHistory, subscribeTranscriptHistoryEpoch, transcriptHistoryEpoch } from '../transcriptHistoryCache.js';
import { forgetConversationScroll } from '../conversationViewMemory.js';
import { TranscriptHistory, mergeTranscriptMessages } from '../transcriptHistory.js';

export function usePagedTranscript<T extends ChatChannelView>(channel: T, scope: string) {
  const page = (channel as TranscriptChannelView).messagePage;
  const initial = useMemo(() => ({ messages: channel.messages.filter(message => message.metadata?.optimistic !== true), total: page?.total ?? channel.messages.length,
    nextCursor: page?.nextCursor ?? null, orderRevision: page?.orderRevision ?? 'unpaged', historyRevision: page?.historyRevision,
    rawCount: page?.windowCount ?? Math.min(page?.total ?? channel.messages.length, 50) }), [channel.messages, page]);
  const epoch = useSyncExternalStore(subscribeTranscriptHistoryEpoch, transcriptHistoryEpoch, transcriptHistoryEpoch);
  const enabled = Boolean(page);
  const history = useMemo(() => enabled
    ? getTranscriptHistory(scope, channel.id, initial, () => forgetConversationScroll(scope, channel.id))
    : new TranscriptHistory(initial, async () => { throw new Error('Transcript paging is unavailable'); }), [scope, channel.id, epoch, enabled]);
  const state = useSyncExternalStore(history.subscribe, history.getSnapshot, history.getSnapshot);
  useEffect(() => { if (page) history.observe(initial); }, [history, initial, page]);
  const messages = page && (state.orderRevision === page.orderRevision || history.isRetired(page.orderRevision))
    ? state.messages : channel.messages;
  const overlay = channel.messages.filter(message => message.metadata?.optimistic === true);
  return { channel: page ? { ...channel, messages: overlay.length ? mergeTranscriptMessages(messages, overlay) : messages } : channel,
    history, state, enabled: Boolean(page) };
}
