/**
 * Companion is an identity trait on the Cat record (ADR-124), not a skill
 * profile. Only the Cat's own roles decide it; channel assignment roles are
 * join-time snapshots, so views project the Cat's current state onto them.
 */
export const COMPANION_ROLE = 'companion';

/** Runtime skill requested for companion Cats on a built-in skill profile. */
export const COMPANION_SKILL_ID = 'companion';

/**
 * Event on a lane message a companion said on its own (SPEC-124 heartbeat).
 * It is not a reply to anything, so reply pickers must skip it.
 */
export const COMPANION_HEARTBEAT_EVENT = 'companion_heartbeat';

export function isCompanionCat(cat: { roles: readonly string[] } | null | undefined): boolean {
  return cat?.roles.includes(COMPANION_ROLE) ?? false;
}

/** Returns a copy of `roles` whose companion membership matches `companion`. */
export function withCompanionRole(roles: readonly string[], companion: boolean): string[] {
  if (roles.includes(COMPANION_ROLE) === companion) {
    return [...roles];
  }
  return companion
    ? [...roles, COMPANION_ROLE]
    : roles.filter((role) => role !== COMPANION_ROLE);
}
