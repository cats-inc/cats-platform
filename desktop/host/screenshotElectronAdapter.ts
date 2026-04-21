import { desktopCapturer, nativeImage, screen } from 'electron';

import type {
  DesktopScreenshotCaptureDependencies,
  DesktopScreenshotCropDependencies,
} from './screenshotNativeCapture.js';

export function createElectronScreenshotCaptureDependencies(): DesktopScreenshotCaptureDependencies {
  return {
    getAllDisplays() {
      return screen.getAllDisplays().map((display) => ({
        id: display.id,
        bounds: display.bounds,
        scaleFactor: display.scaleFactor,
      }));
    },
    async getScreenSources(options) {
      return await desktopCapturer.getSources(options);
    },
  };
}

export function createElectronScreenshotCropDependencies(): DesktopScreenshotCropDependencies {
  return {
    cropPng(sourcePng, cropRect) {
      return nativeImage
        .createFromBuffer(Buffer.from(sourcePng))
        .crop(cropRect)
        .toPNG();
    },
  };
}
