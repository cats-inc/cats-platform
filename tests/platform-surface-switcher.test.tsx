import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getPendingPlatformSurfaceMenuStyle,
  resolvePlatformSurfaceMenuStyle,
  resolvePlatformSurfaceMenuWidth,
} from '../src/design/components/platformSurfaceMenuPosition.ts';
import {
  runAfterClosingPlatformSurfaceMenu,
} from '../src/design/components/PlatformSurfaceSwitcher.tsx';

test('pending platform surface menu style stays fixed and hidden before measurement', () => {
  assert.deepEqual(getPendingPlatformSurfaceMenuStyle(), {
    position: 'fixed',
    top: 0,
    left: 0,
    width: 'min(420px, calc(100vw - 24px))',
    visibility: 'hidden',
    pointerEvents: 'none',
  });
});

test('platform surface menu positioning keeps the popup inside the viewport', () => {
  assert.equal(resolvePlatformSurfaceMenuWidth(1280), 420);
  assert.equal(resolvePlatformSurfaceMenuWidth(360), 336);

  assert.deepEqual(
    resolvePlatformSurfaceMenuStyle({
      triggerRect: {
        top: 36,
        left: 18,
        bottom: 68,
      },
      viewportWidth: 1280,
      viewportHeight: 900,
      menuWidth: 420,
      menuHeight: 280,
    }),
    {
      position: 'fixed',
      top: 76,
      left: 18,
      width: 420,
    },
  );

  assert.deepEqual(
    resolvePlatformSurfaceMenuStyle({
      triggerRect: {
        top: 620,
        left: 980,
        bottom: 652,
      },
      viewportWidth: 1280,
      viewportHeight: 720,
      menuWidth: 420,
      menuHeight: 180,
    }),
    {
      position: 'fixed',
      top: 432,
      left: 848,
      width: 420,
    },
  );
});

test('runAfterClosingPlatformSurfaceMenu runs close inside the flush wrapper, then the action', () => {
  const events: string[] = [];
  const flush = (callback: () => void) => {
    events.push('flush:start');
    callback();
    events.push('flush:end');
  };

  runAfterClosingPlatformSurfaceMenu(
    () => {
      events.push('close');
    },
    () => {
      events.push('action');
    },
    flush,
  );

  // The close callback must run inside the flush wrapper, and the action
  // must wait until the flush has completed. A pure-sequential implementation
  // (close(); action();) without any flush would produce ['close', 'action']
  // and fail this assertion.
  assert.deepEqual(events, ['flush:start', 'close', 'flush:end', 'action']);
});

test('runAfterClosingPlatformSurfaceMenu lets a synchronous default flush run close before action', () => {
  // Sanity check: when caller provides no flush, the helper still runs close
  // before action. Production wires React 18's flushSync as the default.
  const events: string[] = [];
  runAfterClosingPlatformSurfaceMenu(
    () => events.push('close'),
    () => events.push('action'),
  );
  assert.deepEqual(events, ['close', 'action']);
});
