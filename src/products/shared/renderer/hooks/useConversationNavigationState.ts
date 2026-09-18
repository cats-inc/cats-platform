import { useCallback, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type SetStateAction } from 'react';
import { findDirectLaneForCat } from '../../../../app/renderer/productShell/myCatNavigation.js';
import {
  conversationNavigationCache,
  conversationScope,
  selectRetainedConversation,
  type ConversationNavigationCache,
} from '../conversationNavigationCache.js';
import type { AppLoadState } from '../workspaceAppViewState.js';

/** The route selects the visible projection; delayed shell responses cannot navigate. */
export function useConversationNavigationState(options: {
  state: AppLoadState;
  setState: (action: SetStateAction<AppLoadState>) => void;
  routeChannelId: string | null;
  directRecipientId: string | null;
  cache?: ConversationNavigationCache;
}) {
  const cache = options.cache ?? conversationNavigationCache;
  const generation = useSyncExternalStore(cache.subscribe, () => cache.generation, () => cache.generation);
  const acceptedGeneration = useRef(generation);
  const scope = options.state.status === 'ready' ? conversationScope(options.state.payload) : null;
  const previousScope = useRef(scope);
  const channelId = options.routeChannelId ?? (
    options.directRecipientId && options.state.status === 'ready'
      ? findDirectLaneForCat(options.state.payload.chat.channels, options.directRecipientId)?.id ?? null
      : null
  );
  const state = useMemo<AppLoadState>(() => acceptedGeneration.current !== generation
    ? { status: 'loading' }
    : options.state.status === 'ready'
    ? { status: 'ready', payload: selectRetainedConversation(options.state.payload, channelId, cache) }
    : options.state, [cache, channelId, generation, options.state]);
  const latest = useRef({ state, channelId, setter: options.setState });
  latest.current = { state, channelId, setter: options.setState };

  useLayoutEffect(() => {
    if (acceptedGeneration.current !== generation) return;
    if (options.state.status !== 'ready') return;
    if (previousScope.current && scope !== previousScope.current) {
      cache.clear();
      acceptedGeneration.current = cache.generation;
    }
    previousScope.current = scope;
    const payload = options.state.payload;
    cache.prune(conversationScope(payload), new Set(payload.chat.channels.map((channel) => channel.id)));
    cache.rememberPayload(payload);
  }, [cache, generation, options.state, scope]);

  const setState = useCallback((action: SetStateAction<AppLoadState>) => {
    const current = latest.current;
    if (generation !== cache.generation) return;
    if (scope && current.state.status === 'ready' && conversationScope(current.state.payload) !== scope) return;
    acceptedGeneration.current = generation;
    let next = typeof action === 'function' ? action(current.state) : action;
    if (next.status === 'ready') {
      cache.rememberPayload(next.payload);
      next = { status: 'ready', payload: selectRetainedConversation(next.payload, current.channelId, cache) };
    }
    latest.current.state = next;
    current.setter(next);
  }, [cache, generation, scope]);

  return { state, setState, channelId, subscriptionScope: `${scope ?? ''}:${generation}` };
}
