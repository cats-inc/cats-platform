import { useEffect, useRef, useState } from 'react';
import type { TranscriptChannelView } from '../../../chat/shared/transcript.js';
import { changeConversationArchive, ConversationArchiveRequestError } from '../api/conversationArchive.js';

export type RefreshArchivedConversation = (channelId: string, signal: AbortSignal) => Promise<void>;
interface State { key: string; busy: 'archive' | 'restore' | 'refresh' | null; archived: boolean | null; needsRefresh: boolean; error: string | null; }
const clean = (key: string): State => ({ key, busy: null, archived: null, needsRefresh: false, error: null });

/** A completed mutation and its displayed window must agree before editing resumes. */
export function useConversationArchive(channel: TranscriptChannelView, refresh?: RefreshArchivedConversation, scope = '') {
  const id = channel.id, key = JSON.stringify([scope, id]);
  const [state, setState] = useState<State>(() => clean(key));
  const active = state.key === key ? state : clean(key);
  const request = useRef<AbortController | null>(null);
  const currentKey = useRef(key); currentKey.current = key;
  useEffect(() => {
    setState(clean(key));
    return () => { request.current?.abort(); request.current = null; };
  }, [key]);
  const available = channel.messagePage?.archiveActions === true && Boolean(refresh);
  const archived = (active.busy || active.needsRefresh ? active.archived : null) ?? Boolean(channel.messagePage?.archive);

  async function run(action: 'archive' | 'restore' | 'refresh'): Promise<void> {
    if (!available || !refresh || request.current || (active.needsRefresh && action !== 'refresh')) return;
    const controller = new AbortController(); request.current = controller;
    const current = () => request.current === controller && !controller.signal.aborted && currentKey.current === key;
    setState(previous => ({ ...(previous.key === key ? previous : clean(key)), busy: action, error: null }));
    let error: string | null = null, knownArchived = active.archived;
    try {
      if (action !== 'refresh') {
        try {
          const result = await changeConversationArchive(id, action, controller.signal);
          knownArchived = result.archived;
          if (!current()) return;
          setState(previous => ({ ...previous, archived: result.archived }));
        } catch (failure) {
          if (!current()) return;
          error = failure instanceof ConversationArchiveRequestError ? failure.code : 'archive_failed';
        }
      }
      // Also reconcile after a lost/error response: the server may have committed.
      await refresh(id, controller.signal);
      // The refresh helper admits the HTTP window or keeps a newer SSE window.
      // Resume from the accepted props, never from the unadmitted response.
      if (current()) setState({ key, busy: null, archived: null, needsRefresh: false, error });
    } catch {
      if (current()) setState({ key, busy: null, archived: knownArchived, needsRefresh: true, error: 'archive_refresh_failed' });
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  return { available, archived, busy: active.busy, needsRefresh: active.needsRefresh, error: active.error,
    readOnly: channel.status === 'archived' || archived || Boolean(active.busy) || active.needsRefresh,
    act: () => run(archived ? 'restore' : 'archive'), refresh: () => run('refresh') };
}
