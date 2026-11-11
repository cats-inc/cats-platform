import type { BossCatTurnRecord, ChatMessage, OwnerStartedSurface } from '../api/contracts.js';
import type { RouteAuthContext } from '../../../shared/http.js';

/**
 * SPEC-139 owner-started stamp. Only the authenticated owner message route sets it, on the
 * source message, so retries and queued turns read it from there. Transports, dispatch,
 * parallel members, choice answers, schedules, heartbeats and other Cats never carry it.
 */
export const OWNER_STARTED_METADATA_KEY = 'ownerStarted';

/** Desktop's cookie (CSRF already enforced by the auth gate) or mobile's bearer, owner only. */
export function resolveOwnerStartedSurface(
  auth: RouteAuthContext | null | undefined,
): OwnerStartedSurface | null {
  if (!auth?.principal?.membership.roles.includes('owner')) {
    return null;
  }
  if (auth.credentialKind === 'browser_cookie') {
    return 'desktop';
  }
  return auth.credentialKind === 'mobile_bearer' ? 'mobile' : null;
}

/** Server-owned message metadata (SPEC-139): the stamp and the Boss Cat tools' receipts. */
export const BOSS_CAT_TURN_METADATA_KEY = 'bossCatTurn';
/** SPEC-139 FR-10: the owner's join card. */
export const BOSS_CAT_JOIN_REQUEST_METADATA_KEY = 'bossCatJoinRequest';

/** A proposal's card (SPEC-142 FR-15), the other card rendered for the owner only. */
export const CONVERSATION_PROPOSAL_CARD_METADATA_KEY = 'conversationProposal';

/**
 * The owner's cards, the Boss Cat join card and a proposal's card, are rendered for the owner
 * only: no model context, no transport.
 */
export function isBossCatJoinRequestMessage(message: Pick<ChatMessage, 'metadata'> | null | undefined): boolean {
  return Boolean(message?.metadata?.[BOSS_CAT_JOIN_REQUEST_METADATA_KEY]
    || message?.metadata?.[CONVERSATION_PROPOSAL_CARD_METADATA_KEY]);
}

export function withoutBossCatJoinRequests<T extends Pick<ChatMessage, 'id' | 'metadata'>>(
  messages: readonly T[],
  alsoIds: ReadonlySet<string> = new Set(),
): T[] {
  return messages.filter((message) => !isBossCatJoinRequestMessage(message) && !alsoIds.has(message.id));
}

/** Drops any caller-supplied stamp or receipts; only the server adds them. */
export function withoutOwnerStarted<T extends Record<string, unknown>>(
  metadata: T | null | undefined,
): Omit<T, typeof OWNER_STARTED_METADATA_KEY | typeof BOSS_CAT_TURN_METADATA_KEY
  | typeof BOSS_CAT_JOIN_REQUEST_METADATA_KEY> {
  const {
    [OWNER_STARTED_METADATA_KEY]: _stamp,
    [BOSS_CAT_TURN_METADATA_KEY]: _receipts,
    [BOSS_CAT_JOIN_REQUEST_METADATA_KEY]: _card,
    ...rest
  } = metadata ?? ({} as T);
  return rest;
}

export function readOwnerStarted(
  message: Pick<ChatMessage, 'senderKind' | 'metadata' | 'choiceResponse'> | null | undefined,
): OwnerStartedSurface | null {
  if (message?.senderKind !== 'user' || message.choiceResponse) {
    return null;
  }
  return parseOwnerStartedSurface(message.metadata?.[OWNER_STARTED_METADATA_KEY]);
}

export function readBossCatTurnRecord(message: Pick<ChatMessage, 'metadata'> | null | undefined): BossCatTurnRecord | null {
  const record = message?.metadata?.[BOSS_CAT_TURN_METADATA_KEY] as BossCatTurnRecord | undefined;
  return record?.schemaVersion === 1 && Array.isArray(record.receipts) ? record : null;
}

export function parseOwnerStartedSurface(value: unknown): OwnerStartedSurface | null {
  return value === 'desktop' || value === 'mobile' ? value : null;
}
