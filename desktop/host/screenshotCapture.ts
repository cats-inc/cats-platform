import type { BrowserWindow } from 'electron';

import {
  DESKTOP_SCREENSHOT_CAPTURE_SOURCES,
  type DesktopScreenshotCaptureRequest,
  type DesktopScreenshotCaptureResult,
} from './contracts.js';

export const DESKTOP_SCREENSHOT_IPC_CHANNEL = 'cats-host:capture-screenshot-region';
const DESKTOP_SCREENSHOT_UNSUPPORTED_MESSAGE =
  'Native region screenshot capture is not implemented in this desktop build yet.';

const DESKTOP_SCREENSHOT_CAPTURE_SOURCE_SET = new Set<string>(
  DESKTOP_SCREENSHOT_CAPTURE_SOURCES,
);

export function parseDesktopScreenshotCaptureRequest(
  value: unknown,
): DesktopScreenshotCaptureRequest {
  if (
    typeof value !== 'object'
    || value === null
    || !DESKTOP_SCREENSHOT_CAPTURE_SOURCE_SET.has(
      (value as { source?: unknown }).source as string,
    )
  ) {
    throw new Error('Invalid desktop screenshot capture request payload.');
  }

  return {
    source: (value as { source: DesktopScreenshotCaptureRequest['source'] }).source,
  };
}

export function isMainWindowScreenshotIpcSender(
  event: unknown,
  mainWindow: Pick<BrowserWindow, 'webContents'> | null,
): boolean {
  if (!mainWindow) {
    return false;
  }

  return (event as { sender?: unknown }).sender === mainWindow.webContents;
}

export function assertMainWindowScreenshotIpcSender(
  event: unknown,
  mainWindow: Pick<BrowserWindow, 'webContents'> | null,
): void {
  if (!isMainWindowScreenshotIpcSender(event, mainWindow)) {
    throw new Error('Desktop screenshot capture is only available to the main Cats window.');
  }
}

export async function captureScreenshotRegion(
  _request: DesktopScreenshotCaptureRequest,
): Promise<DesktopScreenshotCaptureResult> {
  return {
    outcome: 'platform_unsupported',
    message: DESKTOP_SCREENSHOT_UNSUPPORTED_MESSAGE,
  };
}
