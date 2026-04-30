import type { DesktopBootstrapSnapshot } from './contracts.js';

type NavSnapshot = Pick<DesktopBootstrapSnapshot, 'phase' | 'app' | 'prerequisites'>;

function isCliMissing(snapshot: NavSnapshot): boolean {
  return Boolean(
    snapshot.phase === 'needs_prerequisites'
      && snapshot.prerequisites
      && snapshot.prerequisites.cliInventory
      && snapshot.prerequisites.cliInventory.source === 'runtime'
      && snapshot.prerequisites.cliInventory.total === 0,
  );
}

export function resolveDesktopBootstrapNavigation(
  snapshot: NavSnapshot,
  options: {
    appBaseUrl: string;
    showWindowOnStartup: boolean;
  },
): string | null {
  if (!options.showWindowOnStartup) {
    return null;
  }

  if (snapshot.phase === 'ready_for_setup') {
    return `${options.appBaseUrl}/setup`;
  }

  if (snapshot.phase === 'ready_for_chat') {
    return `${options.appBaseUrl}${snapshot.app.entryPath}`;
  }

  // CLI missing is a hard gate: stay on bootstrap page regardless of
  // setupCompleteAt so the user lands on the install UI instead of an
  // empty-shell chat (or, post-setup, on a chat that can't reach any CLI).
  if (snapshot.phase === 'needs_prerequisites' && isCliMissing(snapshot)) {
    return null;
  }

  if (snapshot.phase === 'needs_prerequisites' && snapshot.app.setupCompleteAt) {
    return `${options.appBaseUrl}${snapshot.app.entryPath}`;
  }

  return null;
}

export function shouldNavigateDesktopBootstrap(options: {
  showWindowOnStartup: boolean;
  windowRevealRequested: boolean;
}): boolean {
  return options.showWindowOnStartup || options.windowRevealRequested;
}

export function shouldRevealDesktopBootstrapRecovery(
  snapshot: NavSnapshot,
  options: {
    showWindowOnStartup: boolean;
    windowRevealRequested: boolean;
  },
): boolean {
  if (!shouldNavigateDesktopBootstrap(options)) {
    return false;
  }

  return snapshot.phase === 'failed'
    || (snapshot.phase === 'needs_prerequisites'
      && (!snapshot.app.setupCompleteAt || isCliMissing(snapshot)));
}

export function resolveDesktopWindowRevealNavigation(
  snapshot: NavSnapshot | null,
  options: {
    appBaseUrl: string;
    bootstrapPageVisible: boolean;
  },
): string | null {
  if (!options.bootstrapPageVisible || !snapshot) {
    return null;
  }

  return resolveDesktopBootstrapNavigation(snapshot, {
    appBaseUrl: options.appBaseUrl,
    showWindowOnStartup: true,
  });
}
