import { useEffect, useState } from 'react';
import { buildCodeApiConversationWorkAreasPath } from '../../shared/apiPaths.js';
import type { CodeConversationWorkAreas } from '../../shared/workAreas.js';
import { readCodeWorkAreas } from '../../shared/readWorkAreas.js';

export interface CodeWorkAreasState {
  conversationId: string;
  data: CodeConversationWorkAreas | null;
  status: 'loading' | 'ready' | 'interrupted' | 'unavailable';
}

/** Transport loss never leaves a retained operation looking active. */
export function inactiveWorkAreas(value: CodeConversationWorkAreas): CodeConversationWorkAreas {
  const next = structuredClone(value);
  for (const participant of next.participants) {
    for (const execution of participant.executions) {
      if (execution.continuity === 'current') execution.continuity = 'interrupted';
    }
    for (const repository of participant.repositories) for (const checkout of repository.checkouts) {
      for (const operation of checkout.operations) {
        operation.active = false;
        if (operation.state === 'running') operation.displayState = 'unknown';
      }
    }
  }
  return next;
}

export function useCodeWorkAreas(conversationId: string, enabled: boolean): CodeWorkAreasState {
  const [state, setState] = useState<CodeWorkAreasState>({ conversationId, data: null, status: 'loading' });
  useEffect(() => {
    let disposed = false;
    setState({ conversationId, data: null, status: enabled ? 'loading' : 'unavailable' });
    if (!enabled) return;
    if (typeof EventSource === 'undefined') {
      setState({ conversationId, data: null, status: 'unavailable' }); return;
    }
    const accept = (input: unknown) => {
      const value = readCodeWorkAreas(input, conversationId);
      if (disposed || !value) return;
      setState({ conversationId, data: value, status: 'ready' });
    };
    // Native EventSource owns reconnection; every attach receives a reconciled snapshot.
    const source = new EventSource(buildCodeApiConversationWorkAreasPath(conversationId));
    source.addEventListener('work_areas', event => {
      try {
        if ((event as MessageEvent<string>).data.length <= 256 * 1024) {
          accept(JSON.parse((event as MessageEvent<string>).data));
        }
      } catch { /* A malformed event cannot replace retained verified data. */ }
    });
    source.addEventListener('work_areas_unavailable', () => {
      if (disposed) return;
      setState({ conversationId, data: null, status: 'unavailable' }); source.close();
    });
    source.onerror = () => {
      if (disposed) return;
      setState(previous => ({ conversationId,
        data: source.readyState === EventSource.CLOSED || previous.conversationId !== conversationId
          ? null : previous.data ? inactiveWorkAreas(previous.data) : null,
        status: source.readyState === EventSource.CLOSED ? 'unavailable' : 'interrupted' }));
    };
    return () => { disposed = true; source.close(); };
  }, [conversationId, enabled]);
  return state.conversationId === conversationId ? state : { conversationId, data: null, status: 'loading' };
}
