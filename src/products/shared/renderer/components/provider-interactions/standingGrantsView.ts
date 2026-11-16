import type { BoundStandingGrants, ProviderConversationSnapshot } from '../../../../../shared/providerInteractions.js';

/**
 * ADR-155: the grants a conversation shows after a read. A full read replaces them. A partial or
 * unsupported read keeps those of sessions it could not see, marked unknown, so Stop never vanishes
 * because a read failed.
 */
export function nextVisibleGrants(previous: readonly BoundStandingGrants[], snapshot: ProviderConversationSnapshot):
  { grants: BoundStandingGrants[]; unknown: boolean } {
  const read = snapshot.standingGrants ?? [];
  if (snapshot.reason === 'some_sessions_unavailable' || !snapshot.supported) {
    return {
      grants: [...read, ...previous.filter((old) => !read.some((entry) => entry.binding.sessionId === old.binding.sessionId))],
      unknown: true,
    };
  }
  return { grants: [...read], unknown: false };
}
