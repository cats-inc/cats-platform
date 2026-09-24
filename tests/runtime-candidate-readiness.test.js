import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { waitForCandidateRuntimeReady } from '../scripts/testing/runtime-candidate-readiness.mjs';

function childFixture() {
  const child = new EventEmitter();
  Object.assign(child, { pid: 1234, exitCode: null, signalCode: null, stdout: new PassThrough() });
  const ready = { event: 'runtime.ready', service: 'cats-runtime', contractVersion: 1,
    mode: 'app-managed', managedBy: 'plan110-k4', phase: 'ready', ready: true,
    host: '127.0.0.1', port: 43110, pid: child.pid };
  return { child, ready };
}

test('candidate readiness requires the spawned PID and exact endpoint, then detaches its observers', async () => {
  const { child, ready } = childFixture();
  let accepted = false;
  const waiting = waitForCandidateRuntimeReady(child, { port: ready.port }).then(value => { accepted = true; return value; });
  for (const patch of [{ pid: 999 }, { port: 3110 }, { host: '0.0.0.0' }, { managedBy: 'another-host' },
    { mode: 'standalone' }, { contractVersion: 2 }, { ready: false }, { service: 'cats-platform' }]) {
    child.stdout.write(`${JSON.stringify({ ...ready, ...patch })}\n`);
  }
  await Promise.resolve();
  assert.equal(accepted, false);
  const line = JSON.stringify(ready);
  child.stdout.write(`ordinary log\n${line.slice(0, 30)}`);
  child.stdout.write(`${line.slice(30)}\r\n`);
  assert.deepEqual(await waiting, ready);
  assert.equal(child.stdout.listenerCount('data'), 0);
  assert.equal(child.listenerCount('exit'), 0);
  assert.equal(child.listenerCount('error'), 0);
});

test('candidate never accepts another responder when its owned process exits, including signal exits', async () => {
  for (const signal of [null, 'SIGTERM']) {
    const { child, ready } = childFixture();
    const waiting = waitForCandidateRuntimeReady(child, { port: ready.port });
    child.stdout.write(`${JSON.stringify({ ...ready, pid: 999 })}\n`);
    child.exitCode = signal ? null : 1;
    child.signalCode = signal;
    child.emit('exit', child.exitCode, signal);
    await assert.rejects(waiting, /exited before owned readiness/u);
    assert.equal(child.stdout.listenerCount('data'), 0);
  }
});

test('candidate rejects spawn failure, an already exited child, and missing lifecycle acknowledgement', async () => {
  const failed = childFixture();
  const failedWait = waitForCandidateRuntimeReady(failed.child, { port: failed.ready.port });
  failed.child.emit('error', new Error('do not expose invocation details'));
  await assert.rejects(failedWait, /failed before owned readiness/u);
  const exited = childFixture();
  exited.child.exitCode = 1;
  await assert.rejects(waitForCandidateRuntimeReady(exited.child, { port: exited.ready.port }), /exited before/u);
  const absent = childFixture();
  await assert.rejects(waitForCandidateRuntimeReady(absent.child, { port: absent.ready.port, timeoutMs: 10 }), /did not report owned readiness/u);
  assert.equal(absent.child.stdout.listenerCount('data'), 0);
});

test('oversized or malformed lines cannot supply a candidate acknowledgement', async () => {
  const { child, ready } = childFixture();
  const waiting = waitForCandidateRuntimeReady(child, { port: ready.port });
  child.stdout.write('x'.repeat(20_000));
  child.stdout.write(`${JSON.stringify(ready)}\nmalformed JSON\n`);
  child.stdout.write(`${JSON.stringify(ready)}\n`);
  assert.deepEqual(await waiting, ready);
});
