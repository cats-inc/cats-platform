import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { DatabaseChatStore } from '../build/server/products/chat/state/databaseStore.js';
import { databasePath } from '../build/server/products/chat/state/database/profileFormat.js';
import { openStateDatabase } from '../build/server/platform/persistence/state-db/stateDatabase.js';
import { fileDigest } from '../build/server/platform/persistence/state-db/fileDigest.js';
import { withProfileLock } from '../build/server/platform/persistence/state-db/profileLock.js';
import { canonicalDigest } from '../build/server/platform/persistence/state-db/canonicalJson.js';
import { snapshot } from './fixtures/desktop-state-snapshot.mjs';

const entry = path.resolve('build/server/index.js');
async function fixture(t, { initialized = true, options } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-state-cli 資料 ')); const stores = [];
  const file = path.join(root, 'platform/state/chat-state.local.json');
  t.after(async () => { for (const store of stores) await store.close(); await rm(root, { recursive: true, force: true, maxRetries: 10 }); });
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|SYSTEMDRIVE)$/iu.test(key)));
  Object.assign(env, { HOME: root, USERPROFILE: root, APPDATA: path.join(root, 'AppData/Roaming'), LOCALAPPDATA: path.join(root, 'AppData/Local'),
    CATS_PLATFORM_DIR: path.join(root, 'platform'), CATS_RUNTIME_BASE_URL: 'http://127.0.0.1:9', ELECTRON_RUN_AS_NODE: '1' });
  const run = async (args, command = process.execPath, extraEnv = {}, runtimeArgs = []) => {
    try { return { code: 0, ...await promisify(execFile)(command, [...runtimeArgs, entry, 'state', ...args], { cwd: root, env: { ...env, ...extraEnv }, windowsHide: true, timeout: 20_000 }) }; }
    catch (error) {
      if (typeof error.code !== 'number') throw error;
      return { code: error.code, stdout: error.stdout, stderr: error.stderr };
    }
  };
  const create = () => { const store = new DatabaseChatStore(file, options); stores.push(store); return store; };
  let digest; let legacyManifest; const raw = `${JSON.stringify(snapshot(), null, 2)}\n`;
  if (initialized) {
    await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, raw);
    const store = create(); await store.initialize(); digest = await store.logicalDigest(); await store.close();
    const db = openStateDatabase({ file: databasePath(file), mode: 'reader' });
    try { legacyManifest = path.resolve(path.dirname(file), db.meta('legacy_manifest')); } finally { db.close(); }
  }
  return { root, file, run, create, digest, legacyManifest, raw, env };
}

test('state help and missing-profile commands create no state, auth secret, listener or export', async t => {
  const { root, run } = await fixture(t, { initialized: false });
  const help = await run(['--help']); assert.equal(help.code, 0); assert.match(help.stdout, /check.*|snapshot/);
  const missing = path.join(root, 'missing-parent/profile.json');
  for (const command of ['check', 'snapshot', 'export']) {
    const result = await run([command, '--profile', missing, ...(command === 'export' ? ['--output', path.join(root, 'out.json')] : [])]);
    assert.equal(result.code, 1, result.stderr); assert.equal(JSON.parse(result.stderr).code, 'not_initialized');
    assert.doesNotMatch(result.stdout, /app.ready|ready":true/);
  }
  assert.deepEqual(await readdir(root), []);
});

test('offline check/export use configured state and preserve every active source byte', async t => {
  const { root, file, run, digest } = await fixture(t); const names = [file, databasePath(file), `${file}.database.json`];
  const before = names.map(fileDigest);
  const checked = await run(['check']); assert.equal(checked.code, 0, checked.stderr);
  assert.equal(JSON.parse(checked.stdout).result.checked, true);
  const output = path.join(root, 'logical-export.json');
  const exported = await run(['export', '--output', output]); assert.equal(exported.code, 0, exported.stderr);
  assert.equal(canonicalDigest(JSON.parse(await readFile(output, 'utf8'))), digest);
  assert.deepEqual(names.map(fileDigest), before);
  const duplicate = await run(['export', '--output', output]); assert.equal(duplicate.code, 1);
  assert.equal(canonicalDigest(JSON.parse(await readFile(output, 'utf8'))), digest);
  await assert.rejects(readdir(path.join(root, 'platform/config')), { code: 'ENOENT' });
});

test('an unsupported SQLite host reports an actionable safe error without changing state', async t => {
  const { root, file, run } = await fixture(t); const before = await readFile(file); const db = fileDigest(databasePath(file));
  const preload = path.join(root, 'no-sqlite.cjs');
  await writeFile(preload, "const original = process.getBuiltinModule; process.getBuiltinModule = function(name) { if (name === 'node:sqlite') throw Error('PRIVATE_NATIVE_DIAGNOSTIC'); return original.call(process, name); };\n");
  const result = await run(['check'], undefined, {}, ['--require', preload]);
  assert.equal(result.code, 1); assert.equal(JSON.parse(result.stderr).code, 'unsupported_sqlite');
  assert.match(JSON.parse(result.stderr).message, /supported Cats Desktop runtime/);
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_NATIVE_DIAGNOSTIC/);
  assert.deepEqual(await readFile(file), before); assert.equal(fileDigest(databasePath(file)), db);
});

