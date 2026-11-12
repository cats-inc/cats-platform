import { isDeepStrictEqual } from 'node:util';
import type { CatsCoreState } from '../../../core/types.js';
import type { ChatChannelState, ChatState } from './contracts.js';
import type { ChatChannelMutationContext, ChatChannelsMutationOptions, ChatStore } from '../state/store.js';
import { ChatApiError } from './routeErrors.js';
import { assertConversationWritable } from '../shared/conversationArchive.js';

/** A dispatch-local state, never an input to a global snapshot write. */
export function readConversationState(store: ChatStore, id: string): Promise<ChatState> {
  return store.readChannelState?.(id) ?? store.read();
}

/** Metadata-only, target-scoped input for stream/control read models. Never write it. */
export function readConversationMetadata(store: ChatStore, ids: string | readonly string[]): Promise<ChatState> {
  return store.readChannelStates?.(typeof ids === 'string' ? [ids] : ids, { metadataOnly: true }) ?? store.read();
}

export async function readConversationsState(store: ChatStore, ids: readonly string[],
  options: { excludeArchived?: boolean; archivedMetadataOnly?: boolean } = {}): Promise<ChatState> {
  if (store.readChannelStates) return store.readChannelStates(ids, options);
  const state = await store.read();
  return options.excludeArchived ? { ...state, channels: state.channels.filter(channel => channel.status !== 'archived') } : state;
}

export async function assertWritableConversation(store: ChatStore, id: string): Promise<void> {
  const channel = store.readChannelHeader ? await store.readChannelHeader(id)
    : (await store.read()).channels.find(channel => channel.id === id);
  if (!channel) throw new ChatApiError(404, 'channel_not_found', 'The selected conversation is unavailable.');
  assertConversationWritable(channel);
}

export async function readWritableConversationState(store: ChatStore, id: string): Promise<ChatState> {
  await assertWritableConversation(store, id);
  const state = await readConversationState(store, id);
  const channel = state.channels.find(channel => channel.id === id);
  if (!channel) throw new ChatApiError(404, 'channel_not_found', 'The selected conversation is unavailable.');
  assertConversationWritable(channel);
  return state;
}

/** Metadata-only inputs for read-only product models that never inspect messages. */
export async function readConversationCatalog(store: ChatStore): Promise<ChatState> {
  if (!store.readCatalog) return store.read();
  const catalog = await store.readCatalog();
  return { ...catalog.metadata, channels: catalog.headers.map(header => ({ ...header, messages: [] })) };
}

/** Apply a pure single-conversation product model under the store's atomic lock.
 * The database validates metadata; a partial view never reaches updateSnapshot.
 * Global/Core/membership changes must use their complete transaction path.
 */
export async function updateConversationState(store: ChatStore, id: string,
  mutate: (state: ChatState, context?: ChatChannelMutationContext) => ChatState): Promise<ChatState> {
  if (!store.updateChannel) {
    if (store.updateSnapshot) return (await store.updateSnapshot(({ chat, core }) => ({ chat: mutate(chat), core }))).chat;
    return store.write(mutate(await store.read()));
  }
  let result!: ChatState;
  const committed = await store.updateChannel(id, (channel, context) => {
    result = mutate({ ...structuredClone(context.chat), channels: [channel] }, context);
    if (result.channels.length !== 1 || result.channels[0]?.id !== id) {
      throw new TypeError('A conversation mutation must retain only its selected conversation');
    }
    const { channels, ...metadata } = result;
    return { channel: channels[0]!, metadata };
  });
  if (!committed) throw new Error(`Channel not found: ${id}`);
  return { ...result, channels: [committed] };
}

/** Existing selected members publish together; never pass their partial view to a global writer. */
export async function updateConversationsState(store: ChatStore, ids: readonly string[],
  mutate: (state: ChatState, context?: ChatChannelMutationContext) => ChatState,
  options: ChatChannelsMutationOptions = {}): Promise<ChatState> {
  if (store.updateChannels) return store.updateChannels(ids, mutate, options);
  const apply = (state: ChatState) => {
    options.preflight?.({ ...structuredClone(state), channels: state.channels.filter(channel => ids.includes(channel.id))
      .map(({ messages: _messages, ...header }) => ({ ...structuredClone(header), messages: [] })) });
    if (!options.excludeArchived) return mutate(state);
    const active = state.channels.filter(channel => channel.status !== 'archived');
    const result = mutate({ ...state, channels: active });
    const replacements = new Map(result.channels.map(channel => [channel.id, channel]));
    return { ...result, channels: state.channels.map(channel => replacements.get(channel.id) ?? channel) };
  };
  if (store.updateSnapshot) return (await store.updateSnapshot(({ chat, core }) => ({ chat: apply(chat), core }))).chat;
  return store.write(apply(await store.read()));
}

