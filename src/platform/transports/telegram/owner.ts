import type {
  TelegramConversationBinding,
  TelegramOwnerCandidate,
  TelegramOwnerRecord,
} from './contracts.js';
import type { TelegramRelayStore } from './store/index.js';

/**
 * SPEC-140: a Telegram bot binding answers only its owner.
 *
 * A new binding starts `open`: the first private chat that writes to it
 * becomes its owner, as in Cats Bot. A binding that already talked to people
 * before owners existed is settled from the private chats that wrote to it:
 * one is pinned (`history`), several make the owner choose. While the owner
 * must choose, nobody gets through, and every private chat that writes is
 * collected as a candidate for the owner to pick in Settings. A reset leads
 * there too, so it never reopens "first message wins". In a private chat the
 * chat id is the user's id (always positive), so the owner is a chat id.
 */

const MAX_CANDIDATES = 10;
const PRIVATE_CHAT_ID = /^[1-9]\d*$/u;

/** Which chat records a binding may claim as its own history. */
export interface TelegramOwnerScope {
  /** Records written before bindings were scoped belong to the default binding only. */
  defaultBindingId: string | null;
  /** A record from before the binding existed is not its history. */
  bindingCreatedAt: string | null;
}

export function isTelegramPrivateChatId(chatId: string): boolean {
  return PRIVATE_CHAT_ID.test(chatId);
}

function wroteIn(binding: TelegramConversationBinding, bindingId: string, scope: TelegramOwnerScope): boolean {
  const ownedHere = binding.bindingId === bindingId
    || (binding.bindingId === null && scope.defaultBindingId === bindingId);
  return ownedHere
    && binding.telegramChatType === 'private'
    && isTelegramPrivateChatId(binding.telegramChatId)
    // A delivery once made records for chats it only sent to; those have no inbound message id.
    && binding.lastInboundMessageId !== null
    && Boolean(binding.lastInboundAt)
    && (!scope.bindingCreatedAt || (binding.lastInboundAt ?? '') >= scope.bindingCreatedAt);
}

function chatsThatWrote(
  store: TelegramRelayStore,
  bindingId: string,
  scope: TelegramOwnerScope,
): TelegramConversationBinding[] {
  const byChat = new Map<string, TelegramConversationBinding>();
  for (const binding of store.listBindings()) {
    if (!wroteIn(binding, bindingId, scope)) continue;
    const previous = byChat.get(binding.telegramChatId);
    if (!previous || (binding.lastInboundAt ?? '') > (previous.lastInboundAt ?? '')) {
      byChat.set(binding.telegramChatId, binding);
    }
  }
  return [...byChat.values()];
}

function toCandidate(binding: TelegramConversationBinding): TelegramOwnerCandidate {
  return {
    userId: binding.telegramChatId,
    displayName: null,
    username: binding.telegramChatUsername,
    lastInboundAt: binding.lastInboundAt,
    lastMessagePreview: binding.lastInboundTextPreview ? binding.lastInboundTextPreview.slice(0, 80) : null,
  };
}

/**
 * For callers without the binding's scope (room lookups, typing): the stored
 * record, or else a judgement from records scoped to this binding alone that
 * is not stored, so a partial view never settles anything.
 */
export function peekTelegramOwner(store: TelegramRelayStore, bindingId: string): TelegramOwnerRecord {
  return store.getOwner(bindingId)
    ?? deriveTelegramOwner(store, bindingId, new Date().toISOString(), { defaultBindingId: null, bindingCreatedAt: null });
}

/** The binding's owner record, settled from the chats that wrote to it when it has none yet. */
export function resolveTelegramOwner(
  store: TelegramRelayStore,
  bindingId: string,
  nowIso: string,
  scope: TelegramOwnerScope,
): TelegramOwnerRecord {
  const existing = store.getOwner(bindingId);
  if (existing) {
    return existing;
  }
  const derived = deriveTelegramOwner(store, bindingId, nowIso, scope);
  store.setOwner(bindingId, derived);
  return derived;
}

function deriveTelegramOwner(
  store: TelegramRelayStore,
  bindingId: string,
  nowIso: string,
  scope: TelegramOwnerScope,
): TelegramOwnerRecord {
  const seen = chatsThatWrote(store, bindingId, scope);
  const uncertain = store.isOwnerStateUncertain?.() === true;
  let derived: TelegramOwnerRecord;
  if (seen.length === 1 && !uncertain) {
    derived = {
      state: 'pinned',
      userId: seen[0]!.telegramChatId,
      displayName: null,
      username: seen[0]!.telegramChatUsername,
      pinnedAt: nowIso,
      how: 'history',
    };
  } else if (seen.length === 0 && !uncertain) {
    derived = { state: 'open', since: nowIso };
  } else {
    // Several chats, or relay state that was damaged and lost: the owner confirms.
    derived = {
      state: 'choose',
      since: nowIso,
      candidates: seen
        .sort((left, right) => (right.lastInboundAt ?? '').localeCompare(left.lastInboundAt ?? ''))
        .slice(0, MAX_CANDIDATES)
        .map(toCandidate),
    };
  }
  return derived;
}

