import { isSettingsPath } from '../../../shared/settingsRoute.js';
import { createSurfaceExitMemory } from '../surfaceExitMemory.js';

// Settings's exit-memory tracker. Built on the shared
// `createSurfaceExitMemory` factory so Settings and Directory (and any
// future transition surfaces) share one history-delta algorithm; the
// `isInside` predicate is the only per-surface bit.
//
// Lifecycle:
//   - Visit non-settings path: mark "we've seen a home surface", clear
//     preSettingsIdx (next entry restarts tracking).
//   - Enter settings from non-settings: snapshot preSettingsIdx = idx - 1.
//   - Still inside settings (including browser back/forward within
//     settings): keep preSettingsIdx stable.
//   - Mount fresh at a settings path (tray direct, bookmark, hard reload):
//     hasSeenNonSettings stays false → preSettingsIdx stays null → the
//     close button falls back to /lobby with replace.

const memory = createSurfaceExitMemory({ isInside: isSettingsPath });

export function recordSettingsRouteTransition(
  pathname: string,
  idx: number | undefined,
): void {
  memory.record(pathname, idx);
}

export function getSettingsExitDelta(
  currentIdx: number | undefined,
): number | null {
  return memory.getExitDelta(currentIdx);
}

// Test-only: reset module state for isolation between test cases.
export function __resetSettingsExitMemoryForTests(): void {
  memory.__resetForTests();
}

export { isSettingsPath };
