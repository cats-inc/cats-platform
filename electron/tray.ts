import { Menu, Tray, nativeImage } from 'electron';

import type { BrowserWindow } from 'electron';

const TRAY_ICON_DATA_URL = `data:image/png;base64,${[
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAdUlEQVR4AWP4DwUMDAwM',
  'jI2N/8+fP/9Pnjz5j4GBgZGBgQHh4eH/Z8+e/SMjI5M2NjYGAoKCiJmZmRkYGBgY/v//',
  '/58/f/5nYGBgYGBg8P///x8jIyMDA8P/P3/+fGhoaGBgYOD///8D4qCgoOB/4eHh////',
  '/w8AF/QVFzppM6IAAAAASUVORK5CYII=',
].join('')}`;

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

function createTrayIcon() {
  return nativeImage.createFromDataURL(TRAY_ICON_DATA_URL);
}

function runTrayAction(action: () => Promise<void>): void {
  void action().catch((error) => {
    process.stderr.write(
      `Desktop tray action failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  });
}

export function createDesktopTrayController(
  options: CreateDesktopTrayControllerOptions,
): DesktopTrayController {
  const tray = new Tray(createTrayIcon());
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
