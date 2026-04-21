import type { BrowserWindow } from 'electron';

import {
  DESKTOP_SCREENSHOT_CAPTURE_SOURCES,
  type DesktopScreenshotCaptureRequest,
  type DesktopScreenshotCaptureResult,
} from './contracts.js';

export const DESKTOP_SCREENSHOT_IPC_CHANNEL = 'cats-host:capture-screenshot-region';
const DESKTOP_SCREENSHOT_UNSUPPORTED_MESSAGE =
  'Native region screenshot capture is not implemented in this desktop build yet.';
const DEFAULT_COMPOSITOR_WAIT_MS = 120;

export interface DesktopScreenshotMainWindow extends Pick<BrowserWindow, 'webContents'> {
  hide(): void;
  show(): void;
  isMinimized(): boolean;
  restore(): void;
  focus(): void;
  isFocused?: () => boolean;
  isMaximized?: () => boolean;
  maximize?: () => void;
  minimize?: () => void;
}

export interface DesktopScreenshotWindowState {
  wasFocused: boolean;
  wasMaximized: boolean;
  wasMinimized: boolean;
}

export interface CaptureScreenshotRegionOptions {
  request: DesktopScreenshotCaptureRequest;
  mainWindow: DesktopScreenshotMainWindow;
  waitForHiddenFrame?: () => Promise<void>;
  captureNativeRegion?: (
    request: DesktopScreenshotCaptureRequest,
  ) => Promise<DesktopScreenshotCaptureResult>;
}

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
  mainWindow: Pick<DesktopScreenshotMainWindow, 'webContents'> | null,
): boolean {
  if (!mainWindow) {
    return false;
  }

  return (event as { sender?: unknown }).sender === mainWindow.webContents;
}

export function assertMainWindowScreenshotIpcSender(
  event: unknown,
  mainWindow: DesktopScreenshotMainWindow | null,
): asserts mainWindow is DesktopScreenshotMainWindow {
  if (!isMainWindowScreenshotIpcSender(event, mainWindow)) {
    throw new Error('Desktop screenshot capture is only available to the main Cats window.');
  }
}

export function captureDesktopScreenshotWindowState(
  mainWindow: DesktopScreenshotMainWindow,
): DesktopScreenshotWindowState {
  return {
    wasFocused: mainWindow.isFocused?.() ?? true,
    wasMaximized: mainWindow.isMaximized?.() ?? false,
    wasMinimized: mainWindow.isMinimized(),
  };
}

export function restoreDesktopScreenshotMainWindow(
  mainWindow: DesktopScreenshotMainWindow,
  state: DesktopScreenshotWindowState,
): void {
  mainWindow.show();

  if (state.wasMinimized) {
    mainWindow.minimize?.();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  if (state.wasMaximized) {
    mainWindow.maximize?.();
  }
  if (state.wasFocused) {
    mainWindow.focus();
  }
}

export async function waitForDesktopScreenshotCompositorFrame(
  waitMs = DEFAULT_COMPOSITOR_WAIT_MS,
): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, waitMs);
  });
}

export async function runWithMainWindowHiddenForScreenshot<T>(
  mainWindow: DesktopScreenshotMainWindow,
  action: () => Promise<T>,
  waitForHiddenFrame: () => Promise<void> = waitForDesktopScreenshotCompositorFrame,
): Promise<T> {
  const previousState = captureDesktopScreenshotWindowState(mainWindow);
  mainWindow.hide();
  try {
    await waitForHiddenFrame();
    return await action();
  } finally {
    restoreDesktopScreenshotMainWindow(mainWindow, previousState);
  }
}

export async function captureScreenshotRegion(
  options: CaptureScreenshotRegionOptions,
): Promise<DesktopScreenshotCaptureResult> {
  return await runWithMainWindowHiddenForScreenshot(
    options.mainWindow,
    () => options.captureNativeRegion
      ? options.captureNativeRegion(options.request)
      : Promise.resolve({
          outcome: 'platform_unsupported',
          message: DESKTOP_SCREENSHOT_UNSUPPORTED_MESSAGE,
        }),
    options.waitForHiddenFrame,
  );
}
