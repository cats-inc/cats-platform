import type { DesktopBootstrapSnapshot } from './contracts.js';

type NavSnapshot = Pick<DesktopBootstrapSnapshot, 'phase' | 'app' | 'prerequisites'>;

function isSelectionRequired(snapshot: NavSnapshot): boolean {
  const selection = snapshot.prerequisites?.providerSelection;
  return selection?.state === 'missing' || selection?.state === 'invalid';
}

function isSetupComplete(snapshot: NavSnapshot): boolean {
  return Boolean(snapshot.app.setupCompleted || snapshot.app.setupCompleteAt);
}

function shouldShowSetupStatusOnboarding(snapshot: NavSnapshot): boolean {
  return Boolean(
    snapshot.phase === 'ready_for_setup'
      && snapshot.app.onboardingMode === 'setup_status'
      && (!isSetupComplete(snapshot) || isSelectionRequired(snapshot)),
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
    if (shouldShowSetupStatusOnboarding(snapshot)) {
      return null;
    }
    return `${options.appBaseUrl}/setup`;
  }

  if (snapshot.phase === 'ready_for_chat') {
    return `${options.appBaseUrl}${snapshot.app.entryPath}`;
  }

  if (isSelectionRequired(snapshot)) {
    return null;
  }

  if (snapshot.phase === 'needs_prerequisites' && isSetupComplete(snapshot)) {
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

export function shouldAllowDesktopBootstrapWindowNavigation(options: {
  bootstrapPageVisible: boolean;
  windowRevealRequested: boolean;
}): boolean {
  return options.bootstrapPageVisible || options.windowRevealRequested;
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
    || shouldShowSetupStatusOnboarding(snapshot)
    || (snapshot.phase === 'needs_prerequisites'
      && (!isSetupComplete(snapshot) || isSelectionRequired(snapshot)));
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
