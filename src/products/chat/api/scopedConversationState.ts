import { isDeepStrictEqual } from 'node:util';
import type { ChatChannelState, ChatState } from './contracts.js';
import type { ChatChannelMutationContext, ChatStore } from '../state/store.js';
import { ChatApiError } from './routeErrors.js';

/** A dispatch-local state, never an input to a global snapshot write. */
export function readConversationState(store: ChatStore, id: string): Promise<ChatState> {
  return store.readChannelState?.(id) ?? store.read();
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
