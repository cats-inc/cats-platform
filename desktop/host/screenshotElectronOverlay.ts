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
        focus() {
          window.focus();
        },
        onBeforeInputEvent(listener) {
          window.webContents.on('before-input-event', listener);
          return () => {
            window.webContents.off('before-input-event', listener);
          };
        },
        onClosed(listener) {
          window.once('closed', listener);
          return () => {
            window.off('closed', listener);
          };
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
