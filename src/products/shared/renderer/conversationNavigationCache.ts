import type { QueryClient } from '@tanstack/react-query';
import { onProviderClientInvalidation } from '../../../app/renderer/providerClientInvalidation.js';
import type { AppShellPayload } from '../api/workspaceContracts.js';
import {
  applyChannelSubscriptionStateToPayload,
  type ChannelSubscriptionState,
} from './entitySubscriptionChannelDispatcher.js';
import { sharedQueryClient } from './queryClient.js';
import { clearConversationViewMemory, pruneConversationViewMemory } from './conversationViewMemory.js';

const QUERY_PREFIX = ['conversation-navigation'] as const;
const RETENTION_MS = 30 * 60 * 1_000;
const MAX_CHANNELS = 24;

export function conversationScope(payload: AppShellPayload): string {
  return payload.scopeId || `${payload.metadata.host}:${payload.metadata.port}/${payload.chat.id}`;
}

/** Retained server projections only. The mounted subscription remains authoritative. */
export class ConversationNavigationCache {
  private recent = new Map<string, { scope: string; id: string }>();
  private listeners = new Set<() => void>();
  generation = 0;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  constructor(private client: QueryClient, private capacity = MAX_CHANNELS) {
    client.setQueryDefaults(QUERY_PREFIX, { gcTime: RETENTION_MS });
  }

  read(scope: string, id: string): ChannelSubscriptionState | undefined {
    const data = this.client.getQueryData<ChannelSubscriptionState>([...QUERY_PREFIX, scope, id]);
    if (data) this.touch(scope, id);
    return data;
  }

  remember(scope: string, state: ChannelSubscriptionState): void {
    if (state.selectedChannelId !== state.selectedChannel.id) return;
    // Optimistic messages have client timestamps and must remain rollbackable.
    // They are an overlay on the mounted view, never retained server truth.
    if (state.selectedChannel.messages.some((message) => message.metadata?.optimistic === true)) return;
    const key = [...QUERY_PREFIX, scope, state.selectedChannelId];
    const current = this.client.getQueryData<ChannelSubscriptionState>(key);
    if (current && current.selectedChannel.updatedAt > state.selectedChannel.updatedAt) return;
    this.client.setQueryData(key, state);
    this.touch(scope, state.selectedChannelId);
  }

  rememberPayload(payload: AppShellPayload): void {
    const channel = payload.chat.selectedChannel;
    if (!channel || channel.id !== payload.chat.selectedChannelId) return;
    this.remember(conversationScope(payload), {
      selectedChannelId: channel.id,
      selectedChannel: channel,
      parallelChatGroups: payload.chat.parallelChatGroups.filter((group) =>
        group.memberChannelIds.includes(channel.id)),
    });
  }

  prune(scope: string, ids: ReadonlySet<string>): void {
    pruneConversationViewMemory(scope, ids);
    for (const entry of this.recent.values()) {
      if (entry.scope === scope && !ids.has(entry.id)) {
        this.remove(scope, entry.id);
      }
    }
  }

  remove(scope: string, id: string): void {
    this.recent.delete(JSON.stringify([scope, id]));
    this.client.removeQueries({ queryKey: [...QUERY_PREFIX, scope, id], exact: true });
  }

  clear(): void {
    this.generation += 1;
    this.recent.clear();
    this.client.removeQueries({ queryKey: QUERY_PREFIX });
    clearConversationViewMemory();
    for (const listener of this.listeners) listener();
  }

  private touch(scope: string, id: string): void {
    const key = JSON.stringify([scope, id]);
    this.recent.delete(key);
    this.recent.set(key, { scope, id });
    while (this.recent.size > this.capacity) {
      const oldest = this.recent.values().next().value;
      if (oldest) this.remove(oldest.scope, oldest.id);
    }
  }
}

export const conversationNavigationCache = new ConversationNavigationCache(sharedQueryClient);
onProviderClientInvalidation(() => conversationNavigationCache.clear());

export function selectRetainedConversation(
  payload: AppShellPayload,
  channelId: string | null,
  cache: ConversationNavigationCache,
): AppShellPayload {
  if (!channelId || !payload.chat.channels.some((channel) => channel.id === channelId)) return payload;
  const retained = cache.read(conversationScope(payload), channelId);
  if (payload.chat.selectedChannel?.id === channelId
    && payload.chat.selectedChannelId === channelId
    && (payload.chat.selectedChannel.messages.some((message) => message.metadata?.optimistic === true)
      || !retained || retained.selectedChannel.updatedAt <= payload.chat.selectedChannel.updatedAt)) {
    return payload;
  }
  const selected = {
    ...payload,
    chat: { ...payload.chat, selectedChannelId: channelId, selectedChannel: null },
  };
  return retained ? applyChannelSubscriptionStateToPayload(selected, retained) : selected;
}
