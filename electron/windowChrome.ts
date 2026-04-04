export interface DesktopWindowChromeOptions {
  autoHideMenuBar?: boolean;
}

export interface DesktopWindowChromeController {
  setMenuBarVisibility(visible: boolean): void;
  setAutoHideMenuBar(hide: boolean): void;
}

export function resolveDesktopWindowChromeOptions(
  platform: NodeJS.Platform = process.platform,
): DesktopWindowChromeOptions {
  if (platform === 'darwin') {
    return {};
  }

  return {
    autoHideMenuBar: true,
  };
}

export function applyDesktopWindowChrome(
  window: DesktopWindowChromeController,
  platform: NodeJS.Platform = process.platform,
): void {
  if (platform === 'darwin') {
    return;
  }

  window.setAutoHideMenuBar(true);
  window.setMenuBarVisibility(false);
}
