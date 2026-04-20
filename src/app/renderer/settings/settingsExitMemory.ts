import { isSettingsPath } from '../../../shared/settingsRoute.js';

// Tracks the router-history position just before the user entered the
// Settings surface in this session, so the X close button can skip all
// in-settings tab navigations (e.g., General → My Cats → Assistants) and
// land on whatever non-settings surface the user came from.
//
// We use `idx - 1` as the "where I came from" marker, but only when we
// have actually observed a non-settings path in this session. Without
// that flag, a hard reload at a deep settings URL (e.g. /settings/runtime
// at idx=7) would incorrectly treat idx=6 as the return target even if
// idx=6 is itself another settings entry. When we have no reliable memory,
// the close button falls back to /lobby via getSettingsExitDelta returning
// null.
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

let preSettingsIdx: number | null = null;
let wasInSettings = false;
let hasSeenNonSettings = false;

export function recordSettingsRouteTransition(pathname: string, idx: number | undefined): void {
  const nowInSettings = isSettingsPath(pathname);
  if (!nowInSettings) {
    hasSeenNonSettings = true;
    preSettingsIdx = null;
  } else if (!wasInSettings) {
    preSettingsIdx = hasSeenNonSettings && typeof idx === 'number' && idx > 0
      ? idx - 1
      : null;
  }
  wasInSettings = nowInSettings;
}

export function getSettingsExitDelta(currentIdx: number | undefined): number | null {
  if (
    typeof currentIdx === 'number'
    && typeof preSettingsIdx === 'number'
    && currentIdx > preSettingsIdx
  ) {
    return -(currentIdx - preSettingsIdx);
  }
  return null;
}

// Test-only: reset module state for isolation between test cases.
export function __resetSettingsExitMemoryForTests(): void {
  preSettingsIdx = null;
  wasInSettings = false;
  hasSeenNonSettings = false;
}

export { isSettingsPath };
