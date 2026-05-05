import { isPlatformEntityPath } from '../../../shared/platformRoutePaths.js';
import { createSurfaceExitMemory } from '../surfaceExitMemory.js';

// Cats Directory's exit-memory tracker. Built on the shared
// `createSurfaceExitMemory` factory so the back button in
// `EntitiesAppShellSidebar` can compute the same kind of history
// delta the Settings × button uses — clicking it lands on whatever
// non-Entities surface the user came from (chat, work, code, lobby),
// skipping any in-Entities navigations along the way.
//
// Lifecycle mirrors Settings: every non-Entities path visit clears
// the snapshot and marks "we've seen a home surface"; the next entry
// from a non-Entities path snapshots `idx - 1` as the return target;
// in-Entities navigations keep that snapshot stable. Cold mount on a
// deep `/entities/...` URL (bookmark, tray, hard reload) leaves the
// snapshot null, and the back button falls back to `/lobby` with
// replace.

const memory = createSurfaceExitMemory({ isInside: isPlatformEntityPath });

export function recordEntitiesRouteTransition(
  pathname: string,
  idx: number | undefined,
): void {
  memory.record(pathname, idx);
}

export function getEntitiesExitDelta(
  currentIdx: number | undefined,
): number | null {
  return memory.getExitDelta(currentIdx);
}

// Test-only: reset module state for isolation between test cases.
export function __resetEntitiesExitMemoryForTests(): void {
  memory.__resetForTests();
}