/** An owner participant operation may prepare Runtime work outside the store lock.
 * Preserve concurrent appends and untouched fields; never replace a conflicting
 * membership/profile/lease with the earlier prepared copy.
 */
export function mergePreparedParticipantMutation(latest: ChatChannelState, baseline: ChatChannelState,
  prepared: ChatChannelState): ChatChannelState {
  const conflict = () => new ChatApiError(409, 'conversation_changed',
    'The conversation changed while updating its participants. Reload and try again.');
  if (latest.id !== baseline.id || latest.id !== prepared.id) throw conflict();
  if (prepared.messages.length < baseline.messages.length
    || baseline.messages.some((message, index) => !isDeepStrictEqual(message, prepared.messages[index]))) {
    throw new TypeError('A prepared participant mutation may only append messages');
  }
  const merged = structuredClone(latest);
  const messages = new Map(merged.messages.map(message => [message.id, message]));
  for (const message of prepared.messages.slice(baseline.messages.length)) {
    const existing = messages.get(message.id);
    if (existing && !isDeepStrictEqual(existing, message)) throw conflict();
    if (!existing) { const copy = structuredClone(message); merged.messages.push(copy); messages.set(copy.id, copy); }
  }
  const keys = new Set([...Object.keys(baseline), ...Object.keys(prepared)]);
  for (const key of keys) {
    if (key === 'messages') continue;
    const field = key as keyof ChatChannelState;
    const before = baseline[field], desired = prepared[field], current = latest[field];
    if (isDeepStrictEqual(before, desired)) continue;
    if ((key === 'updatedAt' || key === 'lastMessageAt') && typeof desired === 'string') {
      Reflect.defineProperty(merged, key, { value: typeof current === 'string' && current > desired ? current : desired,
        enumerable: true, configurable: true, writable: true });
      continue;
    }
    if (!isDeepStrictEqual(current, before) && !isDeepStrictEqual(current, desired)) throw conflict();
    if (!Object.hasOwn(prepared, key)) Reflect.deleteProperty(merged, key);
    else Reflect.defineProperty(merged, key, { value: structuredClone(desired), enumerable: true, configurable: true, writable: true });
  }
  return merged;
}

/** Full header context and target/Core must belong to the same native revision. */
export async function updateCatalogConversation<T>(store: ChatStore, channelId: string,
  mutate: (state: ChatState, core: CatsCoreState, headers: readonly Omit<ChatChannelState, 'messages'>[]) => { state: ChatState; result: T },
  needsCatalog = true): Promise<T | undefined> {
  const preflight = (state: ChatState) => {
    const channel = state.channels.find(channel => channel.id === channelId);
    if (channel) assertConversationWritable(channel);
  };
  if (store.updateChannels && (!needsCatalog || store.readCatalog)) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const catalog = needsCatalog ? await store.readCatalog!() : null;
      let result: T | undefined, retry = false;
      await store.updateChannels([channelId], (state, context) => {
        if (catalog && (!catalog.revision || !context.revision)) throw new TypeError('Versioned conversation context is required');
        if (catalog && catalog.revision !== context.revision) { retry = true; return state; }
        const changed = mutate(state, structuredClone(context.core), catalog?.headers ?? []);
        result = changed.result; return changed.state;
      }, { preflight });
      if (!retry) return result;
    }
    throw new ChatApiError(409, 'conversation_changed', 'The conversation context changed. Reload and try again.');
  }
  if (!store.updateSnapshot) throw new TypeError('Atomic conversation storage is required');
  let result: T | undefined;
  await store.updateSnapshot(({ chat, core }) => {
    preflight(chat);
    if (!chat.channels.some(channel => channel.id === channelId)) return { chat, core };
    const changed = mutate(chat, structuredClone(core), chat.channels);
    result = changed.result; return { chat: changed.state, core };
  });
  return result;
}


/** One catalog revision supplies both routing metadata and owner/binding identity. */
export async function readConversationCatalogWithCore(store: ChatStore): Promise<{ state: ChatState; core: CatsCoreState }> {
  if (!store.readCatalog) {
    const [state, core] = await Promise.all([store.read(), store.readCore()]);
    return { state, core };
  }
  const catalog = await store.readCatalog();
  return { state: { ...catalog.metadata, channels: catalog.headers.map(header => ({ ...header, messages: [] })) }, core: catalog.core };
}