export interface TelegramOwnerSender {
  displayName: string | null;
  username: string | null;
  preview: string | null;
}

export type TelegramOwnerDecision =
  | { allowed: true; owner: Extract<TelegramOwnerRecord, { state: 'pinned' }>; claimed: boolean }
  | { allowed: false; reason: 'not_owner' | 'owner_not_confirmed' };

/**
 * Ingress: whether a private chat may reach the binding. An `open` binding is
 * claimed by the chat asking; while the owner must choose, the chat becomes a
 * candidate and is not admitted.
 */
export function admitTelegramOwnerChat(
  store: TelegramRelayStore,
  input: { bindingId: string; chatId: string; sender: TelegramOwnerSender; nowIso: string; scope: TelegramOwnerScope },
): TelegramOwnerDecision {
  if (!isTelegramPrivateChatId(input.chatId)) {
    return { allowed: false, reason: 'not_owner' };
  }
  const owner = resolveTelegramOwner(store, input.bindingId, input.nowIso, input.scope);
  if (owner.state === 'pinned') {
    return owner.userId === input.chatId
      ? { allowed: true, owner, claimed: false }
      : { allowed: false, reason: 'not_owner' };
  }
  if (owner.state === 'choose') {
    const candidate: TelegramOwnerCandidate = {
      userId: input.chatId,
      displayName: input.sender.displayName,
      username: input.sender.username,
      lastInboundAt: input.nowIso,
      lastMessagePreview: input.sender.preview ? input.sender.preview.slice(0, 80) : null,
    };
    const others = owner.candidates.filter((entry) => entry.userId !== input.chatId);
    store.setOwner(input.bindingId, {
      ...owner,
      candidates: [candidate, ...others].slice(0, MAX_CANDIDATES),
    });
    return { allowed: false, reason: 'owner_not_confirmed' };
  }
  const claimed: Extract<TelegramOwnerRecord, { state: 'pinned' }> = {
    state: 'pinned',
    userId: input.chatId,
    displayName: input.sender.displayName,
    username: input.sender.username,
    pinnedAt: input.nowIso,
    how: 'first_message',
  };
  store.setOwner(input.bindingId, claimed);
  return { allowed: true, owner: claimed, claimed: true };
}

/** Delivery: whether the binding may send to a chat. Only its pinned owner's chat qualifies. */
export function isTelegramOwnerChat(
  store: TelegramRelayStore,
  input: { bindingId: string; chatId: string; nowIso: string; scope: TelegramOwnerScope },
): boolean {
  const owner = resolveTelegramOwner(store, input.bindingId, input.nowIso, input.scope);
  return owner.state === 'pinned' && owner.userId === input.chatId;
}

/**
 * Settings: forget the owner. The binding then answers nobody and collects the
 * chats that write, for the owner to pick; it never goes back to "first
 * message wins", so a stranger who keeps writing cannot simply win again.
 */
export function resetTelegramOwner(store: TelegramRelayStore, bindingId: string, nowIso: string): TelegramOwnerRecord {
  const owner: TelegramOwnerRecord = { state: 'choose', since: nowIso, candidates: [] };
  store.setOwner(bindingId, owner);
  return owner;
}

/** Settings: the owner picks themselves among the candidates. */
export function chooseTelegramOwner(
  store: TelegramRelayStore,
  input: { bindingId: string; userId: string; nowIso: string },
): TelegramOwnerRecord | null {
  const owner = store.getOwner(input.bindingId);
  if (owner?.state !== 'choose') {
    return null;
  }
  const candidate = owner.candidates.find((entry) => entry.userId === input.userId);
  if (!candidate || !isTelegramPrivateChatId(candidate.userId)) {
    return null;
  }
  const pinned: TelegramOwnerRecord = {
    state: 'pinned',
    userId: candidate.userId,
    displayName: candidate.displayName,
    username: candidate.username,
    pinnedAt: input.nowIso,
    how: 'owner_choice',
  };
  store.setOwner(input.bindingId, pinned);
  return pinned;
}
