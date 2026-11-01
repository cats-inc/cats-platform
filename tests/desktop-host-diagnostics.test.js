import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createLogWriter, diagnosticError, LOG_MAX_BYTES } from '../build/desktop/diagnosticLog.js';
import { createHostLogger, logLevel, observeDisplays, observeHostApp, reportHostError } from '../build/desktop/hostDiagnostics.js';

function fixture(t, level) {
  const root = mkdtempSync(join(tmpdir(), 'cats-desktop-host-log-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const logger = createHostLogger(root, { level });
  return { root, logger, read: () => readFileSync(logger.file, 'utf8') };
}

class Window extends EventEmitter {
  id = 7;
  webContents = Object.assign(new EventEmitter(), {
    id: 9, getURL: () => 'http://localhost:8181/chat/PRIVATE?token=PRIVATE',
  });
  isDestroyed() { return false; }
  isVisible() { return true; }
  isMinimized() { return false; }
  getBounds() { return { x: 2000, y: 10, width: 900, height: 700 }; }
}

test('production host diagnostics retain window/process evidence without content or URLs', (t) => {
  const { logger, read } = fixture(t);
  const app = new EventEmitter(), window = new Window();
  observeHostApp(app, () => [window], logger);
  app.emit('browser-window-created', {}, window);
  app.emit('second-instance');
  window.emit('show'); window.emit('hide'); window.emit('move');
  window.webContents.emit('did-fail-load', {}, -6, 'PRIVATE error', 'https://PRIVATE', true);
  app.emit('render-process-gone', {}, window.webContents, { reason: 'crashed', exitCode: 42 });
  app.emit('child-process-gone', {}, { type: 'GPU', reason: 'oom', exitCode: 9, serviceName: 'PRIVATE' });
  window.emit('closed'); app.emit('quit', {}, 0);
  const log = read();
  for (const event of ['window-created', 'window-show', 'window-hide', 'renderer-gone', 'child-process-gone', 'page-load-failed', 'window-closed', 'second-instance-handoff', 'quit']) assert.ok(log.includes(event), event);
  assert.match(log, /"page":"app"/u);
  assert.match(log, /"exitCode":42/u);
  assert.ok(!log.includes('PRIVATE'));
  assert.ok(!log.includes('window-move'));
});

test('display inventory records geometry/scaling and tolerates a failing native query', (t) => {
  const { logger, read } = fixture(t);
  let unavailable = false;
  const display = { id: 1, label: 'PRIVATE', bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1.5, rotation: 0 };
  const screen = Object.assign(new EventEmitter(), {
    getAllDisplays: () => { if (unavailable) throw new Error('PRIVATE'); return [display]; },
    getPrimaryDisplay: () => display,
  });
  observeDisplays(screen, () => [new Window()], logger);
  screen.emit('display-metrics-changed', {}, display, ['bounds', 'scaleFactor']);
  screen.emit('display-removed', {}, display);
  unavailable = true;
  assert.doesNotThrow(() => screen.emit('display-added', {}, display));
  assert.match(read(), /"scaleFactor":1.5/u);
  assert.match(read(), /"x":2000/u);
  assert.match(read(), /displays-unavailable/u);
  assert.ok(!read().includes('PRIVATE'));
});

test('service transitions deduplicate output-only updates and keep failures at error threshold', (t) => {
  const { logger, read } = fixture(t, 'error');
  const service = { name: 'cats-runtime', status: 'ready', ready: true, pid: 123, exitCode: null,
    error: 'PRIVATE', lastOutput: 'PRIVATE', healthUrl: 'http://PRIVATE' };
  logger.service(service);
  logger.service({ ...service, status: 'failed', ready: false, exitCode: 7 });
  logger.service({ ...service, status: 'failed', ready: false, exitCode: 7, lastOutput: 'another PRIVATE' });
  const log = read();
  assert.equal(log.trim().split('\n').length, 1);
  assert.match(log, /ERROR.*"exitCode":7/u);
  assert.ok(!log.includes('PRIVATE'));
});

test('verbosity is opt-in and errors retain only safe type/code/frame metadata', (t) => {
  const { logger, read } = fixture(t, 'debug');
  logger.record('detail', {}, 'debug'); logger.record('too-fine', {}, 'trace');
  logger.log('token=SECRET Bearer SECRET https://user:SECRET@example.test/path');
  const error = Object.assign(new Error('PRIVATE prompt'), { code: 'EACCES' });
  error.stack = 'Error: PRIVATE\n  at fail (C:\\test\\main.ts:12:3)\nPRIVATE source';
  logger.error('failure', error);
  assert.match(read(), /detail/u);
  assert.match(read(), /Error code=EACCES/u);
  assert.ok(!read().includes('too-fine'));
  assert.ok(!read().includes('SECRET'));
  assert.ok(!read().includes('PRIVATE'));
  assert.equal(logLevel('invalid'), 'info');
  assert.equal(diagnosticError('PRIVATE'), 'non-Error (string)');
});

test('bounded logs survive restarts, oversized legacy files, UTF-8 and unavailable mirrors', (t) => {
  const { root } = fixture(t), file = join(root, 'test.log');
  writeFileSync(file, 'old'.repeat(1024));
  writeFileSync(`${file}.1`, 'old'.repeat(1024));
  for (let n = 0; n < 20; n++) createLogWriter(file, { maxBytes: 128, backups: 2 })(`${n}: ${'貓'.repeat(15)}\n`);
  for (const name of readdirSync(root)) {
    assert.ok(statSync(join(root, name)).size <= 128);
    assert.ok(!readFileSync(join(root, name), 'utf8').includes('\ufffd'));
  }
  assert.match(readFileSync(file, 'utf8'), /19:/u);
  createLogWriter(file, { maxBytes: 128 })('x'.repeat(20_000));
  assert.ok(statSync(file).size <= 128);
  assert.match(readFileSync(file, 'utf8'), /truncated/u);
  const obstacle = join(root, 'obstacle'); writeFileSync(obstacle, 'file');
  assert.doesNotThrow(() => createLogWriter(join(obstacle, 'log'))('record'));
  assert.doesNotThrow(() => createHostLogger(root, { mirror: () => { throw new Error('EPIPE'); } }).record('running'));
  assert.equal(LOG_MAX_BYTES, 256 * 1024);
});

test('fallback stderr reporting omits arbitrary exception text', (t) => {
  const lines = [];
  t.mock.method(process.stderr, 'write', (line) => { lines.push(String(line)); return true; });
  reportHostError('state-save-failed', new Error('PRIVATE'));
  assert.match(lines.join(''), /state-save-failed: Error/u);
  assert.ok(!lines.join('').includes('PRIVATE'));
});

test('fatal monitoring persists evidence without suppressing a nonzero process exit', (t) => {
  const { root, logger, read } = fixture(t);
  const module = new URL('../build/desktop/hostDiagnostics.js', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import {createHostLogger, observeHostProcess} from ${JSON.stringify(module)};
    observeHostProcess(createHostLogger(${JSON.stringify(root)})); throw new Error('PRIVATE');`], { encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr);
  assert.match(read(), /fatal/u);
  assert.match(read(), /process-exit.*"code":1/u);
  assert.ok(!read().includes('PRIVATE'));
  assert.equal(logger.level, 'info');
});
