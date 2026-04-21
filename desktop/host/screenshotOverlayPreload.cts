import { contextBridge, ipcRenderer } from 'electron';

import {
  DESKTOP_SCREENSHOT_OVERLAY_CANCEL_CHANNEL,
  DESKTOP_SCREENSHOT_OVERLAY_COMPLETE_CHANNEL,
  DESKTOP_SCREENSHOT_OVERLAY_GET_SNAPSHOT_CHANNEL,
  type DesktopScreenshotOverlayBridge,
  parseDesktopScreenshotOverlayCancelReason,
  parseDesktopScreenshotOverlayDisplayId,
  parseDesktopScreenshotOverlaySelectionResult,
} from './screenshotOverlayIpc.js';

const bridge: DesktopScreenshotOverlayBridge = {
  getSnapshot(displayId) {
    return ipcRenderer.invoke(
      DESKTOP_SCREENSHOT_OVERLAY_GET_SNAPSHOT_CHANNEL,
      parseDesktopScreenshotOverlayDisplayId(displayId),
    );
  },
  async completeSelection(result) {
    await ipcRenderer.invoke(
      DESKTOP_SCREENSHOT_OVERLAY_COMPLETE_CHANNEL,
      parseDesktopScreenshotOverlaySelectionResult(result),
    );
  },
  async cancel(reason) {
    await ipcRenderer.invoke(
      DESKTOP_SCREENSHOT_OVERLAY_CANCEL_CHANNEL,
      parseDesktopScreenshotOverlayCancelReason(reason),
    );
  },
};

contextBridge.exposeInMainWorld('catsScreenshotOverlay', bridge);
