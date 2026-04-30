import type { DesktopBootstrapSnapshot } from './contracts.js';

export function resolveDesktopBootstrapNavigation(
  snapshot: Pick<DesktopBootstrapSnapshot, 'phase' | 'app'>,
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
  snapshot: Pick<DesktopBootstrapSnapshot, 'phase' | 'app'>,
  options: {
    showWindowOnStartup: boolean;
    windowRevealRequested: boolean;
  },
): boolean {
  if (!shouldNavigateDesktopBootstrap(options)) {
    return false;
  }

  return snapshot.phase === 'failed'
    || (snapshot.phase === 'needs_prerequisites' && !snapshot.app.setupCompleteAt);
}

export function resolveDesktopWindowRevealNavigation(
  snapshot: Pick<DesktopBootstrapSnapshot, 'phase' | 'app'> | null,
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
