import { BrowserWindow } from 'electron';

import type {
  DesktopScreenshotOverlayWindowFactory,
  DesktopScreenshotOverlayWindowHandle,
} from './screenshotOverlayController.js';

export function createElectronScreenshotOverlayWindowFactory(): DesktopScreenshotOverlayWindowFactory {
  return {
    createWindow(options): DesktopScreenshotOverlayWindowHandle {
      const window = new BrowserWindow(options);
      return {
        async loadURL(url) {
          await window.loadURL(url);
        },
        setAlwaysOnTop(enabled, level) {
          window.setAlwaysOnTop(enabled, level);
        },
        close() {
          window.close();
        },
        isDestroyed() {
          return window.isDestroyed();
        },
      };
    },
  };
}
