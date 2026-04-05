import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyDesktopWindowChrome,
  resolveDesktopWindowChromeOptions,
} from '../build/desktop/windowChrome.js';

test('desktop window chrome hides the native menu bar on Windows', () => {
  assert.deepEqual(resolveDesktopWindowChromeOptions('win32'), {
    autoHideMenuBar: true,
  });

  const calls = [];
  applyDesktopWindowChrome({
    setMenuBarVisibility(visible) {
      calls.push(['setMenuBarVisibility', visible]);
    },
    setAutoHideMenuBar(hide) {
      calls.push(['setAutoHideMenuBar', hide]);
    },
  }, 'win32');

  assert.deepEqual(calls, [
    ['setAutoHideMenuBar', true],
    ['setMenuBarVisibility', false],
  ]);
});

test('desktop window chrome leaves the macOS app menu untouched', () => {
  assert.deepEqual(resolveDesktopWindowChromeOptions('darwin'), {});

  const calls = [];
  applyDesktopWindowChrome({
    setMenuBarVisibility(visible) {
      calls.push(['setMenuBarVisibility', visible]);
    },
    setAutoHideMenuBar(hide) {
      calls.push(['setAutoHideMenuBar', hide]);
    },
  }, 'darwin');

  assert.deepEqual(calls, []);
});

