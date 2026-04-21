import assert from 'node:assert/strict';
import test from 'node:test';

import {
  openScreenshotOverlayWindows,
} from '../build/desktop/screenshotOverlayController.js';

function createPlan(id) {
  return {
    displayId: id,
    sourceId: `screen:${id}:0`,
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    url: `file:///overlay.html?displayId=${id}`,
    alwaysOnTop: { enabled: true, level: 'screen-saver' },
    options: {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      frame: false,
      transparent: true,
      resizable: false,
      hasShadow: false,
      skipTaskbar: true,
      fullscreenable: false,
      webPreferences: {
        preload: 'overlay-preload.cjs',
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    },
  };
}

test('desktop screenshot overlay controller opens and closes planned windows', async () => {
  const events = [];
  const controller = await openScreenshotOverlayWindows(
    [createPlan(1), createPlan(2)],
    {
      createWindow(options) {
        const id = events.filter((event) => event.startsWith('create')).length + 1;
        events.push(`create:${id}:${options.width}x${options.height}`);
        let destroyed = false;
        return {
          setAlwaysOnTop(enabled, level) {
            events.push(`top:${id}:${enabled}:${level}`);
          },
          async loadURL(url) {
            events.push(`url:${id}:${url}`);
          },
          close() {
            destroyed = true;
            events.push(`close:${id}`);
          },
          isDestroyed() {
            return destroyed;
          },
        };
      },
    },
  );

  controller.closeAll();
  controller.closeAll();

  assert.deepEqual(events, [
    'create:1:100x100',
    'top:1:true:screen-saver',
    'url:1:file:///overlay.html?displayId=1',
    'create:2:100x100',
    'top:2:true:screen-saver',
    'url:2:file:///overlay.html?displayId=2',
    'close:1',
    'close:2',
  ]);
});

test('desktop screenshot overlay controller closes already-opened windows on load failure', async () => {
  const events = [];

  await assert.rejects(
    () => openScreenshotOverlayWindows(
      [createPlan(1), createPlan(2)],
      {
        createWindow() {
          const id = events.filter((event) => event.startsWith('create')).length + 1;
          events.push(`create:${id}`);
          return {
            setAlwaysOnTop() {
              events.push(`top:${id}`);
            },
            async loadURL() {
              events.push(`url:${id}`);
              if (id === 2) {
                throw new Error('load failed');
              }
            },
            close() {
              events.push(`close:${id}`);
            },
            isDestroyed() {
              return false;
            },
          };
        },
      },
    ),
    /load failed/u,
  );

  assert.deepEqual(events, [
    'create:1',
    'top:1',
    'url:1',
    'create:2',
    'top:2',
    'url:2',
    'close:1',
    'close:2',
  ]);
});
