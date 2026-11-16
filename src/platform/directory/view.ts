import type {
  PlatformDirectoryView,
  PlatformLobbyCatterySummary,
  PlatformLobbyClowderSummary,
} from '../../shared/platform-contract.js';
import type { DirectorySnapshot } from './contracts.js';

function byCreation<T extends { createdAt: string; name: string; id: string }>(left: T, right: T): number {
  return left.createdAt.localeCompare(right.createdAt)
    || left.name.localeCompare(right.name)
    || left.id.localeCompare(right.id);
}

function byJoined<T extends { joinedAt: string; catId: string }>(left: T, right: T): number {
  return left.joinedAt.localeCompare(right.joinedAt) || left.catId.localeCompare(right.catId);
}

/**
 * What the Directory shows. `catIds` are the Cats that exist (archived ones
 * included); a membership naming any other Cat is left out, not removed.
 */
export function buildDirectoryView(
  snapshot: DirectorySnapshot,
  catIds: ReadonlySet<string>,
): PlatformDirectoryView {
  return {
    clowders: [...snapshot.clowders].sort(byCreation).map((clowder) => ({
      id: clowder.id,
      name: clowder.name,
      description: clowder.description,
      parentCatteryId: clowder.parentCatteryId,
      createdAt: clowder.createdAt,
      updatedAt: clowder.updatedAt,
      members: snapshot.clowderMemberships
        .filter((member) => member.clowderId === clowder.id && catIds.has(member.catId))
        .sort(byJoined)
        .map((member) => ({
          catId: member.catId,
          role: member.role,
          status: member.status,
          expiresAt: member.expiresAt,
          joinedAt: member.joinedAt,
        })),
    })),
    catteries: [...snapshot.catteries].sort(byCreation).map((cattery) => ({
      id: cattery.id,
      name: cattery.name,
      description: cattery.description,
      domain: cattery.domain,
      createdAt: cattery.createdAt,
      updatedAt: cattery.updatedAt,
      members: snapshot.catteryMemberships
        .filter((member) => member.catteryId === cattery.id && catIds.has(member.catId))
        .sort(byJoined)
        .map((member) => ({
          catId: member.catId,
          role: member.role,
          status: member.status,
          joinedAt: member.joinedAt,
        })),
    })),
  };
}

/**
 * Lobby and sidebar summaries. A Clowder's Cats are its members. A Cattery's
 * Cats are its direct members plus the members of its Clowders, each counted
 * once (SPEC-103 FR-10). Groups have no image yet, so `avatarUrl` is null.
 */
export function buildLobbyDirectorySummaries(view: PlatformDirectoryView): {
  clowders: PlatformLobbyClowderSummary[];
  catteries: PlatformLobbyCatterySummary[];
} {
  return {
    clowders: view.clowders.map((clowder) => ({
      id: clowder.id,
      name: clowder.name,
      avatarUrl: null,
      createdAt: clowder.createdAt,
      parentCatteryId: clowder.parentCatteryId,
      catCount: clowder.members.length,
      memberCount: clowder.members.length,
    })),
    catteries: view.catteries.map((cattery) => {
      const clowders = view.clowders.filter((clowder) => clowder.parentCatteryId === cattery.id);
      const cats = new Set([
        ...cattery.members.map((member) => member.catId),
        ...clowders.flatMap((clowder) => clowder.members.map((member) => member.catId)),
      ]);
      return {
        id: cattery.id,
        name: cattery.name,
        avatarUrl: null,
        createdAt: cattery.createdAt,
        memberCount: cattery.members.length,
        clowderCount: clowders.length,
        catCount: cats.size,
      };
    }),
  };
}
