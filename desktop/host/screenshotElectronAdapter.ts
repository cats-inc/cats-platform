import { desktopCapturer, nativeImage, screen } from 'electron';

import type {
  DesktopScreenshotCaptureDependencies,
  DesktopScreenshotCropDependencies,
} from './screenshotNativeCapture.js';
import type {
  DesktopScreenshotPhysicalRect,
} from './screenshotGeometry.js';

function cropNativePng(
  sourcePng: Uint8Array,
  cropRect: DesktopScreenshotPhysicalRect,
): Uint8Array {
  return nativeImage
    .createFromBuffer(Buffer.from(sourcePng))
    .crop(cropRect)
    .toPNG();
}

export function createElectronScreenshotCaptureDependencies():
  DesktopScreenshotCaptureDependencies {
  return {
    getAllDisplays() {
      return screen.getAllDisplays().map((display) => ({
        id: display.id,
        bounds: display.bounds,
        workArea: display.workArea,
        scaleFactor: display.scaleFactor,
      }));
    },
    cropPng: cropNativePng,
    async getScreenSources(options) {
      return await desktopCapturer.getSources(options);
    },
  };
}

export function resolveElectronScreenshotWorkAreas(): DesktopScreenshotPhysicalRect[] {
  return screen.getAllDisplays().map((display) => display.workArea ?? display.bounds);
}

export function createElectronScreenshotCropDependencies(): DesktopScreenshotCropDependencies {
  return {
    cropPng: cropNativePng,
    resizePng(sourcePng, size) {
      return nativeImage
        .createFromBuffer(Buffer.from(sourcePng))
        .resize(size)
        .toPNG();
    },
  };
}
