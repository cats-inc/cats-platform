import { resolveDesktopHostBridge } from '../../../shared/desktopRecoveryBridge.js';
import type { DesktopScreenshotCaptureResult } from '../../../shared/desktopRecoveryBridge.js';

export type ScreenshotCaptureRoute = 'desktop_region' | 'web_picker' | 'unavailable';

const SCREENSHOT_PERMISSION_DENIED_ERROR_CODE = 'screenshot_permission_denied';
const SCREENSHOT_PERMISSION_NOTIFICATION_TITLE = 'Screen Recording permission required';
const SCREENSHOT_PERMISSION_DENIED_FALLBACK =
  'Screen Recording permission is required to capture a screenshot.';

const MAX_CAPTURE_WIDTH = 8000;
const MAX_CAPTURE_HEIGHT = 8000;
const MAX_CAPTURE_BYTES = 10 * 1024 * 1024;

let lastFilenameSecond = '';
let filenameCounter = 0;

function supportsWebScreenCapture(): boolean {
  return typeof navigator !== 'undefined'
    && typeof navigator.mediaDevices?.getDisplayMedia === 'function'
    && typeof document !== 'undefined';
}

function hasDesktopScreenshotCapture(): boolean {
  const bridge = resolveDesktopHostBridge();
  return bridge?.screenshotRegionCaptureAvailable === true
    && typeof bridge.captureScreenshotRegion === 'function';
}

export function resolveScreenshotCaptureRoute(): ScreenshotCaptureRoute {
  if (hasDesktopScreenshotCapture()) {
    return 'desktop_region';
  }

  if (supportsWebScreenCapture()) {
    return 'web_picker';
  }

  return 'unavailable';
}

export function resolveScreenshotCaptureTooltip(route: ScreenshotCaptureRoute): string {
  if (route === 'desktop_region') {
    return 'Capture a region of your screen';
  }

  if (route === 'web_picker') {
    return 'Capture a screen, window, or tab';
  }

  return 'Screen capture is unavailable in this environment';
}

export function isScreenshotCaptureAvailable(route: ScreenshotCaptureRoute): boolean {
  return route !== 'unavailable';
}

export function resolveScreenshotCaptureToastMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to capture screenshot.';
}

export class ScreenshotPermissionDeniedError extends Error {
  readonly code = SCREENSHOT_PERMISSION_DENIED_ERROR_CODE;

  constructor(message = SCREENSHOT_PERMISSION_DENIED_FALLBACK) {
    super(message);
    this.name = 'ScreenshotPermissionDeniedError';
  }
}

export function isScreenshotPermissionDeniedError(
  error: unknown,
): error is ScreenshotPermissionDeniedError {
  return error instanceof ScreenshotPermissionDeniedError
    || (
      typeof error === 'object'
      && error !== null
      && 'code' in error
      && (error as { code?: unknown }).code === SCREENSHOT_PERMISSION_DENIED_ERROR_CODE
    );
}

export type ScreenshotCaptureFeedback =
  | {
      surface: 'toast';
      message: string;
    }
  | {
      surface: 'notification';
      title: string;
      message: string;
      level: 'error';
    };

export function resolveScreenshotCaptureFeedback(error: unknown): ScreenshotCaptureFeedback {
  const message = resolveScreenshotCaptureToastMessage(error);
  if (isScreenshotPermissionDeniedError(error)) {
    return {
      surface: 'notification',
      title: SCREENSHOT_PERMISSION_NOTIFICATION_TITLE,
      message,
      level: 'error',
    };
  }
  return {
    surface: 'toast',
    message,
  };
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

export function createScreenshotFilename(now = new Date()): string {
  const second = [
    now.getFullYear(),
    pad(now.getMonth() + 1, 2),
    pad(now.getDate(), 2),
    '-',
    pad(now.getHours(), 2),
    pad(now.getMinutes(), 2),
    pad(now.getSeconds(), 2),
  ].join('');

  filenameCounter = second === lastFilenameSecond ? filenameCounter + 1 : 1;
  lastFilenameSecond = second;

  return `cats-screenshot-${second}-${pad(filenameCounter, 3)}.png`;
}

async function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth > 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Failed to load captured screen frame.'));
  });
}