test('an explicit profile overrides the configured missing default without touching it', async t => {
  const { root, file, run } = await fixture(t); const explicit = path.join(root, 'selected.json');
  await writeFile(explicit, JSON.stringify(snapshot())); const store = new DatabaseChatStore(explicit); await store.initialize(); await store.close();
  await rm(file); await rm(databasePath(file)); await rm(`${file}.database.json`);
  const checked = await run(['check', '--profile', explicit]); assert.equal(checked.code, 0, checked.stderr);
  assert.equal(JSON.parse(checked.stdout).profile, explicit);
  await assert.rejects(readFile(file), { code: 'ENOENT' });
});

test('HOME-only default selection matches the live server when USERPROFILE points elsewhere', async t => {
  const { root, run } = await fixture(t, { initialized: false }); const home = path.join(root, 'selected-home');
  const other = path.join(root, 'other-home'); const file = path.join(home, '.cats/platform/state/chat-state.local.json');
  await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(snapshot()));
  const store = new DatabaseChatStore(file); try { await store.initialize(); } finally { await store.close(); }
  const result = await run(['check'], undefined, { HOME: home, USERPROFILE: other, CATS_PLATFORM_DIR: undefined });
  assert.equal(result.code, 0, result.stderr); assert.equal(JSON.parse(result.stdout).profile, file);
  await assert.rejects(readdir(other), { code: 'ENOENT' });
});

test('offline commands reject an idle live lease before any snapshot/export/restore mutation', async t => {
  const { root, file, run, create, legacyManifest } = await fixture(t); const active = create(); await active.initialize();
  const before = await readFile(file); const names = await readdir(path.dirname(file));
  for (const args of [['check'], ['snapshot'], ['export', '--output', path.join(root, 'out.json')], ['restore', '--manifest', legacyManifest]]) {
    const result = await run(args); assert.equal(result.code, 1, result.stderr); assert.equal(JSON.parse(result.stderr).code, 'profile_busy');
  }
  assert.deepEqual(await readFile(file), before); assert.deepEqual(await readdir(path.dirname(file)), names);
  await assert.rejects(readFile(path.join(root, 'out.json')), { code: 'ENOENT' });
});

test('pending handoff check/export are read-only and never emit private record contents', async t => {
  let armed = false;
  const { root, file, run, create } = await fixture(t, { options: { checkpoint(stage) {
    if (armed && stage === 'database_committed') throw Error('Stop after isolated SQL commit');
  } } });
  const store = create(); armed = true;
  await assert.rejects(store.updateCore(core => ({ ...core, ownerProfile: { ...core.ownerProfile, displayName: 'PRIVATE_CLI_SENTINEL' } })), /Stop after isolated/);
  await store.close(); const before = await readFile(file); const dbBefore = fileDigest(databasePath(file));
  for (const args of [['check'], ['export', '--output', path.join(root, 'out.json')]]) {
    const result = await run(args); assert.equal(result.code, 1); assert.equal(JSON.parse(result.stderr).code, 'recovery_pending');
    assert.doesNotMatch(result.stderr + result.stdout, /PRIVATE_CLI_SENTINEL/);
  }
  assert.deepEqual(await readFile(file), before); assert.equal(fileDigest(databasePath(file)), dbBefore);
});

test('a pending reset blocks both CLI restore formats before changing or reviving records', async t => {
  const { file, run, legacyManifest } = await fixture(t);
  const saved = await run(['snapshot']); assert.equal(saved.code, 0, saved.stderr);
  const pair = JSON.parse(saved.stdout).result.manifest;
  await writeFile(path.join(path.dirname(file), 'platform-data-reset.pending.json'), JSON.stringify({ schemaVersion: 1, directories: [] }));
  const bytes = await readFile(file); const before = await readdir(path.dirname(file));
  for (const manifest of [legacyManifest, pair]) {
    const result = await run(['restore', '--manifest', manifest]);
    assert.equal(result.code, 1); assert.equal(JSON.parse(result.stderr).code, 'reset_pending');
  }
  assert.deepEqual(await readFile(file), bytes); assert.deepEqual(await readdir(path.dirname(file)), before);
});

