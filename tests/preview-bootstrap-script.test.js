import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
