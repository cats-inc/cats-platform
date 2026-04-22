import assert from 'node:assert/strict';
import test from 'node:test';

import {
  captureWlrootsNativeScreenshotRegion,
  formatWlrootsScreenshotGeometry,
  isLikelyWlrootsScreenshotSession,
  parseWlrootsScreenshotGeometry,
} from '../build/desktop/screenshotWlrootsCapture.js';

function createWlrootsEnv(overrides = {}) {
  return {
    XDG_SESSION_TYPE: 'wayland',
    XDG_CURRENT_DESKTOP: 'labwc:wlroots',
    DESKTOP_SESSION: 'rpd-labwc',
    WAYLAND_DISPLAY: 'wayland-0',
    ...overrides,
  };
}

function createPngHeader(width, height) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function createCommandError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

test('wlroots screenshot session detection targets Linux Wayland wlroots desktops', () => {
  assert.equal(
    isLikelyWlrootsScreenshotSession({
      platform: 'linux',
      env: createWlrootsEnv(),
    }),
    true,
  );
  assert.equal(
    isLikelyWlrootsScreenshotSession({
      platform: 'linux',
      env: createWlrootsEnv({ XDG_SESSION_TYPE: 'x11' }),
    }),
    false,
  );
  assert.equal(
    isLikelyWlrootsScreenshotSession({
      platform: 'darwin',
      env: createWlrootsEnv(),
    }),
    false,
  );
});

test('wlroots screenshot geometry parser accepts slurp format', () => {
  assert.deepEqual(
    parseWlrootsScreenshotGeometry('-10,20 320x180\n'),
    { x: -10, y: 20, width: 320, height: 180 },
  );
  assert.equal(formatWlrootsScreenshotGeometry({
    x: -10,
    y: 20,
    width: 320,
    height: 180,
  }), '-10,20 320x180');
  assert.equal(parseWlrootsScreenshotGeometry('not geometry'), null);
});

test(
  'wlroots screenshot capture selects with slurp and captures same region with grim',
  async () => {
    const calls = [];
    const png = createPngHeader(640, 360);
    const result = await captureWlrootsNativeScreenshotRegion({
      platform: 'linux',
      env: createWlrootsEnv(),
      createFilename: () => 'cats-screenshot-20260422-010203-001.png',
      async runCommand(command, args, options) {
        calls.push({ command, args, options });
        if (args[0] === '-h') {
          return { stdout: new Uint8Array(), stderr: '' };
        }
        if (command === 'slurp') {
          return {
            stdout: Buffer.from('-20,30 640x360\n', 'utf8'),
            stderr: '',
          };
        }
        if (command === 'grim') {
          return { stdout: png, stderr: '' };
        }
        throw new Error(`unexpected command: ${command}`);
      },
    });

    assert.deepEqual(result, {
      outcome: 'ok',
      png,
      mime: 'image/png',
      filename: 'cats-screenshot-20260422-010203-001.png',
      width: 640,
      height: 360,
    });
    assert.deepEqual(
      calls.map((call) => [call.command, call.args]),
      [
        ['grim', ['-h']],
        ['slurp', ['-h']],
        [
          'slurp',
          [
            '-f',
            '%x,%y %wx%h',
            '-b',
            '#00000055',
            '-c',
            '#f8fafcff',
            '-s',
            '#ffffff22',
            '-w',
            '1',
          ],
        ],
        ['grim', ['-g', '-20,30 640x360', '-t', 'png', '-']],
      ],
    );
  },
);

test('wlroots screenshot capture maps slurp cancellation to user cancellation', async () => {
  const calls = [];
  const result = await captureWlrootsNativeScreenshotRegion({
    platform: 'linux',
    env: createWlrootsEnv(),
    createFilename: () => {
      throw new Error('filename should not be needed for cancellation');
    },
    async runCommand(command, args) {
      calls.push({ command, args });
      if (args[0] === '-h') {
        return { stdout: new Uint8Array(), stderr: '' };
      }
      if (command === 'slurp') {
        throw createCommandError('selection cancelled', 1);
      }
      throw new Error('grim should not run after cancelled selection');
    },
  });

  assert.deepEqual(result, {
    outcome: 'cancelled',
    reason: 'user_cancel',
  });
  assert.equal(calls.some((call) => call.command === 'grim' && call.args[0] !== '-h'), false);
});

test('wlroots screenshot capture treats tiny slurp selections as too small', async () => {
  const calls = [];
  const result = await captureWlrootsNativeScreenshotRegion({
    platform: 'linux',
    env: createWlrootsEnv(),
    createFilename: () => {
      throw new Error('filename should not be needed for tiny selection');
    },
    async runCommand(command, args) {
      calls.push({ command, args });
      if (args[0] === '-h') {
        return { stdout: new Uint8Array(), stderr: '' };
      }
      if (command === 'slurp') {
        return { stdout: Buffer.from('0,0 7x7\n', 'utf8'), stderr: '' };
      }
      throw new Error('grim should not run after tiny selection');
    },
  });

  assert.deepEqual(result, {
    outcome: 'cancelled',
    reason: 'too_small',
  });
  assert.equal(calls.some((call) => call.command === 'grim' && call.args[0] !== '-h'), false);
});

test('wlroots screenshot capture does not run tools outside wlroots sessions', async () => {
  const result = await captureWlrootsNativeScreenshotRegion({
    platform: 'linux',
    env: createWlrootsEnv({ XDG_SESSION_TYPE: 'x11' }),
    createFilename: () => {
      throw new Error('filename should not be needed without wlroots');
    },
    async runCommand() {
      throw new Error('tools should not run without wlroots');
    },
  });

  assert.equal(result.outcome, 'platform_unsupported');
});

test('wlroots screenshot capture returns unsupported when grim or slurp is missing', async () => {
  const result = await captureWlrootsNativeScreenshotRegion({
    platform: 'linux',
    env: createWlrootsEnv(),
    createFilename: () => {
      throw new Error('filename should not be needed when tools are missing');
    },
    async runCommand(command) {
      if (command === 'grim') {
        throw createCommandError('missing grim', 'ENOENT');
      }
      return { stdout: new Uint8Array(), stderr: '' };
    },
  });

  assert.deepEqual(result, {
    outcome: 'platform_unsupported',
    message: 'Native wlroots screenshot capture requires grim and slurp.',
  });
});
