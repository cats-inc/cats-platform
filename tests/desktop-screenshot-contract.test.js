import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DESKTOP_SCREENSHOT_CANCEL_REASONS as HOST_DESKTOP_SCREENSHOT_CANCEL_REASONS,
  DESKTOP_SCREENSHOT_CAPTURE_OUTCOMES,
  DESKTOP_SCREENSHOT_CAPTURE_SOURCES,
} from '../build/desktop/contracts.js';
import {
  captureScreenshotRegion,
  DESKTOP_SCREENSHOT_IPC_CHANNEL,
  isMainWindowScreenshotIpcSender,
  parseDesktopScreenshotCaptureRequest,
  runWithMainWindowHiddenForScreenshot,
} from '../build/desktop/screenshotCapture.js';
import {
  DESKTOP_SCREENSHOT_CANCEL_REASONS as RENDERER_DESKTOP_SCREENSHOT_CANCEL_REASONS,
} from '../build/server/shared/desktopRecoveryBridge.js';

const UNSUPPORTED_MESSAGE =
  'Native region screenshot capture is not implemented in this desktop build yet.';

test('desktop screenshot contract exposes composer capture request and explicit outcomes', () => {
  assert.equal(DESKTOP_SCREENSHOT_IPC_CHANNEL, 'cats-host:capture-screenshot-region');
  assert.deepEqual(DESKTOP_SCREENSHOT_CAPTURE_SOURCES, ['composer']);
  assert.deepEqual(DESKTOP_SCREENSHOT_CAPTURE_OUTCOMES, [
    'ok',
    'cancelled',
    'permission_denied',
    'platform_unsupported',
    'error',
  ]);
  assert.deepEqual(HOST_DESKTOP_SCREENSHOT_CANCEL_REASONS, [
    'user_cancel',
    'too_small',
    'unknown_display',
  ]);
  assert.deepEqual(
    RENDERER_DESKTOP_SCREENSHOT_CANCEL_REASONS,
    HOST_DESKTOP_SCREENSHOT_CANCEL_REASONS,
  );
  assert.deepEqual(
    parseDesktopScreenshotCaptureRequest({ source: 'composer' }),
    { source: 'composer' },
  );
  assert.throws(
    () => parseDesktopScreenshotCaptureRequest({ source: 'overlay' }),
    /Invalid desktop screenshot capture request/u,
  );
});

test('desktop screenshot IPC sender validation only accepts the main window webContents', () => {
  const mainWebContents = {};
  const mainWindow = { webContents: mainWebContents };

  assert.equal(
    isMainWindowScreenshotIpcSender({ sender: mainWebContents }, mainWindow),
    true,
  );
  assert.equal(
    isMainWindowScreenshotIpcSender({ sender: {} }, mainWindow),
    false,
  );
  assert.equal(
    isMainWindowScreenshotIpcSender({ sender: mainWebContents }, null),
    false,
  );
});

test('desktop screenshot bridge returns explicit unsupported before native capture lands', async () => {
  const events = [];
  const mainWindow = createFakeMainWindow(events);

  assert.deepEqual(
    await captureScreenshotRegion({
      request: { source: 'composer' },
      mainWindow,
      waitForHiddenFrame: async () => {
        events.push('wait');
      },
    }),
    {
      outcome: 'platform_unsupported',
      message: UNSUPPORTED_MESSAGE,
    },
  );
  assert.deepEqual(events, ['hide', 'wait', 'show', 'focus']);
});

test('desktop screenshot lifecycle restores the main window after capture errors', async () => {
  const events = [];
  const mainWindow = createFakeMainWindow(events);

  await assert.rejects(
    () => runWithMainWindowHiddenForScreenshot(
      mainWindow,
      async () => {
        events.push('capture');
        throw new Error('capture failed');
      },
      async () => {
        events.push('wait');
      },
    ),
    /capture failed/u,
  );

  assert.deepEqual(events, ['hide', 'wait', 'capture', 'show', 'focus']);
});

function createFakeMainWindow(events) {
  return {
    webContents: {},
    hide() {
      events.push('hide');
    },
    show() {
      events.push('show');
    },
    isMinimized() {
      return false;
    },
    restore() {
      events.push('restore');
    },
    focus() {
      events.push('focus');
    },
    isFocused() {
      return true;
    },
    isMaximized() {
      return false;
    },
    maximize() {
      events.push('maximize');
    },
    minimize() {
      events.push('minimize');
    },
  };
}
