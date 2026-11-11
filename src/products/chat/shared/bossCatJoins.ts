import type { BossCatJoinPolicy, ChatChannelState, ChatState } from '../api/contracts.js';

/**
 * SPEC-139 FR-12: a Boss Cat that joined a conversation sees the last 8 messages before it
 * joined, then everything from then on, in every session, replacements and rejoins included.
 */
export const BOSS_CAT_JOIN_PRIOR_MESSAGES = 8;

/** FR-8: the owner's one switch for every Boss Cat; absent means 「每次問我」. */
export function resolveBossCatJoinPolicy(state: Pick<ChatState, 'bossCatJoinPolicy'>): BossCatJoinPolicy {
  const value = state.bossCatJoinPolicy;
  return value === 'never' || value === 'allow' ? value : 'ask';
}

/** When this Cat joined the conversation through a Boss Cat join, or null. */
export function readBossCatJoinSince(
  channel: Pick<ChatChannelState, 'bossCatJoins'>,
  catId: string | null | undefined,
): string | null {
  const since = catId ? channel.bossCatJoins?.[catId]?.since : undefined;
  return since && Number.isFinite(Date.parse(since)) ? since : null;
}

/** The last 8 messages before `since`, then every message at or after it. */
export function boundMessagesToJoin<T extends { createdAt: string }>(messages: readonly T[], since: string): T[] {
  const at = Date.parse(since);
  const before = messages.filter((message) => !(Date.parse(message.createdAt) >= at));
  const after = messages.filter((message) => Date.parse(message.createdAt) >= at);
  return [...before.slice(-BOSS_CAT_JOIN_PRIOR_MESSAGES), ...after];
}
