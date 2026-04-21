import type {
  DesktopScreenshotDisplayGeometry,
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

export interface DesktopScreenshotDisplaySnapshot {
  displayId: number;
  sourceId: string;
  sourceName: string;
  geometry: DesktopScreenshotDisplayGeometry;
  png: Uint8Array;
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
