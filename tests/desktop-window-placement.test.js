import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  DESKTOP_MAIN_WINDOW_MIN_SIZE,
  parseDesktopWindowState,
  readDesktopWindowState,
  resolveDefaultDesktopWindowPlacement,
  resolveDesktopWindowPlacement,
  resolveRestoredDesktopWindowPlacement,
  trackDesktopWindowPlacement,
  writeDesktopWindowState,
} from '../build/desktop/windowPlacement.js';

function workArea(width, height, x = 0, y = 0) {
  return { x, y, width, height };
}

test('main window keeps a drag minimum that fits a 1080p screen at 150% scaling', () => {
  assert.deepEqual(DESKTOP_MAIN_WINDOW_MIN_SIZE, { width: 960, height: 600 });
});

test('default placement takes 85% of a roomy work area, centered', () => {
  // 1920x1080 at 100% with a 48px taskbar.
  assert.deepEqual(resolveDefaultDesktopWindowPlacement(workArea(1920, 1032)), {
    bounds: { x: 144, y: 77, width: 1632, height: 877 },
    maximized: false,
  });
});

test('default placement holds the 1280x800 floor on mid-size work areas', () => {
  // 1920x1080 at 125%: 85% would be 1306x694.
  assert.deepEqual(resolveDefaultDesktopWindowPlacement(workArea(1536, 816)), {
    bounds: { x: 115, y: 8, width: 1306, height: 800 },
    maximized: false,
  });
});

test('default placement stops at the 1680x1050 cap on large work areas', () => {
  assert.deepEqual(resolveDefaultDesktopWindowPlacement(workArea(2560, 1392)), {
    bounds: { x: 440, y: 171, width: 1680, height: 1050 },
    maximized: false,
  });
  assert.deepEqual(resolveDefaultDesktopWindowPlacement(workArea(2048, 1104)).bounds, {
    x: 184,
    y: 83,
    width: 1680,
    height: 938,
  });
});

test('default placement opens maximized when the floor does not fit, with a smaller normal size', () => {
  // 1920x1080 at 150%.
  assert.deepEqual(resolveDefaultDesktopWindowPlacement(workArea(1280, 672)), {
    bounds: { x: 96, y: 36, width: 1088, height: 600 },
    maximized: true,
  });
  // 1366x768: wide enough, too short.
  assert.deepEqual(resolveDefaultDesktopWindowPlacement(workArea(1366, 720)), {
    bounds: { x: 102, y: 54, width: 1161, height: 612 },
    maximized: true,
  });
});

test('default normal size never drops below the drag minimum or exceeds the work area', () => {
  assert.deepEqual(resolveDefaultDesktopWindowPlacement(workArea(960, 492)), {
    bounds: { x: 0, y: 0, width: 960, height: 492 },
    maximized: true,
  });
});

test('default placement is centered in an offset work area', () => {
  // A display left of the primary, under a 25px menu bar.
  assert.deepEqual(resolveDefaultDesktopWindowPlacement(workArea(1920, 1055, -1920, 25)).bounds, {
    x: -1920 + 144,
    y: 25 + 79,
    width: 1632,
    height: 897,
  });
});

test('saved placement fully inside a display is restored unchanged', () => {
  const saved = { bounds: { x: 100, y: 50, width: 1400, height: 900 }, maximized: true };
  assert.deepEqual(resolveRestoredDesktopWindowPlacement(saved, [workArea(1920, 1032)]), saved);
});

test('saved placement hanging off a display is pulled inside its work area', () => {
  const saved = { bounds: { x: 1500, y: 900, width: 1400, height: 900 }, maximized: false };
  assert.deepEqual(resolveRestoredDesktopWindowPlacement(saved, [workArea(1920, 1032)]), {
    bounds: { x: 520, y: 132, width: 1400, height: 900 },
    maximized: false,
  });
});

test('saved placement larger than the work area shrinks to fit', () => {
  const saved = { bounds: { x: 0, y: 0, width: 1680, height: 1050 }, maximized: false };
  assert.deepEqual(resolveRestoredDesktopWindowPlacement(saved, [workArea(1536, 816)]), {
    bounds: { x: 0, y: 0, width: 1536, height: 816 },
    maximized: false,
  });
});

test('saved placement lands on the display it overlaps most', () => {
  const left = workArea(1920, 1032, -1920, 0);
  const primary = workArea(2560, 1392);
  // 800px of it sits on the left display, 400px on the primary.
  const saved = { bounds: { x: -800, y: 100, width: 1200, height: 800 }, maximized: false };
  assert.deepEqual(resolveRestoredDesktopWindowPlacement(saved, [primary, left]), {
    bounds: { x: -1200, y: 100, width: 1200, height: 800 },
    maximized: false,
  });
});

test('saved placement on a disconnected display falls back to the default placement', () => {
  const saved = { bounds: { x: 3000, y: 0, width: 1200, height: 800 }, maximized: true };
  assert.equal(resolveRestoredDesktopWindowPlacement(saved, [workArea(1920, 1032)]), null);
  assert.deepEqual(
    resolveDesktopWindowPlacement({
      saved,
      workAreas: [workArea(1920, 1032)],
      primaryWorkArea: workArea(1920, 1032),
    }),
    resolveDefaultDesktopWindowPlacement(workArea(1920, 1032)),
  );
  assert.deepEqual(
    resolveDesktopWindowPlacement({
      saved: null,
      workAreas: [workArea(1920, 1032)],
      primaryWorkArea: workArea(1920, 1032),
    }),
    resolveDefaultDesktopWindowPlacement(workArea(1920, 1032)),
  );
});

