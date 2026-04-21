import type {
  DesktopScreenshotCaptureResult,
} from './contracts.js';
import type {
  DesktopScreenshotDisplaySnapshot,
} from './screenshotNativeCapture.js';
import type {
  DesktopScreenshotOverlaySessionResult,
} from './screenshotOverlaySession.js';

export interface DesktopScreenshotOverlayController {
  waitForResult(): Promise<DesktopScreenshotOverlaySessionResult>;
  closeAll(): void;
}

export interface DesktopScreenshotRegionCaptureDependencies {
  captureDisplaySnapshots(): Promise<DesktopScreenshotDisplaySnapshot[]>;
  openOverlay(
    snapshots: DesktopScreenshotDisplaySnapshot[],
  ): Promise<DesktopScreenshotOverlayController>;
  createFilename(): string;
}

export async function runDesktopScreenshotRegionCapture(
  dependencies: DesktopScreenshotRegionCaptureDependencies,
): Promise<DesktopScreenshotCaptureResult> {
  const snapshots = await dependencies.captureDisplaySnapshots();
  if (snapshots.length === 0) {
    return {
      outcome: 'platform_unsupported',
      message: 'No displays are available for screenshot capture.',
    };
  }

  const overlay = await dependencies.openOverlay(snapshots);
  try {
    const result = await overlay.waitForResult();
    if (result.outcome === 'cancelled') {
      return {
        outcome: 'cancelled',
        message: result.reason,
      };
    }

    return {
      outcome: 'ok',
      png: result.region.png,
      mime: 'image/png',
      filename: dependencies.createFilename(),
      width: result.region.width,
      height: result.region.height,
    };
  } finally {
    overlay.closeAll();
  }
}
