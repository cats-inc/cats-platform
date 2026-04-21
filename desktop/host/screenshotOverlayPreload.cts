import { contextBridge, ipcRenderer } from 'electron';

import {
  DESKTOP_SCREENSHOT_OVERLAY_CANCEL_CHANNEL,
  DESKTOP_SCREENSHOT_OVERLAY_COMPLETE_CHANNEL,
  DESKTOP_SCREENSHOT_OVERLAY_GET_SNAPSHOT_CHANNEL,
  type DesktopScreenshotOverlayBridge,
  type DesktopScreenshotOverlaySelectionResult,
} from './screenshotOverlayIpc.js';

function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid screenshot overlay ${label}: ${String(value)}`);
  }
  return value;
}

function assertRect(
  value: unknown,
  label: string,
): DesktopScreenshotOverlaySelectionResult['cssRect'] {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Invalid screenshot overlay ${label} rect.`);
  }
  const rect = value as Record<string, unknown>;
  return {
    x: assertFiniteNumber(rect.x, `${label}.x`),
    y: assertFiniteNumber(rect.y, `${label}.y`),
    width: assertFiniteNumber(rect.width, `${label}.width`),
    height: assertFiniteNumber(rect.height, `${label}.height`),
  };
}

function assertSelectionResult(value: unknown): DesktopScreenshotOverlaySelectionResult {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid screenshot overlay selection result.');
  }
  const result = value as Record<string, unknown>;
  return {
    displayId: assertFiniteNumber(result.displayId, 'displayId'),
    cssRect: assertRect(result.cssRect, 'cssRect'),
    cropRect: assertRect(result.cropRect, 'cropRect'),
  };
}

const bridge: DesktopScreenshotOverlayBridge = {
  getSnapshot() {
    return ipcRenderer.invoke(DESKTOP_SCREENSHOT_OVERLAY_GET_SNAPSHOT_CHANNEL);
  },
  async completeSelection(result) {
    await ipcRenderer.invoke(
      DESKTOP_SCREENSHOT_OVERLAY_COMPLETE_CHANNEL,
      assertSelectionResult(result),
    );
  },
  async cancel(reason) {
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      throw new Error('Invalid screenshot overlay cancellation reason.');
    }
    await ipcRenderer.invoke(DESKTOP_SCREENSHOT_OVERLAY_CANCEL_CHANNEL, reason);
  },
};

contextBridge.exposeInMainWorld('catsScreenshotOverlay', bridge);
