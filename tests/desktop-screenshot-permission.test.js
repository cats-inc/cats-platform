import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveDesktopScreenshotPermissionResult,
} from '../build/desktop/screenshotPermission.js';

test('desktop screenshot permission allows non-mac platforms', () => {
  assert.equal(
    resolveDesktopScreenshotPermissionResult({
      platform: 'win32',
      mediaAccessStatus: 'denied',
    }),
    null,
  );
});

test('desktop screenshot permission allows granted macOS screen access', () => {
  assert.equal(
    resolveDesktopScreenshotPermissionResult({
      platform: 'darwin',
      mediaAccessStatus: 'granted',
    }),
    null,
  );
});

test('desktop screenshot permission allows first macOS screen access attempt', () => {
  assert.equal(
    resolveDesktopScreenshotPermissionResult({
      platform: 'darwin',
      mediaAccessStatus: 'not-determined',
    }),
    null,
  );
});

test('desktop screenshot permission maps denied macOS screen access to contract outcome', () => {
  assert.deepEqual(
    resolveDesktopScreenshotPermissionResult({
      platform: 'darwin',
      mediaAccessStatus: 'denied',
    }),
    {
      outcome: 'permission_denied',
      message: 'Screen Recording permission is required to capture a screenshot. Grant Cats screen access in macOS System Settings, then restart Cats.',
    },
  );
});

test('desktop screenshot permission maps unknown macOS status to explicit error', () => {
  assert.deepEqual(
    resolveDesktopScreenshotPermissionResult({
      platform: 'darwin',
      mediaAccessStatus: 'unknown',
    }),
    {
      outcome: 'error',
      message: 'Screen Recording permission status is unknown: unknown',
    },
  );
});
