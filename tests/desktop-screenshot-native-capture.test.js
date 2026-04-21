import assert from 'node:assert/strict';
import test from 'node:test';

import {
  captureDesktopDisplaySnapshots,
  matchDesktopSourceForDisplay,
  resolveDesktopCaptureThumbnailSize,
} from '../build/desktop/screenshotNativeCapture.js';

function createImage(width, height, bytes) {
  return {
    getSize() {
      return { width, height };
    },
    toPNG() {
      return new Uint8Array(bytes);
    },
  };
}

test('desktop screenshot native capture plans thumbnail size from physical display pixels', () => {
  assert.deepEqual(
    resolveDesktopCaptureThumbnailSize([
      {
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        scaleFactor: 1,
      },
      {
        id: 2,
        bounds: { x: -1440, y: 0, width: 1440, height: 900 },
        scaleFactor: 2,
      },
    ]),
    { width: 2880, height: 1800 },
  );
});

test('desktop screenshot native capture matches Electron sources by display id', () => {
  const source = {
    id: 'screen:2:0',
    display_id: '2',
    name: 'Display 2',
    thumbnail: createImage(1440, 900, [2]),
  };

  assert.equal(
    matchDesktopSourceForDisplay(
      {
        id: 2,
        bounds: { x: -1440, y: 0, width: 1440, height: 900 },
        scaleFactor: 1,
      },
      [
        {
          id: 'screen:1:0',
          display_id: '1',
          name: 'Display 1',
          thumbnail: createImage(1920, 1080, [1]),
        },
        source,
      ],
    ),
    source,
  );
});

test('desktop screenshot native capture builds per-display PNG snapshots', async () => {
  const calls = [];
  const snapshots = await captureDesktopDisplaySnapshots({
    getAllDisplays() {
      return [
        {
          id: 1,
          bounds: { x: 0, y: 0, width: 1000, height: 800 },
          scaleFactor: 2,
        },
        {
          id: 2,
          bounds: { x: -1280, y: 0, width: 1280, height: 720 },
          scaleFactor: 1,
        },
      ];
    },
    async getScreenSources(options) {
      calls.push(options);
      return [
        {
          id: 'screen:1:0',
          display_id: '1',
          name: 'Built-in display',
          thumbnail: createImage(2000, 1600, [1, 2, 3]),
        },
        {
          id: 'screen:2:0',
          display_id: '2',
          name: 'Left display',
          thumbnail: createImage(1280, 720, [4, 5, 6]),
        },
      ];
    },
  });

  assert.deepEqual(calls, [
    {
      types: ['screen'],
      thumbnailSize: { width: 2000, height: 1600 },
      fetchWindowIcons: false,
    },
  ]);
  assert.equal(snapshots.length, 2);
  assert.deepEqual(snapshots[0]?.geometry, {
    bounds: { x: 0, y: 0, width: 1000, height: 800 },
    imageSize: { width: 2000, height: 1600 },
    scaleFactor: 2,
  });
  assert.deepEqual(Array.from(snapshots[1]?.png ?? []), [4, 5, 6]);
});
