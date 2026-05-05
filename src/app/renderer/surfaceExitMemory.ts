// Generic per-surface exit-memory tracker. Lets a transition surface
// (currently Settings, soon also Cats Directory) compute "where did
// the user come from before they entered this surface" so a close /
// back button can do `navigate(delta)` and skip in-surface tab
// navigations entirely, landing back on the user's original surface.
//
// Each call to `createSurfaceExitMemory` returns its own isolated
// tracker — module state lives in the closure, so multiple surfaces
// can run side-by-side without colliding. The same logic Settings
// originally shipped with (in `settingsExitMemory.ts`) lifted to a
// factory; the per-surface modules now just supply their `isInside`
// predicate and re-export bound methods.
//
// We use `idx - 1` as the "where I came from" marker when we observed
// a non-surface path before entering. Without that observation, a
// hard reload at a deep surface URL (e.g. `/settings/runtime` at
// idx=7, or `/entities/cats/<id>` at idx=4) cannot infer the prior
// idx safely — `getExitDelta` returns null and the caller falls
// back to a default destination (typically `/lobby`) with replace.

export interface SurfaceExitMemory {
  /** Call on every navigation event; the tracker decides whether to
   * snapshot the entry idx or clear it based on the path. */
  record(pathname: string, idx: number | undefined): void;
  /** Returns a negative `delta` suitable for `navigate(delta)` that
   * jumps back to the surface the user came from, or `null` when no
   * reliable memory exists (caller should fall back to a default). */
  getExitDelta(currentIdx: number | undefined): number | null;
  /** Test-only: reset closure state for isolation between cases. */
  __resetForTests(): void;
}

export function createSurfaceExitMemory(options: {
  isInside: (pathname: string) => boolean;
}): SurfaceExitMemory {
  let preEntryIdx: number | null = null;
  let wasInside = false;
  let hasSeenOutside = false;

  return {
    record(pathname, idx) {
      const nowInside = options.isInside(pathname);
      if (!nowInside) {
        hasSeenOutside = true;
        preEntryIdx = null;
      } else if (!wasInside) {
        preEntryIdx = hasSeenOutside && typeof idx === 'number' && idx > 0
          ? idx - 1
          : null;
      }
      wasInside = nowInside;
    },
    getExitDelta(currentIdx) {
      if (
        typeof currentIdx === 'number'
        && typeof preEntryIdx === 'number'
        && currentIdx > preEntryIdx
      ) {
        return -(currentIdx - preEntryIdx);
      }
      return null;
    },
    __resetForTests() {
      preEntryIdx = null;
      wasInside = false;
      hasSeenOutside = false;
    },
  };
}