test('window state parsing accepts only the current version with valid bounds', () => {
  const bounds = { x: -10.4, y: 20, width: 1200.6, height: 800 };
  assert.deepEqual(parseDesktopWindowState({ version: 1, bounds, maximized: true }), {
    bounds: { x: -10, y: 20, width: 1201, height: 800 },
    maximized: true,
  });
  assert.equal(parseDesktopWindowState({ version: 1, bounds, maximized: 'yes' }).maximized, false);
  assert.equal(parseDesktopWindowState({ version: 2, bounds, maximized: false }), null);
  assert.equal(parseDesktopWindowState({ bounds, maximized: false }), null);
  assert.equal(parseDesktopWindowState({ version: 1, bounds: { ...bounds, width: 0 } }), null);
  assert.equal(parseDesktopWindowState({ version: 1, bounds: { ...bounds, x: 'left' } }), null);
  assert.equal(parseDesktopWindowState({ version: 1, bounds: { ...bounds, y: Number.NaN } }), null);
  assert.equal(parseDesktopWindowState(null), null);
});

test('window state round-trips through an atomic write and tolerates bad files', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'cats-window-state-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const statePath = join(dir, 'desktop', 'window-state.json');
  const placement = { bounds: { x: 12, y: 34, width: 1400, height: 900 }, maximized: true };

  assert.equal(readDesktopWindowState(statePath), null);
  writeDesktopWindowState(statePath, placement);
  assert.deepEqual(readDesktopWindowState(statePath), placement);
  assert.deepEqual(JSON.parse(await readFile(statePath, 'utf8')), { version: 1, ...placement });
  assert.deepEqual(await readdir(join(dir, 'desktop')), ['window-state.json']);

  await writeFile(statePath, '{ not json');
  assert.equal(readDesktopWindowState(statePath), null);
});

class FakeWindow extends EventEmitter {
  bounds = { x: 0, y: 0, width: 1280, height: 800 };
  maximized = false;
  minimized = false;
  fullScreen = false;
  destroyed = false;

  getNormalBounds() {
    return { ...this.bounds };
  }

  isMaximized() {
    return this.maximized;
  }

  isMinimized() {
    return this.minimized;
  }

  isFullScreen() {
    return this.fullScreen;
  }

  isDestroyed() {
    return this.destroyed;
  }
}

function trackFakeWindow(window, maximized = false) {
  const writes = [];
  const tracker = trackDesktopWindowPlacement(window, {
    statePath: 'window-state.json',
    maximized,
    debounceMs: 500,
    writeState: (_statePath, placement) => writes.push(placement),
  });
  return { tracker, writes };
}

test('placement tracker saves once the window stops resizing', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const window = new FakeWindow();
  const { writes } = trackFakeWindow(window);

  window.bounds = { x: 10, y: 10, width: 1300, height: 820 };
  window.emit('resize');
  t.mock.timers.tick(300);
  window.bounds = { x: 10, y: 10, width: 1400, height: 880 };
  window.emit('resize');
  t.mock.timers.tick(499);
  assert.equal(writes.length, 0);
  t.mock.timers.tick(1);
  assert.deepEqual(writes, [{ bounds: { x: 10, y: 10, width: 1400, height: 880 }, maximized: false }]);
});

test('placement tracker writes nothing for a window that never changed', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const window = new FakeWindow();
  const { tracker, writes } = trackFakeWindow(window, true);

  tracker.flush();
  window.emit('close');
  t.mock.timers.tick(1000);
  assert.deepEqual(writes, []);
});

test('placement tracker flushes pending changes on close and on demand', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const window = new FakeWindow();
  const { tracker, writes } = trackFakeWindow(window);

  window.bounds = { x: 5, y: 5, width: 1200, height: 800 };
  window.emit('move');
  window.emit('close');
  assert.equal(writes.length, 1);

  window.bounds = { x: 6, y: 6, width: 1200, height: 800 };
  window.emit('move');
  tracker.flush();
  assert.equal(writes.length, 2);
  t.mock.timers.tick(1000);
  assert.equal(writes.length, 2);
});

test('placement tracker remembers maximized through minimize and full screen', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const window = new FakeWindow();
  const { tracker, writes } = trackFakeWindow(window);

  window.maximized = true;
  window.emit('maximize');
  window.minimized = true;
  window.maximized = false;
  window.emit('unmaximize');
  window.emit('resize');
  tracker.flush();
  assert.equal(writes.at(-1).maximized, true);

  window.minimized = false;
  window.fullScreen = true;
  window.emit('resize');
  tracker.flush();
  assert.equal(writes.at(-1).maximized, true);

  window.fullScreen = false;
  window.emit('unmaximize');
  window.emit('resize');
  tracker.flush();
  assert.equal(writes.at(-1).maximized, false);
});

test('placement tracker skips destroyed windows and survives write failures', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const window = new FakeWindow();
  const stderrWrites = [];
  t.mock.method(process.stderr, 'write', (chunk) => {
    stderrWrites.push(String(chunk));
    return true;
  });
  const tracker = trackDesktopWindowPlacement(window, {
    statePath: 'window-state.json',
    maximized: false,
    writeState: () => {
      throw new Error('disk full');
    },
  });

  window.emit('resize');
  assert.doesNotThrow(() => tracker.flush());
  assert.match(stderrWrites.join(''), /Desktop window state save failed: disk full/u);

  const destroyed = new FakeWindow();
  const { tracker: destroyedTracker, writes } = trackFakeWindow(destroyed);
  destroyed.emit('resize');
  destroyed.destroyed = true;
  destroyedTracker.flush();
  assert.deepEqual(writes, []);
});
