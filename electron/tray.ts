import { app, Menu, Tray, nativeImage } from 'electron';

import type { BrowserWindow } from 'electron';

export interface DesktopTrayController {
  showWindow(): void;
  hideWindowToTray(): void;
  dispose(): void;
}

interface CreateDesktopTrayControllerOptions {
  getWindow: () => BrowserWindow | null;
  onShowSetup: () => Promise<void>;
  onShowChat: () => Promise<void>;
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

  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Open Cats',
      click: () => {
        runTrayAction(async () => {
          await options.onShowChat();
          showWindow();
        });
      },
    },
    {
      label: 'Open Setup',
      click: () => {
        runTrayAction(async () => {
          await options.onShowSetup();
          showWindow();
        });
      },
    },
    {
      type: 'separator',
    },
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
