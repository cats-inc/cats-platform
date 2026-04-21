import type {
  DesktopScreenshotOverlaySnapshotPayload,
} from './screenshotOverlayPayload.js';

export const DESKTOP_SCREENSHOT_OVERLAY_GET_SNAPSHOT_CHANNEL =
  'cats-host:screenshot-overlay:get-snapshot';
export const DESKTOP_SCREENSHOT_OVERLAY_COMPLETE_CHANNEL =
  'cats-host:screenshot-overlay:complete-selection';
export const DESKTOP_SCREENSHOT_OVERLAY_CANCEL_CHANNEL =
  'cats-host:screenshot-overlay:cancel';

export interface DesktopScreenshotOverlaySelectionResult {
  displayId: number;
  cssRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  cropRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface DesktopScreenshotOverlayBridge {
  getSnapshot(displayId: number): Promise<DesktopScreenshotOverlaySnapshotPayload>;
  completeSelection(result: DesktopScreenshotOverlaySelectionResult): Promise<void>;
  cancel(reason: string): Promise<void>;
}
