import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  listTargets,
  parseArgs,
  runDesktopRendererCdp,
  selectPageTarget,
} from '../scripts/testing/desktop-renderer-cdp.mjs';

const execFile = promisify(execFileCallback);

const BOOTSTRAP_TARGET = {
  type: 'page',
  id: 'boot',
  url: 'data:text/html;base64,AAAA',
  title: 'Cats',
  webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/boot',
};
const APP_TARGET = {
  type: 'page',
  id: 'app',
  url: 'http://127.0.0.1:8181/chat',
  title: 'Cats Chat',
  webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/app',
};
const WORKER_TARGET = {
  type: 'service_worker',
  id: 'worker',
  url: 'http://127.0.0.1:8181/sw.js',
  title: 'sw',
  webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/worker',
};

function createFakeWebSocket(respond, sent) {
  return class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.listeners = new Map();
      setImmediate(() => this.emit('open', {}));
    }

    addEventListener(type, listener) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }

    emit(type, event) {
      for (const listener of this.listeners.get(type) ?? []) listener(event);
    }

    send(data) {
      const message = JSON.parse(data);
      sent.push({ url: this.url, ...message });
      const reply = respond(message);
      if (!reply) return;
      const payload = JSON.stringify({ id: message.id, ...reply });
      setImmediate(() => this.emit('message', { data: payload }));
    }

    close() {
      this.emit('close', {});
    }
  };
}

function createFetch(targets) {
  return async (url) => {
    assert.equal(url, 'http://127.0.0.1:9222/json/list');
    return { ok: true, status: 200, json: async () => targets };
  };
}

function captureStdout() {
  const chunks = [];
  return { stream: { write: (chunk) => chunks.push(chunk) }, text: () => chunks.join('') };
}

test('desktop renderer CDP parser validates commands, port and eval expression', () => {
  assert.deepEqual(
    { ...parseArgs(['info'], {}) },
    {
      command: 'info',
      expression: null,
      port: 9222,
      target: null,
      out: null,
      timeoutMs: 10000,
      help: false,
    },
  );
  assert.equal(parseArgs(['info'], { CATS_DESKTOP_CDP_PORT: '9333' }).port, 9333);
  assert.equal(parseArgs(['info', '--port', '9444'], { CATS_DESKTOP_CDP_PORT: '9333' }).port, 9444);
  assert.equal(parseArgs(['eval', 'document', '.title'], {}).expression, 'document .title');
  assert.equal(parseArgs(['--help'], {}).help, true);

  assert.throws(() => parseArgs([], {}), /Expected one of targets/u);
  assert.throws(() => parseArgs(['click'], {}), /Expected one of targets/u);
  assert.throws(() => parseArgs(['eval'], {}), /requires a JavaScript expression/u);
  assert.throws(() => parseArgs(['info', 'extra'], {}), /Unexpected argument for info/u);
  assert.throws(
    () => parseArgs(['info', '--port', 'abc'], {}),
    /--port must be a positive integer/u,
  );
  assert.throws(() => parseArgs(['info', '--port'], {}), /Missing value for --port/u);
  assert.throws(() => parseArgs(['info', '--host', 'example.com'], {}), /Unknown option: --host/u);
});

test('desktop renderer CDP target selection skips the bootstrap page and non-page targets', () => {
  assert.equal(selectPageTarget([BOOTSTRAP_TARGET, WORKER_TARGET, APP_TARGET]).id, 'app');
  assert.equal(selectPageTarget([BOOTSTRAP_TARGET, APP_TARGET], 'data:').id, 'boot');
  assert.throws(() => selectPageTarget([BOOTSTRAP_TARGET]), /still be on its bootstrap page/u);
  assert.throws(
    () => selectPageTarget([APP_TARGET], '/settings'),
    /No page target URL contains "\/settings"/u,
  );
});

test('desktop renderer CDP reports an actionable error when no endpoint is listening', async () => {
  await assert.rejects(
    listTargets({ port: 9333, fetchImpl: async () => { throw new TypeError('fetch failed'); } }),
    /No CDP endpoint at http:\/\/127\.0\.0\.1:9333\/json\/list\. .*--remote-debugging-port=9333/u,
  );
  await assert.rejects(
    listTargets({ port: 9222, fetchImpl: async () => ({ ok: false, status: 500 }) }),
    /returned HTTP 500/u,
  );
});

test('desktop renderer CDP evaluates info on the app page by value', async () => {
  const sent = [];
  const stdout = captureStdout();
  const info = { url: APP_TARGET.url, desktopBridge: true };
  const value = await runDesktopRendererCdp(['info'], {
    env: {},
    stdout: stdout.stream,
    fetchImpl: createFetch([BOOTSTRAP_TARGET, APP_TARGET]),
    WebSocketImpl: createFakeWebSocket(
      () => ({ result: { result: { type: 'object', value: info } } }),
      sent,
    ),
  });

  assert.deepEqual(value, info);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, APP_TARGET.webSocketDebuggerUrl);
  assert.equal(sent[0].method, 'Runtime.evaluate');
  assert.equal(sent[0].params.returnByValue, true);
  assert.match(sent[0].params.expression, /catsDesktopHost/u);
  assert.deepEqual(JSON.parse(stdout.text()), info);
});

