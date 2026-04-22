import assert from 'node:assert/strict';
import test from 'node:test';

import {
  registerDesktopScreenshotOverlayEscapeShortcut,
} from '../build/desktop/screenshotOverlayEscapeShortcut.js';

test('desktop screenshot overlay escape shortcut registers and unregisters Escape', () => {
  const events = [];
  let callback = null;

  const unregister = registerDesktopScreenshotOverlayEscapeShortcut(
    {
      register(accelerator, nextCallback) {
        events.push(`register:${accelerator}`);
        callback = nextCallback;
        return true;
      },
      unregister(accelerator) {
        events.push(`unregister:${accelerator}`);
        callback = null;
      },
    },
    () => {
      events.push('escape');
    },
  );

  callback();
  unregister();
  unregister();

  assert.deepEqual(events, [
    'register:Escape',
    'escape',
    'unregister:Escape',
  ]);
  assert.equal(callback, null);
});

test('desktop screenshot overlay escape shortcut tolerates registration failure', () => {
  const events = [];

  const unregister = registerDesktopScreenshotOverlayEscapeShortcut(
    {
      register(accelerator) {
        events.push(`register:${accelerator}`);
        return false;
      },
      unregister(accelerator) {
        events.push(`unregister:${accelerator}`);
      },
    },
    () => {
      events.push('escape');
    },
  );

  unregister();

  assert.deepEqual(events, [
    'register:Escape',
  ]);
});
