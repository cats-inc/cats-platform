import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { link, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { withProfileLock } from '../build/server/platform/persistence/state-db/profileLock.js';
import { writeDurableFile } from '../build/server/platform/persistence/state-db/atomicFile.js';
import { canonicalJson, canonicalDigest, JsonArray } from '../build/server/platform/persistence/state-db/canonicalJson.js';

async function scratch(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'cats-state-coordination '));
  t.after(() => rm(dir, { recursive: true, force: true, maxRetries: 10 }));
  return { dir, file: path.join(dir, 'profile.json') };
}

function worker(t, file, count) {
  const child = spawn(process.execPath, [fileURLToPath(new URL('./fixtures/desktop-state-lock-worker.mjs', import.meta.url)), file, String(count)],
    { env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { child.kill(); await once(child, 'close'); }
  });
  let output = ''; let error = '';
  child.stdout.on('data', bytes => { output += bytes; });
  child.stderr.on('data', bytes => { error += bytes; });
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => resolve({ code, output, error }));
  });
  return { child, done };
}

async function holder(t, file, command = 'hold') {
  const result = worker(t, file, command);
  await Promise.race([
    once(result.child.stdout, 'data'),
    result.done.then(value => { throw new Error(`Lock fixture exited before ready: ${value.error}`); }),
  ]);
  return result;
}

test('same-process store instances serialize asynchronous coordinated operations', async t => {
  const { file } = await scratch(t);
  await writeFile(file, '0');
  await Promise.all(Array.from({ length: 20 }, () => withProfileLock(file, async () => {
    const number = Number(await readFile(file, 'utf8'));
    await new Promise(done => setTimeout(done, 1));
    await writeDurableFile(file, String(number + 1));
  })));
  assert.equal(await readFile(file, 'utf8'), '20');
});

test('separate processes serialize complete JSON counter updates under the profile lock', { timeout: 30_000 }, async t => {
  const { file } = await scratch(t);
  await writeFile(file, '0');
  const workers = [worker(t, file, 15), worker(t, file, 15), worker(t, file, 15)];
  for (const result of await Promise.all(workers.map(value => value.done))) assert.equal(result.code, 0, result.error);
  assert.equal(await readFile(file, 'utf8'), '45');
});

test('dead writer lock is reclaimed once even by competing processes', { timeout: 30_000 }, async t => {
  const { file } = await scratch(t);
  await writeFile(file, '0');
  const held = await holder(t, file);
  const original = JSON.parse(await readFile(`${file}.operation-lock`, 'utf8'));
  held.child.kill(); await held.done;
  const contenders = [worker(t, file, 3), worker(t, file, 3)];
  for (const result of await Promise.all(contenders.map(value => value.done))) assert.equal(result.code, 0, result.error);
  assert.equal(await readFile(file, 'utf8'), '6');
  const tombstone = JSON.parse(await readFile(`${file}.operation-lock.${original.token}.retired`, 'utf8'));
  assert.equal(tombstone.token, original.token);
});

test('live owner times out without replacing its lock or leaving a candidate', { timeout: 30_000 }, async t => {
  const { dir, file } = await scratch(t);
  const held = await holder(t, file);
  const before = await readFile(`${file}.operation-lock`, 'utf8');
  const names = (await readdir(dir)).sort();
  await assert.rejects(withProfileLock(file, async () => {}, { timeoutMs: 30 }), /Timed out/);
  assert.equal(await readFile(`${file}.operation-lock`, 'utf8'), before);
  assert.deepEqual((await readdir(dir)).sort(), names);
  held.child.kill(); await held.done;
});

test('a dead reclaimer is recoverable at its claimed-but-not-unlinked checkpoint', { timeout: 30_000 }, async t => {
  const { dir, file } = await scratch(t);
  await writeFile(file, '0');
  const original = await holder(t, file);
  original.child.kill(); await original.done;
  const reclaimer = await holder(t, file, 'hold-reclaimer');
  reclaimer.child.kill(); await reclaimer.done;
  const next = worker(t, file, 1);
  const result = await next.done;
  assert.equal(result.code, 0, result.error);
  assert.equal(await readFile(file, 'utf8'), '1');
  assert.ok((await readdir(dir)).some(name => name.endsWith('.reclaim-0')));
});

test('an old tombstone left before unlinking its original lock can be resumed', { timeout: 30_000 }, async t => {
  const { file } = await scratch(t);
  const original = await holder(t, file);
  const owner = JSON.parse(await readFile(`${file}.operation-lock`, 'utf8'));
  await link(`${file}.operation-lock`, `${file}.operation-lock.${owner.token}.retired`);
  original.child.kill(); await original.done;
  assert.equal(await withProfileLock(file, async () => 'recovered'), 'recovered');
});

test('failure after public acquisition returns no stranded live-owner lock', async t => {
  const { dir, file } = await scratch(t);
  await assert.rejects(withProfileLock(file, async () => {}, {
    checkpoint: stage => { if (stage === 'public_acquired') throw new Error('injected post-acquisition failure'); },
  }), /post-acquisition/);
  assert.deepEqual(await readdir(dir), []);
  assert.equal(await withProfileLock(file, async () => 'retry'), 'retry');
});

