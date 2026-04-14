const CAT_ACTOR_PREFIX = 'actor-cat-';

export function readCatIdFromActorId(actorId: string | null | undefined): string | null {
  if (!actorId || !actorId.startsWith(CAT_ACTOR_PREFIX)) {
    return null;
  }

  const catId = actorId.slice(CAT_ACTOR_PREFIX.length);
  return catId.length > 0 ? catId : null;
}
