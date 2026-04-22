export interface DesktopScreenshotOverlayEscapeShortcutRegistrar {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
}

export type DesktopScreenshotOverlayEscapeShortcutFailureReason =
  | 'returned_false'
  | 'threw';

export interface DesktopScreenshotOverlayEscapeShortcutFailure {
  reason: DesktopScreenshotOverlayEscapeShortcutFailureReason;
  error?: unknown;
}

export function registerDesktopScreenshotOverlayEscapeShortcut(
  registrar: DesktopScreenshotOverlayEscapeShortcutRegistrar,
  onEscape: () => void,
  onRegistrationFailure?: (failure: DesktopScreenshotOverlayEscapeShortcutFailure) => void,
): () => void {
  let registered = false;

  try {
    registered = registrar.register('Escape', onEscape);
    if (!registered) {
      onRegistrationFailure?.({ reason: 'returned_false' });
    }
  } catch (error) {
    registered = false;
    onRegistrationFailure?.({ reason: 'threw', error });
  }

  return () => {
    if (registered) {
      registrar.unregister('Escape');
      registered = false;
    }
  };
}
