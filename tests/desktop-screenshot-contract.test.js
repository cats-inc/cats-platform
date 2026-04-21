import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DESKTOP_SCREENSHOT_CAPTURE_OUTCOMES,
  DESKTOP_SCREENSHOT_CAPTURE_SOURCES,
} from '../build/desktop/contracts.js';
import {
  captureScreenshotRegion,
  DESKTOP_SCREENSHOT_IPC_CHANNEL,
  isMainWindowScreenshotIpcSender,
  parseDesktopScreenshotCaptureRequest,
} from '../build/desktop/screenshotCapture.js';

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
  assert.deepEqual(
    await captureScreenshotRegion({ source: 'composer' }),
    {
      outcome: 'platform_unsupported',
      message: UNSUPPORTED_MESSAGE,
    },
  );
});
