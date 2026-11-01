import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import sharp from 'sharp';
import { renderIconVariants } from '../scripts/shared/icon-pipeline.mjs';
import { openCdpSession, parseArgs } from '../scripts/shared/renderer-cdp.mjs';
import { stableReleaseVersion } from '../scripts/shared/release-primitives.mjs';
const exec = promisify(execFile);

test('shared icon pipeline produces real sized PNGs and rejects invalid sizes before rendering', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="orange"/></svg>');
  let renders = 0;
  const variants = await renderIconVariants(svg, [16, 32, 64], {
    render: async (input, size) => { renders++; return sharp(input).resize(size, size).png().toBuffer(); },
    resize: (png, size) => sharp(png).resize(size, size).png().toBuffer(),
  });
  assert.equal(renders, 1);
  for (const [size, png] of variants) { const metadata = await sharp(png).metadata(); assert.equal(metadata.width, size); assert.equal(metadata.height, size); }
  await assert.rejects(renderIconVariants(svg, [0], { render: () => { throw new Error('must not render'); } }), /Icon sizes/u);
});

test('shared CDP rejects non-loopback WebSockets and invalid ports; release adapters retain strict/default behavior', async () => {
  await assert.rejects(openCdpSession('ws://example.invalid:9222/test'), /127.0.0.1/u);
  assert.throws(() => parseArgs(['info', '--port', '65536']), /65535/u);
  assert.equal(stableReleaseVersion('v0.4.2'), '0.4.2');
  assert.throws(() => stableReleaseVersion('v01.2.3'));
  assert.equal(stableReleaseVersion('v01.2.3', { allowLeadingZeros: true }), '01.2.3');
});

test('CDP handshake timeout closes an endpoint that never opens', async () => {
  let closed = false;
  class NeverOpens {
    addEventListener() {}
    close() { closed = true; }
  }
  await assert.rejects(openCdpSession('ws://127.0.0.1:9222/test', { timeoutMs: 10, WebSocketImpl: NeverOpens }), /handshake timed out/u);
  assert.equal(closed, true);
});

test('macOS restart refuses an unrelated occupied port and active Runtime before requesting quit', { skip: process.platform !== 'darwin' }, async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-restart-tools-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin'), app = path.join(root, 'Fixture.app');
  await mkdir(bin); await mkdir(path.join(app, 'Contents'), { recursive: true });
  await writeFile(path.join(app, 'Contents/Info.plist'), '<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>io.catsinc.fixture</string><key>CFBundleExecutable</key><string>Fixture</string></dict></plist>');
  const stub = async (name, body) => { const file = path.join(bin, name); await writeFile(file, '#!/bin/sh\n' + body); await chmod(file, 0o755); };
  await stub('pgrep', '[ "$1" = "-P" ] && { [ "$2" = 11 ] && echo 12; [ "$2" = 12 ] && echo 13; exit 0; }\necho 11\n');
  await stub('ps', 'case "$*" in *11) echo "$FIXTURE_APP/Contents/MacOS/Fixture" ;; *12) echo "$FIXTURE_APP/Contents/Resources/cats-runtime/build/runtime/index.js" ;; esac\n');
  await stub('osascript', 'touch "$FIXTURE_ROOT/quit.called"\n');
  await stub('lsof', 'echo 999\n');
  const options = { env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, FIXTURE_ROOT: root, FIXTURE_APP: app } };
  await assert.rejects(exec('/bin/bash', ['scripts/macos/restart-desktop-with-cdp.sh', '--app', app], options), /already in use by another process/u);
  await assert.rejects(readFile(path.join(root, 'quit.called')), { code: 'ENOENT' });
  await stub('lsof', 'exit 1\n');
  await assert.rejects(exec('/bin/bash', ['scripts/macos/restart-desktop-with-cdp.sh', '--app', app], options), /runtime has child processes/iu);
  await assert.rejects(readFile(path.join(root, 'quit.called')), { code: 'ENOENT' });
});
