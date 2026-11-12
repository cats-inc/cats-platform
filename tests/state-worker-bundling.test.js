import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { bundleServer } from '../scripts/bundle-server.mjs';
import { openStateDatabase } from '../build/server/platform/persistence/state-db/stateDatabase.js';
import { DatabaseChatStore } from '../build/server/products/chat/state/databaseStore.js';
import { snapshot } from './fixtures/desktop-state-snapshot.mjs';
import { canonicalDigest } from '../build/server/platform/persistence/state-db/canonicalJson.js';

test('bundled maintenance reaper/native entries run under Node and shipped Electron with attribution', { timeout: 60_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-bundled-db-worker-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10 }));
  const packageRoot = path.join(root, 'package');
  await mkdir(packageRoot);
  await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ type: 'module' }));
  const outfile = path.join(packageRoot, 'build/server/index.js');
  await bundleServer({ entryPoint: fileURLToPath(new URL('../build/server/platform/persistence/state-db/stateMaintenance.js', import.meta.url)), outfile });
  const notice = await readFile(path.join(path.dirname(outfile), 'stateMaintenanceNativeWorker.js'), 'utf8');
  assert.match(notice, /Copyright \(c\) 2026 sammykenny2 and contributors/);
  assert.match(notice, /Permission is hereby granted/);
  const probe = path.join(packageRoot, 'probe.mjs');
  await writeFile(probe, `import { runStateMaintenance } from ${JSON.stringify(pathToFileURL(outfile).href)};
    await runStateMaintenance({ kind: 'snapshot', file: process.argv[2], target: process.argv[3] });
    console.log(JSON.stringify({ ok: true, node: process.versions.node, electron: process.versions.electron ?? null }));`);
  const source = path.join(root, 'source.sqlite');
  const database = openStateDatabase({ file: source, mode: 'writer' });
  database.setMeta('bundle_fixture', 'preserved'); database.close();
  for (const [name, command] of [['node', process.execPath], ['electron', createRequire(import.meta.url)('electron')]]) {
    const target = path.join(root, `${name}.sqlite`);
    const result = await promisify(execFile)(command, [probe, source, target], {
      cwd: packageRoot, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, timeout: 15_000,
    });
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    if (name === 'electron') assert.ok(output.electron);
    const saved = openStateDatabase({ file: target, mode: 'reader' });
    try { assert.equal(saved.meta('bundle_fixture'), 'preserved'); } finally { saved.close(); }
  }
});

test('the bundled paired-snapshot coordinator runs from sidecar layout in actual Node and Electron', { timeout: 60_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-bundled-paired-snapshot-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10 }));
  const packageRoot = path.join(root, 'package'); await mkdir(packageRoot);
  await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ type: 'module' }));
  const outfile = path.join(packageRoot, 'build/server/index.js');
  await bundleServer({ entryPoint: fileURLToPath(new URL('../build/server/products/chat/state/database/profileSnapshots.js', import.meta.url)), outfile });
  const file = path.join(root, 'source-profile.json'); await writeFile(file, JSON.stringify(snapshot()));
  const store = new DatabaseChatStore(file); await store.initialize(); await store.close();
  const before = await readFile(file);
  const probe = path.join(packageRoot, 'probe.mjs');
  await writeFile(probe, `import { readFile } from 'node:fs/promises';
    import { maintainProfileSnapshot, inspectProfileSnapshot } from ${JSON.stringify(pathToFileURL(outfile).href)};
    const result = await maintainProfileSnapshot(process.argv[2], () => readFile(process.argv[2]), { force: true });
    if (result.status !== 'published') throw Error('No bundled pair was published');
    await inspectProfileSnapshot(result.directory, process.argv[2]);
    console.log(JSON.stringify({ status: result.status, node: process.versions.node, electron: process.versions.electron ?? null }));`);
  for (const [name, command] of [['node', process.execPath], ['electron', createRequire(import.meta.url)('electron')]]) {
    const result = await promisify(execFile)(command, [probe, file], {
      cwd: packageRoot, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, timeout: 15_000,
    });
    const output = JSON.parse(result.stdout); assert.equal(output.status, 'published');
    if (name === 'electron') assert.ok(output.electron);
  }
  assert.deepEqual(await readFile(file), before);
});

test('the complete bundled CLI checks, snapshots, restores and exports in Node and Electron', { timeout: 120_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-bundled-state-cli-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10 }));
  const packageRoot = path.join(root, 'package'); await mkdir(packageRoot);
  await cp(new URL('../package.json', import.meta.url), path.join(packageRoot, 'package.json'));
  await cp(new URL('../packages/app-sdk', import.meta.url), path.join(packageRoot, 'packages/app-sdk'), { recursive: true });
  // Production packages remain external in the sidecar bundle. Use the exact
  // installed inputs, without installing or replacing dependencies in this probe.
  await symlink(path.resolve('node_modules'), path.join(packageRoot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const outfile = path.join(packageRoot, 'build/server/index.js'); await bundleServer({ outfile });
  const file = path.join(root, 'profile.json'); await writeFile(file, JSON.stringify(snapshot()));
  let store = new DatabaseChatStore(file); let expected;
  try { await store.initialize(); expected = await store.logicalDigest(); } finally { await store.close(); }
  for (const [name, command] of [['node', process.execPath], ['electron', createRequire(import.meta.url)('electron')]]) {
    const run = async args => promisify(execFile)(command, [outfile, 'state', ...args, '--profile', file], {
      cwd: packageRoot, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, timeout: 30_000,
    });
    assert.match((await run(['--help'])).stdout, /Offline commands/);
    const pair = JSON.parse((await run(['snapshot'])).stdout).result.manifest;
    store = new DatabaseChatStore(file);
    try { await store.updateCore(core => ({ ...core, ownerProfile: { ...core.ownerProfile, displayName: `After ${name} snapshot` } })); }
    finally { await store.close(); }
    const restored = JSON.parse((await run(['restore', '--manifest', pair])).stdout);
    assert.equal(restored.result.restoredVersion, 8);
    assert.equal(JSON.parse((await run(['check'])).stdout).result.checked, true);
    const output = path.join(root, `${name}-export.json`); await run(['export', '--output', output]);
    assert.equal(canonicalDigest(JSON.parse(await readFile(output, 'utf8'))), expected);
  }
});
