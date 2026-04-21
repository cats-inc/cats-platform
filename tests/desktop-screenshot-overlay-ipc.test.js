import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DESKTOP_SCREENSHOT_OVERLAY_CANCEL_CHANNEL,
  DESKTOP_SCREENSHOT_OVERLAY_COMPLETE_CHANNEL,
  DESKTOP_SCREENSHOT_OVERLAY_GET_SNAPSHOT_CHANNEL,
} from '../build/desktop/screenshotOverlayIpc.js';

test('desktop screenshot overlay IPC uses dedicated channels', () => {
  assert.equal(
    DESKTOP_SCREENSHOT_OVERLAY_GET_SNAPSHOT_CHANNEL,
    'cats-host:screenshot-overlay:get-snapshot',
  );
  assert.equal(
    DESKTOP_SCREENSHOT_OVERLAY_COMPLETE_CHANNEL,
    'cats-host:screenshot-overlay:complete-selection',
  );
  assert.equal(
    DESKTOP_SCREENSHOT_OVERLAY_CANCEL_CHANNEL,
    'cats-host:screenshot-overlay:cancel',
  );
});
