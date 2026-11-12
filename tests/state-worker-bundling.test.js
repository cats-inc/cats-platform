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
import { archivedProfile } from './fixtures/desktop-state-archive.mjs';
import { createProfileLease } from '../build/server/products/chat/state/database/profileLease.js';
import { databasePath } from '../build/server/products/chat/state/database/profileFormat.js';
import { withProfileLock } from '../build/server/platform/persistence/state-db/profileLock.js';

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

test('the complete bundled CLI checks, snapshots, restores and exports in Node and Electron', { timeout: 300_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-bundled-state-cli-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10 }));
  const packageRoot = path.join(root, 'package'); await mkdir(packageRoot);
  await cp(new URL('../package.json', import.meta.url), path.join(packageRoot, 'package.json'));
  await cp(new URL('../packages/app-sdk', import.meta.url), path.join(packageRoot, 'packages/app-sdk'), { recursive: true });
  // Production packages remain external in the sidecar bundle. Use the exact
  // installed inputs, without installing or replacing dependencies in this probe.
  await symlink(path.resolve('node_modules'), path.join(packageRoot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const outfile = path.join(packageRoot, 'build/server/index.js'); await bundleServer({ outfile });
  const { file } = await archivedProfile(t);
  let store = new DatabaseChatStore(file); let expected;
  try { await store.initialize(); expected = await store.logicalDigest(); } finally { await store.close(); }
  for (const [name, command] of [['node', process.execPath], ['electron', createRequire(import.meta.url)('electron')]]) {
    store = new DatabaseChatStore(file);
    try { expected = await store.logicalDigest(); } finally { await store.close(); }
    const run = async args => promisify(execFile)(command, [outfile, 'state', ...args, '--profile', file], {
      cwd: packageRoot, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, timeout: 30_000,
    });
    assert.match((await run(['--help'])).stdout, /Offline commands/);
    await assert.rejects(run(['export', '--output', file]), error => error.code === 1
      && JSON.parse(error.stderr).code === 'invalid_output');
    const pair = JSON.parse((await run(['snapshot'])).stdout).result.manifest;
    store = new DatabaseChatStore(file);
    try { await store.updateCore(core => ({ ...core, ownerProfile: { ...core.ownerProfile, displayName: `After ${name} snapshot` } })); }
    finally { await store.close(); }
    const restored = JSON.parse((await run(['restore', '--manifest', pair])).stdout);
    assert.equal(restored.result.restoredVersion, 8);
    assert.equal(JSON.parse((await run(['check'])).stdout).result.checked, true);
    const output = path.join(root, `${name}-export.json`); await run(['export', '--output', output]);
    assert.equal(canonicalDigest(JSON.parse(await readFile(output, 'utf8'))), expected);
    const source = JSON.parse(await readFile(output, 'utf8')), channel = source.chat.channels[0];
    assert.equal(JSON.parse((await run(['unarchive', '--channel', channel.id])).stdout).result.archived, false);
    assert.equal(JSON.parse((await run(['archive', '--channel', channel.id])).stdout).result.archived, true);
    const archivedOutput = path.join(root, `${name}-archived-export.json`); await run(['export', '--output', archivedOutput]);
    assert.deepEqual(JSON.parse(await readFile(archivedOutput, 'utf8')).chat.channels[0].messages, channel.messages);
  }
});

test('bundled cold paging and one-time placement preparation run in actual Node and Electron', { timeout: 60_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-bundled-cold-page-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10 }));
  const packageRoot = path.join(root, 'package'); await mkdir(packageRoot);
  await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ type: 'module' }));
  await symlink(path.resolve('node_modules'), path.join(packageRoot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const outfile = path.join(packageRoot, 'build/server/index.js');
  await bundleServer({ entryPoint: fileURLToPath(new URL('../build/server/products/chat/state/database/archiveRead.js', import.meta.url)), outfile });
  const f = await archivedProfile(t);
  const lease = await withProfileLock(f.file, () => createProfileLease(f.file));
  try {
    const database = openStateDatabase({ file: databasePath(f.file), mode: 'reader' });
    let order;
    try { order = String(database.get('select order_revision from channels where id = ?', f.channelId).order_revision); }
    finally { database.close(); }
    const request = { profile: f.file, ownerLeaseToken: lease.token, channelId: f.channelId, archiveId: f.archiveId,
      manifestDigest: f.manifestDigest, orderRevision: order, limit: 50, before: 401 };
    const probe = path.join(packageRoot, 'probe.mjs');
    await writeFile(probe, `import { readArchivePage } from ${JSON.stringify(pathToFileURL(outfile).href)};
      const input = JSON.parse(process.argv[2]), signal = AbortSignal.timeout(15_000);
      const first = await readArchivePage({ ...input, basis: [{ key: JSON.stringify(['test-turn', null]), turnId: 'test-turn',
        targetStateId: null, targetId: null, createdAt: '2030-01-01T00:00:00.000Z', live: false }] }, signal);
      const next = await readArchivePage({ ...input, before: first.nextPosition }, signal);
      console.log(JSON.stringify({ total: first.total, first: first.messages[0].id, next: next.messages.at(-1).id,
        anchor: first.placements[0].anchorMessageId, electron: process.versions.electron ?? null }));`);
    for (const [name, command] of [['node', process.execPath], ['electron', createRequire(import.meta.url)('electron')]]) {
      const result = await promisify(execFile)(command, [probe, JSON.stringify(request)], {
        cwd: packageRoot, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, timeout: 20_000,
      });
      const value = JSON.parse(result.stdout);
      assert.equal(value.total, 401); assert.equal(value.first, 'cold-351'); assert.equal(value.next, 'cold-350');
      assert.equal(value.anchor, 'cold-400'); if (name === 'electron') assert.ok(value.electron);
    }
  } finally { await withProfileLock(f.file, lease); }
});
