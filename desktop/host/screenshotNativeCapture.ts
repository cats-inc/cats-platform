import type {
  DesktopScreenshotCssRect,
  DesktopScreenshotDisplayGeometry,
  DesktopScreenshotPhysicalRect,
} from './screenshotGeometry.js';
import {
  isPhysicalCropRectLargeEnough,
  mapCssSelectionToPhysicalCropRect,
} from './screenshotGeometry.js';

export interface DesktopScreenshotNativeDisplay {
  id: number;
  bounds: DesktopScreenshotDisplayGeometry['bounds'];
  scaleFactor: number;
}

export interface DesktopScreenshotNativeImage {
  getSize(): DesktopScreenshotDisplayGeometry['imageSize'];
  toPNG(): Uint8Array;
}

export interface DesktopScreenshotNativeSource {
  id: string;
  display_id?: string;
  name: string;
  thumbnail: DesktopScreenshotNativeImage;
}

export interface DesktopScreenshotCaptureDependencies {
  getAllDisplays(): DesktopScreenshotNativeDisplay[];
  getScreenSources(options: {
    types: ['screen'];
    thumbnailSize: {
      width: number;
      height: number;
    };
    fetchWindowIcons: false;
  }): Promise<DesktopScreenshotNativeSource[]>;
}

export const DESKTOP_SCREENSHOT_MAX_WIDTH = 8000;
export const DESKTOP_SCREENSHOT_MAX_HEIGHT = 8000;
export const DESKTOP_SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024;

export interface DesktopScreenshotDisplaySnapshot {
  displayId: number;
  sourceId: string;
  sourceName: string;
  geometry: DesktopScreenshotDisplayGeometry;
  png: Uint8Array;
}

export interface DesktopScreenshotCropDependencies {
  cropPng(sourcePng: Uint8Array, cropRect: DesktopScreenshotPhysicalRect): Uint8Array;
  resizePng(
    sourcePng: Uint8Array,
    size: { width: number; height: number },
  ): Uint8Array;
}

export interface DesktopScreenshotCroppedRegion {
  displayId: number;
  sourceId: string;
  width: number;
  height: number;
  cropRect: DesktopScreenshotPhysicalRect;
  png: Uint8Array;
}

export function resolveBoundedDesktopScreenshotSize(input: {
  width: number;
  height: number;
}): { width: number; height: number } {
  const scale = Math.min(
    1,
    DESKTOP_SCREENSHOT_MAX_WIDTH / input.width,
    DESKTOP_SCREENSHOT_MAX_HEIGHT / input.height,
  );

  return {
    width: Math.max(1, Math.floor(input.width * scale)),
    height: Math.max(1, Math.floor(input.height * scale)),
  };
}

function resizeDesktopScreenshotPng(
  region: Pick<DesktopScreenshotCroppedRegion, 'png' | 'width' | 'height'>,
  dependencies: DesktopScreenshotCropDependencies,
): Pick<DesktopScreenshotCroppedRegion, 'png' | 'width' | 'height'> {
  const boundedSize = resolveBoundedDesktopScreenshotSize(region);
  let current = boundedSize.width === region.width && boundedSize.height === region.height
    ? region
    : {
        ...boundedSize,
        png: dependencies.resizePng(region.png, boundedSize),
      };

  while (
    current.png.byteLength > DESKTOP_SCREENSHOT_MAX_BYTES
    && current.width > 1
    && current.height > 1
  ) {
    const nextSize = {
      width: Math.max(1, Math.floor(current.width * 0.85)),
      height: Math.max(1, Math.floor(current.height * 0.85)),
    };
    current = {
      ...nextSize,
      png: dependencies.resizePng(current.png, nextSize),
    };
  }

  return current;
}

export function resolveDesktopCaptureThumbnailSize(
  displays: DesktopScreenshotNativeDisplay[],
): { width: number; height: number } {
  return displays.reduce(
    (largest, display) => ({
      width: Math.max(
        largest.width,
        Math.ceil(display.bounds.width * display.scaleFactor),
      ),
      height: Math.max(
        largest.height,
        Math.ceil(display.bounds.height * display.scaleFactor),
      ),
    }),
    { width: 1, height: 1 },
  );
}

export function matchDesktopSourceForDisplay(
  display: DesktopScreenshotNativeDisplay,
  sources: DesktopScreenshotNativeSource[],
): DesktopScreenshotNativeSource | null {
  const displayId = String(display.id);
  return sources.find((source) => source.display_id === displayId)
    ?? (sources.length === 1 ? sources[0]! : null);
}

export async function captureDesktopDisplaySnapshots(
  dependencies: DesktopScreenshotCaptureDependencies,
): Promise<DesktopScreenshotDisplaySnapshot[]> {
  const displays = dependencies.getAllDisplays();
  if (displays.length === 0) {
    return [];
  }

  const sources = await dependencies.getScreenSources({
    types: ['screen'],
    thumbnailSize: resolveDesktopCaptureThumbnailSize(displays),
    fetchWindowIcons: false,
  });

  return displays.flatMap((display) => {
    const source = matchDesktopSourceForDisplay(display, sources);
    if (!source) {
      return [];
    }
    return [{
      displayId: display.id,
      sourceId: source.id,
      sourceName: source.name,
      geometry: {
        bounds: display.bounds,
        imageSize: source.thumbnail.getSize(),
        scaleFactor: display.scaleFactor,
      },
      png: source.thumbnail.toPNG(),
    }];
  });
}

export function cropDesktopDisplaySnapshotSelection(
  snapshot: DesktopScreenshotDisplaySnapshot,
  selection: DesktopScreenshotCssRect,
  dependencies: DesktopScreenshotCropDependencies,
): DesktopScreenshotCroppedRegion | null {
  const cropRect = mapCssSelectionToPhysicalCropRect(selection, snapshot.geometry);
  if (!isPhysicalCropRectLargeEnough(cropRect)) {
    return null;
  }
  const cropped = dependencies.cropPng(snapshot.png, cropRect);
  const bounded = resizeDesktopScreenshotPng({
    width: cropRect.width,
    height: cropRect.height,
    png: cropped,
  }, dependencies);

  return {
    displayId: snapshot.displayId,
    sourceId: snapshot.sourceId,
    width: bounded.width,
    height: bounded.height,
    cropRect,
    png: bounded.png,
  };
}
