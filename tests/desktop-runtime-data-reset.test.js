import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { preparePlatformOwnedDataReset, removePlatformOwnedData } from '../build/server/shared/platformDataReset.js';
import { completePendingRuntimeDataReset, hasPendingRuntimeDataReset } from '../build/desktop/runtimeDataReset.js';

async function fixture(t) {
  const home = await mkdtemp(path.join(tmpdir(), 'cats-runtime-reset-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const runtime = path.join(home, 'cats/runtime');
  const platform = path.join(home, 'cats/platform');
  const config = {
    catsHomeDir: path.join(home, 'cats'), userDataDir: path.join(home, 'electron'),
    packageRoot: path.join(home, 'installed/platform'), runtimePackageRoot: path.join(home, 'installed/runtime'),
    paths: { runtimeRootDir: runtime, runtimeConfigDir: path.join(runtime, 'config'),
      runtimeDataDir: path.join(runtime, 'data'), runtimeSessionBaseDir: path.join(runtime, 'sessions'),
      platformDir: platform, appStatePath: path.join(platform, 'state/chat-state.local.json'),
      hostStatePath: path.join(home, 'cats/desktop/state.json') },
  };
  const seed = async (file, text = 'keep') => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, text); };
  const runtimeFiles = [path.join(runtime, 'config/providers.yaml'), path.join(runtime, 'config/.env'),
    path.join(runtime, 'data/history/snapshot.json'), path.join(runtime, 'sessions/room/image.png')];
  const retained = [path.join(home, 'installed/bin/agy'), path.join(home, 'installed/bin/node'),
    path.join(home, '.gemini/login.json'), path.join(home, '.grok/sessions/native.json'),
    path.join(home, 'external/project/source.ts'), path.join(platform, 'apps/data/studio.json')];
  for (const file of [...runtimeFiles, ...retained]) await seed(file);
  const journal = path.join(platform, 'state/platform-data-reset.pending.json');
  return { home, config, seed, journal, runtimeFiles, retained,
    async prepare(resetRuntime) { await preparePlatformOwnedDataReset(config.paths.appStatePath, { resetRuntime }); },
    async purgePlatform() { await removePlatformOwnedData(config.paths.appStatePath, { report() {} }); } };
}

test('default reset never authorizes or touches Runtime or installed providers', async t => {
  const f = await fixture(t);
  await f.prepare(false); await f.purgePlatform();
  assert.equal(await completePendingRuntimeDataReset(f.config, { stopServices: async () => assert.fail('must stay running') }), false);
  for (const file of [...f.runtimeFiles, ...f.retained]) assert.equal(await readFile(file, 'utf8'), 'keep');
});

test('opt-in waits for Platform, stops services before deletion, and keeps installations and external files', async t => {
  const f = await fixture(t);
  await f.prepare(true);
  assert.equal(await hasPendingRuntimeDataReset(f.config), false);
  assert.equal(await completePendingRuntimeDataReset(f.config, { stopServices: async () => assert.fail('Platform is not finished') }), false);
  await f.purgePlatform();
  assert.equal(await hasPendingRuntimeDataReset(f.config), true);
  let stopped = false;
  await completePendingRuntimeDataReset(f.config, {
    stopServices: async () => { for (const file of f.runtimeFiles) await readFile(file); stopped = true; },
    remove: async (file, options) => { assert.ok(stopped); return rm(file, options); },
  });
  for (const file of [...f.runtimeFiles, f.journal]) await assert.rejects(readFile(file), { code: 'ENOENT' });
  for (const file of f.retained) assert.equal(await readFile(file, 'utf8'), 'keep');
  assert.equal(await hasPendingRuntimeDataReset(f.config), false);
});

test('failed Runtime purge retains authorization and completes on next launch without restarting old state', async t => {
  const f = await fixture(t);
  await f.prepare(true); await f.purgePlatform();
  await assert.rejects(completePendingRuntimeDataReset(f.config, { stopServices: async () => {},
    remove: async (file, options) => { if (file.endsWith('data')) throw new Error('locked fixture'); return rm(file, options); },
  }), /locked fixture/);
  assert.equal(await hasPendingRuntimeDataReset(f.config), true);
  await assert.rejects(f.prepare(false), /previously requested/);
  await completePendingRuntimeDataReset(f.config, { stopServices: async () => {} });
  for (const file of f.runtimeFiles) await assert.rejects(readFile(file), { code: 'ENOENT' });
});

test('all Runtime paths are validated before stopping or deleting, including installation overlaps', async t => {
  for (const invalid of ['escape', 'installation']) {
    const f = await fixture(t);
    await f.prepare(true); await f.purgePlatform();
    if (invalid === 'escape') f.config.paths.runtimeDataDir = path.join(f.home, 'external/project');
    else f.config.packageRoot = f.config.paths.runtimeRootDir;
    await assert.rejects(completePendingRuntimeDataReset(f.config, { stopServices: async () => assert.fail('invalid layout') }), /escapes|overlaps/);
    for (const file of f.runtimeFiles) assert.equal(await readFile(file, 'utf8'), 'keep');
    assert.equal(await hasPendingRuntimeDataReset(f.config), true);
  }
});

test('Runtime reset removes nested links without traversing an external workspace', async t => {
  const f = await fixture(t);
  await symlink(path.join(f.home, 'external/project'), path.join(f.config.paths.runtimeSessionBaseDir, 'external-link'),
    process.platform === 'win32' ? 'junction' : 'dir');
  await f.prepare(true); await f.purgePlatform();
  await completePendingRuntimeDataReset(f.config, { stopServices: async () => {} });
  assert.equal(await readFile(path.join(f.home, 'external/project/source.ts'), 'utf8'), 'keep');
});

test('redirected Runtime root is rejected and retains external data and authorization', async t => {
  const f = await fixture(t);
  await f.prepare(true); await f.purgePlatform();
  await rm(f.config.paths.runtimeRootDir, { recursive: true });
  await symlink(path.join(f.home, 'external/project'), f.config.paths.runtimeRootDir,
    process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(completePendingRuntimeDataReset(f.config, { stopServices: async () => assert.fail('redirected') }), /redirected/);
  assert.equal(await readFile(path.join(f.home, 'external/project/source.ts'), 'utf8'), 'keep');
});

test('a linked Runtime data directory is removed without erasing its external contents', async t => {
  const f = await fixture(t);
  await rm(f.config.paths.runtimeDataDir, { recursive: true });
  await symlink(path.join(f.home, 'external/project'), f.config.paths.runtimeDataDir,
    process.platform === 'win32' ? 'junction' : 'dir');
  await f.prepare(true); await f.purgePlatform();
  await completePendingRuntimeDataReset(f.config, { stopServices: async () => {} });
  assert.equal(await readFile(path.join(f.home, 'external/project/source.ts'), 'utf8'), 'keep');
  await assert.rejects(readFile(f.journal), { code: 'ENOENT' });
});

test('an invalid ready marker cannot authorize deletion', async t => {
  const f = await fixture(t);
  await f.prepare(true); await f.purgePlatform();
  await writeFile(f.journal, JSON.stringify({ schemaVersion: 1, directories: ['unfinished/evidence'], runtimeReset: 'ready' }));
  await assert.rejects(completePendingRuntimeDataReset(f.config, { stopServices: async () => assert.fail('invalid journal') }), /Platform data reset must finish/);
  for (const file of f.runtimeFiles) assert.equal(await readFile(file, 'utf8'), 'keep');
});
