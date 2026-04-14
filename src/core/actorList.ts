import type {
  CatsCoreState,
  CoreActorKind,
  CoreActorRecord,
  CoreActorSource,
  CoreActorStatus,
} from './types.js';

export interface CoreActorListQuery {
  actorKinds?: CoreActorKind[];
  statuses?: CoreActorStatus[];
  sources?: CoreActorSource[];
  sourceIds?: string[];
  roles?: string[];
  hasDefaultExecutionTarget?: boolean;
  hasMemory?: boolean;
  limit?: number;
}

function compareByUpdatedAt(
  left: { updatedAt: string; id: string },
  right: { updatedAt: string; id: string },
): number {
  const updatedComparison = right.updatedAt.localeCompare(left.updatedAt);
  if (updatedComparison !== 0) {
    return updatedComparison;
  }
  return left.id.localeCompare(right.id);
}

function matchesQuery(
  actor: CoreActorRecord,
  query: CoreActorListQuery,
): boolean {
  if (
    query.actorKinds
    && !query.actorKinds.includes(actor.kind)
  ) {
    return false;
  }
  if (
    query.statuses
    && !query.statuses.includes(actor.status)
  ) {
    return false;
  }
  if (
    query.sources
    && !query.sources.includes(actor.source)
  ) {
    return false;
  }
  if (
    query.sourceIds
    && !query.sourceIds.includes(actor.sourceId ?? '')
  ) {
    return false;
  }
  if (
    query.roles
    && !actor.roles.some((role) => query.roles?.includes(role))
  ) {
    return false;
  }
  if (
    query.hasDefaultExecutionTarget !== undefined
    && (actor.defaultExecutionTarget !== null) !== query.hasDefaultExecutionTarget
  ) {
    return false;
  }
  if (
    query.hasMemory !== undefined
    && (
      (actor.memory.summary !== null)
      || actor.memory.facts.length > 0
      || actor.memory.openLoops.length > 0
      || actor.memory.updatedAt !== null
    ) !== query.hasMemory
  ) {
    return false;
  }

  return true;
}

export function listActors(
  core: CatsCoreState,
  query: CoreActorListQuery = {},
): CoreActorRecord[] {
  return core.actors
    .filter((actor) => matchesQuery(actor, query))
    .sort(compareByUpdatedAt)
    .slice(0, query.limit);
}