test('cancelled same-process waiter settles promptly without letting a later waiter bypass', { timeout: 5000 }, async t => {
  const { file } = await scratch(t);
  let release; let started;
  const held = new Promise(done => { release = done; });
  const entered = new Promise(done => { started = done; });
  const events = [];
  const first = withProfileLock(file, async () => { events.push('first'); started(); await held; });
  t.after(async () => { release(); await first; });
  await entered;
  const controller = new AbortController();
  const cancelled = withProfileLock(file, async () => { events.push('cancelled'); }, { signal: controller.signal });
  const last = withProfileLock(file, async () => { events.push('last'); });
  controller.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
  assert.deepEqual(events, ['first']);
  release(); await Promise.all([first, last]);
  assert.deepEqual(events, ['first', 'last']);
});

test('same-process queue wait obeys its deadline while the owner stays held', { timeout: 5000 }, async t => {
  const { file } = await scratch(t);
  let release; let started;
  const held = new Promise(done => { release = done; });
  const entered = new Promise(done => { started = done; });
  const first = withProfileLock(file, async () => { started(); await held; });
  t.after(async () => { release(); await first; });
  await entered;
  await assert.rejects(withProfileLock(file, async () => {}, { timeoutMs: 10 }), /Timed out/);
  release(); await first;
});

test('filesystem preparation cannot grant already expired work, and zero means one immediate try', async t => {
  const { file } = await scratch(t);
  let ran = false;
  await assert.rejects(withProfileLock(file, async () => { ran = true; }, {
    timeoutMs: 100,
    checkpoint: async stage => { if (stage === 'candidate_prepared') await new Promise(done => setTimeout(done, 150)); },
  }), /Timed out/);
  assert.equal(ran, false);
  assert.equal(await withProfileLock(file, async () => 'immediate', { timeoutMs: 0 }), 'immediate');
});

test('unrecognized or foreign lock never gets silently removed', async t => {
  const { file } = await scratch(t);
  await writeFile(`${file}.operation-lock`, '{broken private owner');
  await assert.rejects(withProfileLock(file, async () => {}, { timeoutMs: 0 }), /Unrecognized/);
  assert.equal(await readFile(`${file}.operation-lock`, 'utf8'), '{broken private owner');
});

test('operation failure releases both process queue and file lock', async t => {
  const { dir, file } = await scratch(t);
  await assert.rejects(withProfileLock(file, async () => { throw new Error('injected failure'); }), /injected failure/);
  assert.deepEqual(await readdir(dir), []);
  assert.equal(await withProfileLock(file, async () => 'recovered'), 'recovered');
});

test('aborted waiter leaves an active owner and ordinary work intact', { timeout: 30_000 }, async t => {
  const { file } = await scratch(t);
  const held = await holder(t, file);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(withProfileLock(file, async () => {}, { signal: controller.signal }), { name: 'AbortError' });
  held.child.kill(); await held.done;
  assert.equal(await withProfileLock(file, async () => 'okay'), 'okay');
});

test('durable atomic replacement never exposes an empty, missing, or partial primary', async t => {
  const { dir, file } = await scratch(t);
  const original = 'a'.repeat(20_000);
  const replacement = 'b'.repeat(20_000);
  await writeDurableFile(file, original);
  let running = true; let reads = 0;
  const reader = (async () => {
    while (running) {
      const current = await readFile(file, 'utf8');
      assert.ok(current === original || current === replacement); reads++;
    }
  })();
  try {
    for (let index = 0; index < 15; index++) {
      try { await writeDurableFile(file, index % 2 ? original : replacement); }
      catch (error) {
        // A continuously open Windows reader can deny replacement. Failure must preserve
        // the previous complete file; progress is checked again after that reader stops.
        assert.ok(['EPERM', 'EACCES', 'EEXIST'].includes(error.code));
        break;
      }
    }
  } finally { running = false; await reader; }
  await writeDurableFile(file, replacement);
  assert.equal(await readFile(file, 'utf8'), replacement);
  assert.ok(reads > 0);
  assert.deepEqual(await readdir(dir), ['profile.json']);
});

test('logical export sorts object keys but preserves array order, NUL and Unicode', () => {
  const left = { z: [{ b: '雪\u0000', a: 1 }, 2], a: 'first', omitted: undefined };
  const right = { a: 'first', z: [{ a: 1, b: '雪\u0000' }, 2] };
  const text = [...canonicalJson(left)].join('');
  assert.equal(text, '{"a":"first","z":[{"a":1,"b":"雪\\u0000"},2]}\n');
  assert.equal(canonicalDigest(left), canonicalDigest(right));
  assert.notEqual(canonicalDigest(left), canonicalDigest({ ...right, z: [...right.z].reverse() }));
});

test('query-backed export arrays have byte-identical output to materialized JSON', () => {
  const logical = { channels: [{ id: 'a', messages: [1, 2, 3] }, { id: 'b', messages: [] }] };
  const streamed = { channels: new JsonArray(function* () {
    yield { messages: new JsonArray(function* () { yield 1; yield 2; yield 3; }), id: 'a' };
    yield { messages: new JsonArray(function* () {}), id: 'b' };
  }) };
  assert.deepEqual([...canonicalJson(streamed)], [...canonicalJson(logical)]);
  assert.equal(canonicalDigest(streamed), canonicalDigest(logical));
});
