import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import {
  buildUnifiedPreviewBridge,
  injectPreviewBridge,
  resolvePreviewOpenCommand,
  tryOpenPreviewFile,
} from '../scripts/preview-bootstrap.mjs';

test('resolvePreviewOpenCommand uses cmd start with a title placeholder on Windows', () => {
  assert.deepEqual(
    resolvePreviewOpenCommand('win32', 'C:/Temp/cats-bootstrap-preview.html'),
    {
      command: 'cmd',
      args: ['/c', 'start', '', 'C:/Temp/cats-bootstrap-preview.html'],
    },
  );
});

test('tryOpenPreviewFile invokes the resolved command without shell quoting hacks', () => {
  const calls = [];
  const result = tryOpenPreviewFile('/tmp/cats-bootstrap-preview.html', {
    platform: 'linux',
    spawnSync(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0 };
    },
  });

  assert.deepEqual(calls, [{
    command: 'xdg-open',
    args: ['/tmp/cats-bootstrap-preview.html'],
    options: {
      stdio: 'ignore',
      windowsHide: true,
    },
  }]);
  assert.equal(result.opened, true);
});

test('injectPreviewBridge inserts the mock bridge before the bootstrap page script', () => {
  const html = '<html><body><script>main()</script></body></html>';

  assert.equal(
    injectPreviewBridge(html, 'window.mockBridge = true;'),
    '<html><body><script>window.mockBridge = true;</script><script>main()</script></body></html>',
  );
});

test('buildUnifiedPreviewBridge transitions listeners and setup snapshot into recovery mode', async () => {
  const timers = [];
  const logs = [];
  const context = {
    Promise,
    Date,
    console: {
      log(...args) {
        logs.push(args);
      },
    },
    window: {
      setTimeout(fn, ms) {
        timers.push({ fn, ms });
        return timers.length;
      },
    },
  };

  vm.runInNewContext(buildUnifiedPreviewBridge(1234), context);

  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 1234);

  const bridge = context.window.catsDesktopHost;
  assert.ok(bridge);

  const initialSnapshot = await bridge.getSnapshot();
  const initialSetupSnapshot = await bridge.getSetupSnapshot();
  assert.equal(initialSnapshot.phase, 'starting_services');
  assert.equal(initialSetupSnapshot, null);

  let pushedSnapshot = null;
  bridge.onSnapshot((snapshot) => {
    pushedSnapshot = snapshot;
  });

  timers[0].fn();

  const recoverySnapshot = await bridge.getSnapshot();
  const recoverySetupSnapshot = await bridge.getSetupSnapshot();
  assert.equal(recoverySnapshot.phase, 'failed');
  assert.equal(recoverySetupSnapshot.resumeAction.helperId, 'env-bootstrap');
  assert.equal(pushedSnapshot.phase, 'failed');
  assert.equal(logs.length, 0);
});