test('SIGINT cancels the actual legacy-restore CLI while another operation still holds its profile lock', { timeout: 30_000 }, async t => {
  const { root, file, env, legacyManifest } = await fixture(t); const before = await readFile(file);
  // Windows cannot deliver POSIX SIGINT to a Node child. A private test-only IPC
  // preload emits the same process event after its actual lock candidate appears.
  const preload = path.join(root, 'signal.cjs');
  await writeFile(preload, "process.on('message', value => { if (value?.type === 'fixture.sigint') process.emit('SIGINT'); }); process.channel?.unref();\n");
  await withProfileLock(file, async () => {
    const child = spawn(process.execPath, ['--require', preload, entry, 'state', 'restore', '--manifest', legacyManifest],
      { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; }); child.stdout.resume();
    const exited = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code)); });
    try {
      for (let i = 0; ; i++) {
        const names = (await readdir(path.dirname(file))).filter(name => name.startsWith(`${path.basename(file)}.operation-lock.`) && name.endsWith('.owner'));
        let waiting = false;
        for (const name of names) {
          const owner = await readFile(path.join(path.dirname(file), name), 'utf8').then(JSON.parse).catch(() => null);
          if (owner?.pid === child.pid) waiting = true;
        }
        if (waiting) break;
        if (child.exitCode !== null || i > 1000) throw Error('The isolated CLI never reached its lock wait');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      child.send({ type: 'fixture.sigint' });
      const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
      try { assert.equal(await exited, 130); } finally { clearTimeout(timeout); }
      assert.equal(JSON.parse(stderr).code, 'cancelled');
      assert.deepEqual(await readFile(file), before);
      await assert.rejects(readFile(`${file}.state-db-restore.json`), { code: 'ENOENT' });
    } finally { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await exited; }
  });
});

test('actual CLI snapshots, paired restore and legacy rollback follow their selected manifests', async t => {
  const { root, file, run, create, digest, legacyManifest, raw } = await fixture(t);
  const saved = await run(['snapshot']); assert.equal(saved.code, 0, saved.stderr);
  const manifest = JSON.parse(saved.stdout).result.manifest;
  const store = create(); await store.updateCore(core => ({ ...core, ownerProfile: { ...core.ownerProfile, displayName: 'Changed after snapshot' } })); await store.close();
  const restored = await run(['restore', '--manifest', manifest]); assert.equal(restored.code, 0, restored.stderr);
  const output = path.join(root, 'restored-export.json');
  assert.equal((await run(['export', '--output', output])).code, 0);
  assert.equal(canonicalDigest(JSON.parse(await readFile(output, 'utf8'))), digest);
  const rolledBack = await run(['restore', '--manifest', legacyManifest]); assert.equal(rolledBack.code, 0, rolledBack.stderr);
  assert.equal(await readFile(file, 'utf8'), raw); await assert.rejects(readFile(databasePath(file)), { code: 'ENOENT' });
  assert.equal((await run(['check'])).code, 1);
});

test('CLI rejects invalid options and protected export paths without leaving temporary records', async t => {
  const { root, file, run } = await fixture(t); const before = await readFile(file);
  for (const args of [[], ['unknown'], ['export'], ['check', '--output', 'bad'], ['check', '--timeout-ms', '0'],
    ['snapshot', '--timeout-ms', '600001'], ['check', '--profile', file, '--profile', file]]) {
    const result = await run(args); assert.equal(result.code, 2); assert.doesNotMatch(result.stdout, /ready/);
  }
  for (const output of [file, databasePath(file), `${file}.leases/record.json`, `${file}.state-db-snapshots/record.json`]) {
    const result = await run(['export', '--output', output]); assert.equal(result.code, 1); assert.equal(JSON.parse(result.stderr).code, 'invalid_output');
  }
  assert.deepEqual(await readFile(file), before); assert.ok(!(await readdir(root)).some(name => name.endsWith('.unfinished')));
});

test('the actual shipped Electron CLI supports offline help, check and export without a Desktop window', async t => {
  const { root, run, digest } = await fixture(t); const electron = createRequire(import.meta.url)('electron');
  assert.equal((await run(['--help'], electron)).code, 0);
  const check = await run(['check'], electron); assert.equal(check.code, 0, check.stderr);
  const output = path.join(root, 'electron-export.json');
  const exported = await run(['export', '--output', output], electron); assert.equal(exported.code, 0, exported.stderr);
  assert.equal(canonicalDigest(JSON.parse(await readFile(output, 'utf8'))), digest);
});
