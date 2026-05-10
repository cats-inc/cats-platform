import type { PlatformPrincipal } from './types.js';

export type PlatformActorAttributionDecision =
  | { ok: true; coreActorId: string }
  | { ok: false; reason: 'missing_core_actor_mapping' };

export function resolveCoreActorIdForPrincipal(
  principal: PlatformPrincipal,
): PlatformActorAttributionDecision {
  const coreActorId = principal.membership.coreActorId?.trim();
  if (!coreActorId) {
    return { ok: false, reason: 'missing_core_actor_mapping' };
  }
  return { ok: true, coreActorId };
}

export function requireCoreActorIdForPrincipal(principal: PlatformPrincipal): string {
  const decision = resolveCoreActorIdForPrincipal(principal);
  if (!decision.ok) {
    throw new PlatformActorAttributionError(decision.reason);
  }
  return decision.coreActorId;
}

export class PlatformActorAttributionError extends Error {
  constructor(public readonly reason: 'missing_core_actor_mapping') {
    super('Authenticated principal is not mapped to a Core actor.');
    this.name = 'PlatformActorAttributionError';
  }
}
