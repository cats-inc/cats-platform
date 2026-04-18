// Tracks the router-history position just before the user entered the
// Settings surface in this session, so the X close button can skip all
// in-settings tab navigations (e.g., General → My Cats → Assistants) and
// land on whatever non-settings surface the user came from.
//
// Lifecycle:
//   - Entered settings (previous path was non-settings): remember the
//     idx of the last non-settings entry (= current idx - 1). Only set
//     when idx > 0; on a fresh mount into /settings (tray direct, bookmark,
//     hard reload) there is nothing behind us to return to and we fall
//     through to the lobby default.
//   - Still inside settings: keep the remembered idx stable.
//   - Left settings: clear. Next entry restarts tracking.
//
// Module state is per-session. On hard reload inside /settings we lose
// the memory and the close button falls back to the lobby — acceptable
// because the user's "came from" context is genuinely gone at that point.

const SETTINGS_PATH_PREFIX = '/settings';

let preSettingsIdx: number | null = null;
let wasInSettings = false;

export function isSettingsPath(pathname: string): boolean {
  return pathname === SETTINGS_PATH_PREFIX || pathname.startsWith(`${SETTINGS_PATH_PREFIX}/`);
}

export function recordSettingsRouteTransition(pathname: string, idx: number | undefined): void {
  const nowInSettings = isSettingsPath(pathname);
  if (nowInSettings && !wasInSettings) {
    preSettingsIdx = typeof idx === 'number' && idx > 0 ? idx - 1 : null;
  } else if (!nowInSettings) {
    preSettingsIdx = null;
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