function createCanvasForVideo(video: HTMLVideoElement): HTMLCanvasElement {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error('Captured screen frame is empty.');
  }

  const scale = Math.min(
    1,
    MAX_CAPTURE_WIDTH / sourceWidth,
    MAX_CAPTURE_HEIGHT / sourceHeight,
  );
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(sourceWidth * scale));
  canvas.height = Math.max(1, Math.floor(sourceHeight * scale));

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not prepare screenshot canvas.');
  }
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not encode screenshot.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

async function canvasToBoundedPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  let currentCanvas = canvas;
  let blob = await canvasToPngBlob(currentCanvas);

  while (blob.size > MAX_CAPTURE_BYTES && currentCanvas.width > 1 && currentCanvas.height > 1) {
    const nextCanvas = document.createElement('canvas');
    nextCanvas.width = Math.max(1, Math.floor(currentCanvas.width * 0.85));
    nextCanvas.height = Math.max(1, Math.floor(currentCanvas.height * 0.85));
    const context = nextCanvas.getContext('2d');
    if (!context) {
      throw new Error('Could not downscale screenshot.');
    }
    context.drawImage(currentCanvas, 0, 0, nextCanvas.width, nextCanvas.height);
    currentCanvas = nextCanvas;
    blob = await canvasToPngBlob(currentCanvas);
  }

  return blob;
}

export function stopMediaStreamTracks(stream: Pick<MediaStream, 'getTracks'> | null): void {
  if (!stream) {
    return;
  }
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

async function captureWebScreenshotFile(): Promise<File | null> {
  if (!supportsWebScreenCapture()) {
    throw new Error(resolveScreenshotCaptureTooltip('unavailable'));
  }

  // Must be invoked synchronously from the click handler. Do not put awaits before this call.
  const streamPromise = navigator.mediaDevices.getDisplayMedia({
    audio: false,
    video: true,
  });

  let stream: MediaStream | null = null;
  try {
    stream = await streamPromise;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await waitForVideoMetadata(video);
    await video.play();
    const canvas = createCanvasForVideo(video);
    stopMediaStreamTracks(stream);
    stream = null;
    const blob = await canvasToBoundedPngBlob(canvas);
    return new File([blob], createScreenshotFilename(), { type: 'image/png' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      return null;
    }
    throw error;
  } finally {
    stopMediaStreamTracks(stream);
  }
}

function buildDesktopScreenshotError(
  result: Exclude<DesktopScreenshotCaptureResult, { outcome: 'ok' }>,
): Error | null {
  if (result.outcome === 'cancelled') {
    switch (result.reason) {
      case 'unknown_display':
        return new Error('Screenshot failed: the selected display is no longer available.');
      case 'too_small':
      case 'user_cancel':
        return null;
      default: {
        const exhaustive: never = result.reason;
        return new Error(`Unhandled screenshot cancellation reason: ${exhaustive as string}`);
      }
    }
  }

  if (result.outcome === 'permission_denied') {
    return new ScreenshotPermissionDeniedError(result.message);
  }

  if (result.message) {
    return new Error(result.message);
  }

  if (result.outcome === 'platform_unsupported') {
    return new Error('Region screenshot capture is unavailable on this desktop environment.');
  }

  return new Error('Failed to capture screenshot.');
}

function copyBytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function captureDesktopScreenshotFile(): Promise<File | null> {
  const capture = resolveDesktopHostBridge()?.captureScreenshotRegion;
  if (!capture) {
    throw new Error(resolveScreenshotCaptureTooltip('unavailable'));
  }

  const result = await capture();
  if (result.outcome !== 'ok') {
    const error = buildDesktopScreenshotError(result);
    if (!error) {
      return null;
    }
    throw error;
  }

  return new File(
    [copyBytesToArrayBuffer(result.png)],
    result.filename || createScreenshotFilename(),
    { type: result.mime },
  );
}

export async function captureScreenshotFile(
  route: ScreenshotCaptureRoute = resolveScreenshotCaptureRoute(),
): Promise<File | null> {
  if (route === 'desktop_region') {
    return await captureDesktopScreenshotFile();
  }

  if (route === 'web_picker') {
    return await captureWebScreenshotFile();
  }

  throw new Error(resolveScreenshotCaptureTooltip(route));
}
