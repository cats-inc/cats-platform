import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openStateDatabase } from '../build/server/platform/persistence/state-db/stateDatabase.js';
import { runStateMaintenance, closeStateMaintenanceWorkers } from '../build/server/platform/persistence/state-db/stateMaintenance.js';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-maintenance 資料 '));
  const file = path.join(root, 'source.sqlite');
  const db = openStateDatabase({ file, mode: 'writer' }); db.setMeta('isolated_fixture', 'kept'); db.close();
  t.after(async () => { await closeStateMaintenanceWorkers(); await rm(root, { recursive: true, force: true, maxRetries: 10 }); });
  return { root, file };
}
const hang = new URL('./fixtures/desktop-state-maintenance-hang.mjs', import.meta.url);

async function pid(file) {
  for (let index = 0; index < 250; index++) {
    const text = await readFile(`${file}.worker-pid`, 'utf8').catch(() => null);
    if (text) return Number(text);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw Error('The isolated maintenance worker did not start');
}

test('child checks and snapshots reopen with retained data and never overwrite an existing target', async t => {
  const { root, file } = await fixture(t); const target = path.join(root, 'snapshot.sqlite');
  await runStateMaintenance({ kind: 'check', file });
  await runStateMaintenance({ kind: 'snapshot', file, target });
  const saved = openStateDatabase({ file: target, mode: 'reader' });
  try { assert.equal(saved.meta('isolated_fixture'), 'kept'); } finally { saved.close(); }
  const before = await readFile(target);
  await assert.rejects(runStateMaintenance({ kind: 'snapshot', file, target }));
  assert.deepEqual(await readFile(target), before);
});

test('a missing source is never created by the maintenance child', async t => {
  const { root } = await fixture(t);
  const file = path.join(root, 'missing.sqlite');
  await assert.rejects(runStateMaintenance({ kind: 'check', file }));
  assert.equal((await readdir(root)).includes('missing.sqlite'), false);
});

test('deadline kills a blocked native-style child before reporting timeout', { timeout: 10_000 }, async t => {
  const { file } = await fixture(t);
  const job = runStateMaintenance({ kind: 'check', file }, { timeoutMs: 2500, worker: hang });
  const worker = await pid(file);
  await assert.rejects(job, { code: 'timeout' });
  assert.throws(() => process.kill(worker, 0), { code: 'ESRCH' });
});

test('cancellation and shutdown settle only after their child actually exits', { timeout: 10_000 }, async t => {
  const { file, root } = await fixture(t); const controller = new AbortController();
  const job = runStateMaintenance({ kind: 'check', file }, { timeoutMs: 5000, worker: hang, signal: controller.signal });
  const worker = await pid(file); controller.abort();
  await assert.rejects(job, { code: 'cancelled' });
  assert.throws(() => process.kill(worker, 0), { code: 'ESRCH' });
  const second = path.join(root, 'second.sqlite'); await writeFile(second, 'isolated placeholder');
  const held = runStateMaintenance({ kind: 'check', file: second }, { timeoutMs: 5000, worker: hang });
  const secondWorker = await pid(second);
  await closeStateMaintenanceWorkers(second);
  await assert.rejects(held, { code: 'cancelled' });
  assert.throws(() => process.kill(secondWorker, 0), { code: 'ESRCH' });
});

test('a killed parent cannot leave a native-blocked worker holding state files', { timeout: 10_000 }, async t => {
  const { file } = await fixture(t);
  const parent = spawn(process.execPath, [fileURLToPath(new URL('./fixtures/desktop-state-maintenance-parent.mjs', import.meta.url)), file],
    { env: process.env, windowsHide: true, stdio: 'ignore' });
  const closed = once(parent, 'close');
  t.after(async () => {
    if (parent.exitCode === null && parent.signalCode === null) { parent.kill('SIGKILL'); await closed; }
  });
  const worker = await pid(file); parent.kill('SIGKILL'); await closed;
  let gone = false;
  for (let index = 0; index < 250; index++) {
    try { process.kill(worker, 0); }
    catch (error) { if (error.code === 'ESRCH') { gone = true; break; } throw error; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(gone, true, 'The idle reaper must terminate its blocked native child after parent death');
});
