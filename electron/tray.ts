import { app, Menu, Tray, nativeImage } from 'electron';

import type { BrowserWindow } from 'electron';

export interface DesktopTrayController {
  showWindow(): void;
  hideWindowToTray(): void;
  dispose(): void;
}

interface CreateDesktopTrayControllerOptions {
  getWindow: () => BrowserWindow | null;
  onNavigate: (path: string) => Promise<void>;
  onQuit: () => void;
}

async function createTrayIcon(): Promise<Electron.NativeImage> {
  try {
    const icon = await app.getFileIcon(app.getPath('exe'), { size: 'normal' });
    if (!icon.isEmpty()) {
      return icon;
    }
  } catch {
    // Fall through to empty image — Electron will use its default.
  }
  return nativeImage.createEmpty();
}

function runTrayAction(action: () => Promise<void>): void {
  void action().catch((error) => {
    process.stderr.write(
      `Desktop tray action failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  });
}

export async function createDesktopTrayController(
  options: CreateDesktopTrayControllerOptions,
): Promise<DesktopTrayController> {
  const icon = await createTrayIcon();
  const tray = new Tray(icon);
  tray.setToolTip('Cats');

  const showWindow = () => {
    const window = options.getWindow();
    if (!window) {
      return;
    }
    window.show();
    window.focus();
  };

  const navItem = (label: string, path: string) => ({
    label,
    click: () => {
      runTrayAction(async () => {
        await options.onNavigate(path);
        showWindow();
      });
    },
  });

  tray.setContextMenu(Menu.buildFromTemplate([
    navItem('Open Chat', '/chat'),
    navItem('Open Work', '/work'),
    navItem('Open Code', '/code'),
    { type: 'separator' as const },
    navItem('Settings', '/settings'),
    { type: 'separator' as const },
    {
      label: 'Quit',
      click: () => {
        options.onQuit();
      },
    },
  ]));

  tray.on('click', () => {
    showWindow();
  });

  return {
    showWindow,
    hideWindowToTray() {
      const window = options.getWindow();
      if (!window) {
        return;
      }
      window.hide();
    },
    dispose() {
      tray.destroy();
    },
  };
}