test('desktop renderer CDP surfaces page exceptions and protocol errors', async () => {
  const run = (argv, reply) => runDesktopRendererCdp(argv, {
    env: {},
    stdout: captureStdout().stream,
    fetchImpl: createFetch([APP_TARGET]),
    WebSocketImpl: createFakeWebSocket(() => reply, []),
  });

  await assert.rejects(
    run(['eval', 'boom()'], {
      result: {
        result: {},
        exceptionDetails: {
          text: 'Uncaught',
          exception: { description: 'ReferenceError: boom is not defined' },
        },
      },
    }),
    /ReferenceError: boom is not defined/u,
  );
  await assert.rejects(
    run(['screenshot'], { error: { code: -32000, message: 'Unable to capture screenshot' } }),
    /Unable to capture screenshot \(-32000\)/u,
  );
  await assert.rejects(
    run(['text', '--timeout', '20'], null),
    /Runtime\.evaluate timed out after 20 ms/u,
  );
});

test('desktop renderer CDP writes the decoded screenshot to a private file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cats-cdp-test-'));
  try {
    const out = join(directory, 'shot.png');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const sent = [];
    const stdout = captureStdout();
    const path = await runDesktopRendererCdp(['screenshot', '--out', out], {
      env: {},
      stdout: stdout.stream,
      fetchImpl: createFetch([APP_TARGET]),
      WebSocketImpl: createFakeWebSocket(
        () => ({ result: { data: png.toString('base64') } }),
        sent,
      ),
    });

    assert.equal(path, out);
    assert.equal(stdout.text(), `${out}\n`);
    assert.equal(sent[0].method, 'Page.captureScreenshot');
    assert.deepEqual(await readFile(out), png);
    assert.equal((await stat(out)).mode & 0o777, 0o600);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('macOS Desktop CDP restart helper exposes help text without touching the app', async () => {
  const { stdout } = await execFile(
    'bash',
    ['scripts/macos/restart-desktop-with-cdp.sh', '--help'],
    { encoding: 'utf8' },
  );
  assert.match(stdout, /Usage:/u);
  assert.match(stdout, /--disable/u);
});

const STUB_COMMANDS = {
  // `open` launches the fake app; pgrep then reports it running and no runtime children.
  open: 'printf "%s\\n" "$@" > "$STUB_LOG/open.args"\ntouch "$STUB_LOG/opened"\n',
  pgrep: '[ "$1" = "-P" ] && exit 1\n[ -f "$STUB_LOG/opened" ] && { echo 4242; exit 0; }\nexit 1\n',
  osascript: 'touch "$STUB_LOG/osascript.called"\n',
};

async function createDisableFixture() {
  const root = await mkdtemp(join(tmpdir(), 'cats-cdp-disable-'));
  const bin = join(root, 'bin');
  const log = join(root, 'log');
  const home = join(root, 'home');
  const app = join(root, 'Cats.app');
  await mkdir(bin);
  await mkdir(log);
  await mkdir(join(app, 'Contents', 'MacOS'), { recursive: true });
  await writeFile(join(app, 'Contents', 'Info.plist'), [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<plist version="1.0"><dict>',
    '<key>CFBundleIdentifier</key><string>io.catsinc.test</string>',
    '<key>CFBundleExecutable</key><string>Cats</string>',
    '</dict></plist>',
  ].join('\n'));
  for (const [name, body] of Object.entries(STUB_COMMANDS)) {
    await writeFile(join(bin, name), `#!/bin/sh\n${body}`);
    await chmod(join(bin, name), 0o755);
  }
  const userData = join(home, 'Library', 'Application Support', 'Cats');
  await mkdir(userData, { recursive: true });
  return {
    root,
    app,
    log,
    portFile: join(userData, 'DevToolsActivePort'),
    env: { ...process.env, HOME: home, STUB_LOG: log, PATH: `${bin}:/usr/bin:/bin` },
  };
}

test(
  'macOS Desktop CDP restart helper removes the stale DevToolsActivePort on --disable',
  { skip: process.platform !== 'darwin' && 'requires macOS PlistBuddy' },
  async () => {
    const fixture = await createDisableFixture();
    try {
      await writeFile(fixture.portFile, '9222\n/devtools/browser/stale\n');
      const { stdout } = await execFile(
        'bash',
        ['scripts/macos/restart-desktop-with-cdp.sh', '--disable', '--app', fixture.app],
        { encoding: 'utf8', env: fixture.env },
      );

      assert.match(stdout, /Removed .*DevToolsActivePort/u);
      await assert.rejects(stat(fixture.portFile), { code: 'ENOENT' });
      assert.equal(await readFile(join(fixture.log, 'open.args'), 'utf8'), `-a\n${fixture.app}\n`);
      await assert.rejects(stat(join(fixture.log, 'osascript.called')), { code: 'ENOENT' });

      // Not running again, and nothing left to remove.
      await rm(join(fixture.log, 'opened'));
      const second = await execFile(
        'bash',
        ['scripts/macos/restart-desktop-with-cdp.sh', '--disable', '--app', fixture.app],
        { encoding: 'utf8', env: fixture.env },
      );
      assert.doesNotMatch(second.stdout, /Removed/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  },
);
