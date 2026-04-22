export interface DesktopScreenshotOverlayEscapeShortcutRegistrar {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
}

export function registerDesktopScreenshotOverlayEscapeShortcut(
  registrar: DesktopScreenshotOverlayEscapeShortcutRegistrar,
  onEscape: () => void,
): () => void {
  let registered = false;

  try {
    registered = registrar.register('Escape', onEscape);
  } catch {
    registered = false;
  }

  return () => {
    if (registered) {
      registrar.unregister('Escape');
      registered = false;
    }
  };
}
