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

  return null;
}
