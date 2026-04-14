const CAT_ACTOR_PREFIX = 'actor-cat-';

export interface DisplayActorLink {
  actorId: string;
  displayName: string;
}

export interface CatActorLink extends DisplayActorLink {
  catId: string;
}

export function readCatIdFromActorId(actorId: string | null | undefined): string | null {
  if (!actorId || !actorId.startsWith(CAT_ACTOR_PREFIX)) {
    return null;
  }

  const catId = actorId.slice(CAT_ACTOR_PREFIX.length);
  return catId.length > 0 ? catId : null;
}

export function listCatActorLinks(
  actors: readonly DisplayActorLink[],
): CatActorLink[] {
  return actors.flatMap((actor) => {
    const catId = readCatIdFromActorId(actor.actorId);
    return catId ? [{ ...actor, catId }] : [];
  });
}
