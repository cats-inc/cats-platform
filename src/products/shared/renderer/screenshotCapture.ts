import { resolveDesktopHostBridge } from '../../../shared/desktopRecoveryBridge.js';
import type { DesktopScreenshotCaptureResult } from '../../../shared/desktopRecoveryBridge.js';
import {
  createTranslator,
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../shared/i18n/index.js';

export type ScreenshotCaptureRoute = 'desktop_region' | 'web_picker' | 'unavailable';

const SCREENSHOT_PERMISSION_DENIED_ERROR_CODE = 'screenshot_permission_denied';
type ScreenshotCaptureI18n = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const defaultScreenshotCaptureI18n = createTranslator('en');

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

export function resolveScreenshotCaptureTooltip(
  route: ScreenshotCaptureRoute,
  t: ScreenshotCaptureI18n = defaultScreenshotCaptureI18n,
): string {
  if (route === 'desktop_region') {
    return t(messageKeys.sharedScreenshotCaptureTooltipDesktopRegion);
  }

  if (route === 'web_picker') {
    return t(messageKeys.sharedScreenshotCaptureTooltipWebPicker);
  }

  return t(messageKeys.sharedScreenshotCaptureTooltipUnavailable);
}

export function isScreenshotCaptureAvailable(route: ScreenshotCaptureRoute): boolean {
  return route !== 'unavailable';
}

export function resolveScreenshotCaptureToastMessage(
  error: unknown,
  t: ScreenshotCaptureI18n = defaultScreenshotCaptureI18n,
): string {
  return error instanceof Error ? error.message : t(messageKeys.sharedScreenshotCaptureFailed);
}

export class ScreenshotPermissionDeniedError extends Error {
  readonly code = SCREENSHOT_PERMISSION_DENIED_ERROR_CODE;

  constructor(message = defaultScreenshotCaptureI18n(
    messageKeys.sharedScreenshotCapturePermissionRequired,
  )) {
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

export interface ScreenshotCaptureFeedback {
  surface: 'toast';
  message: string;
}

export function resolveScreenshotCaptureFeedback(
  error: unknown,
  t: ScreenshotCaptureI18n = defaultScreenshotCaptureI18n,
): ScreenshotCaptureFeedback {
  return {
    surface: 'toast',
    message: resolveScreenshotCaptureToastMessage(error, t),
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

async function waitForVideoMetadata(
  video: HTMLVideoElement,
  t: ScreenshotCaptureI18n,
): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth > 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error(
      t(messageKeys.sharedScreenshotCaptureFrameLoadFailed),
    ));
  });
}

function createCanvasForVideo(
  video: HTMLVideoElement,
  t: ScreenshotCaptureI18n,
): HTMLCanvasElement {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error(t(messageKeys.sharedScreenshotCaptureFrameEmpty));
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
    throw new Error(t(messageKeys.sharedScreenshotCaptureCanvasPrepareFailed));
  }
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function canvasToPngBlob(
  canvas: HTMLCanvasElement,
  t: ScreenshotCaptureI18n,
): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(t(messageKeys.sharedScreenshotCaptureEncodeFailed)));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

async function canvasToBoundedPngBlob(
  canvas: HTMLCanvasElement,
  t: ScreenshotCaptureI18n,
): Promise<Blob> {
  let currentCanvas = canvas;
  let blob = await canvasToPngBlob(currentCanvas, t);

  while (blob.size > MAX_CAPTURE_BYTES && currentCanvas.width > 1 && currentCanvas.height > 1) {
    const nextCanvas = document.createElement('canvas');
    nextCanvas.width = Math.max(1, Math.floor(currentCanvas.width * 0.85));
    nextCanvas.height = Math.max(1, Math.floor(currentCanvas.height * 0.85));
    const context = nextCanvas.getContext('2d');
    if (!context) {
      throw new Error(t(messageKeys.sharedScreenshotCaptureDownscaleFailed));
    }
    context.drawImage(currentCanvas, 0, 0, nextCanvas.width, nextCanvas.height);
    currentCanvas = nextCanvas;
    blob = await canvasToPngBlob(currentCanvas, t);
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

async function captureWebScreenshotFile(
  t: ScreenshotCaptureI18n = defaultScreenshotCaptureI18n,
): Promise<File | null> {
  if (!supportsWebScreenCapture()) {
    throw new Error(resolveScreenshotCaptureTooltip('unavailable', t));
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
    await waitForVideoMetadata(video, t);
    await video.play();
    const canvas = createCanvasForVideo(video, t);
    stopMediaStreamTracks(stream);
    stream = null;
    const blob = await canvasToBoundedPngBlob(canvas, t);
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
  t: ScreenshotCaptureI18n,
): Error | null {
  if (result.outcome === 'cancelled') {
    switch (result.reason) {
      case 'unknown_display':
        return new Error(t(messageKeys.sharedScreenshotCaptureDisplayUnavailable));
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
    return new Error(t(messageKeys.sharedScreenshotCaptureRegionUnsupported));
  }

  return new Error(t(messageKeys.sharedScreenshotCaptureFailed));
}

function copyBytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function captureDesktopScreenshotFile(
  t: ScreenshotCaptureI18n = defaultScreenshotCaptureI18n,
): Promise<File | null> {
  const capture = resolveDesktopHostBridge()?.captureScreenshotRegion;
  if (!capture) {
    throw new Error(resolveScreenshotCaptureTooltip('unavailable', t));
  }

  const result = await capture();
  if (result.outcome !== 'ok') {
    const error = buildDesktopScreenshotError(result, t);
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
  t: ScreenshotCaptureI18n = defaultScreenshotCaptureI18n,
): Promise<File | null> {
  if (route === 'desktop_region') {
    return await captureDesktopScreenshotFile(t);
  }

  if (route === 'web_picker') {
    return await captureWebScreenshotFile(t);
  }

  throw new Error(resolveScreenshotCaptureTooltip(route, t));
}
