import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDesktopScreenshotFilename,
} from '../build/desktop/screenshotFilename.js';

test('desktop screenshot host filenames remain unique within the same second', () => {
  const now = new Date(2026, 3, 22, 1, 2, 3, 456);

  assert.equal(
    createDesktopScreenshotFilename(now),
    'cats-screenshot-20260422-010203-001.png',
  );
  assert.equal(
    createDesktopScreenshotFilename(now),
    'cats-screenshot-20260422-010203-002.png',
  );
});
