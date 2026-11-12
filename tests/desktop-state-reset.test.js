import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseChatStore } from '../build/server/products/chat/state/databaseStore.js';
import { databasePath } from '../build/server/products/chat/state/database/profileFormat.js';
import { preparePlatformOwnedDataReset, removePlatformOwnedData, PlatformResetBusyError } from '../build/server/shared/platformDataReset.js';
import { snapshot } from './fixtures/desktop-state-snapshot.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-db-reset-'));
  const file = path.join(root, 'platform/state/chat-state.local.json');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(snapshot()));
  const stores = [];
  const create = (profile = file, options) => { const store = new DatabaseChatStore(profile, options); stores.push(store); return store; };
  t.after(async () => { for (const store of stores) await store.close(); await rm(root, { recursive: true, force: true }); });
  const store = create(); await store.initialize();
  return { root, file, create, store };
}

test('a second connection rejects reset before any callback, journal or metadata mutation', async t => {
  const { file, store, create } = await fixture(t);
  const other = create(); await other.initialize();
  const before = await readFile(file);
  let invoked = false;
  await assert.rejects(store.withDataReset(async () => { invoked = true; }), PlatformResetBusyError);
  assert.equal(invoked, false);
  assert.deepEqual(await readFile(file), before);
  await assert.rejects(readFile(path.join(path.dirname(file), 'platform-data-reset.pending.json')), { code: 'ENOENT' });
});

for (const removed of ['database', 'receipt']) {
  test(`startup resumes an authorized reset interrupted after ${removed} deletion`, async t => {
    const { file, store, create } = await fixture(t);
    const previousId = JSON.parse(await readFile(file, 'utf8')).storage.installationId;
    const target = removed === 'database' ? databasePath(file) : `${file}.database.json`;
    await assert.rejects(store.withDataReset(async () => {
      await preparePlatformOwnedDataReset(file, {});
      await store.removeOwnedState(() => removePlatformOwnedData(file, {
        report() {}, remove: async (entry, options) => {
          await rm(entry, options);
          if (entry === target) throw Error('interrupted purge');
        },
      }));
    }), /interrupted purge/);
    // The version-8 envelope remains, but its explicit reset journal wins over
    // ordinary missing-database admission. No legacy chat may be resurrected.
    const replacement = create(); await replacement.initialize();
    assert.equal((await replacement.read()).channels.length, 0);
    assert.equal((await replacement.readCore()).setupCompleteAt, null);
    assert.notEqual(JSON.parse(await readFile(file, 'utf8')).storage.installationId, previousId);
    assert.equal((await readdir(path.dirname(file))).some(name => name.includes('.pre-state-db-')), false);
  });
}

test('custom-name reset removes both known profiles and preserves an unrelated SQLite ledger', async t => {
  const { root, file, store } = await fixture(t);
  await store.close();
  const custom = path.join(path.dirname(file), 'custom.json');
  const unrelated = path.join(path.dirname(file), 'image-ledger.sqlite');
  await writeFile(unrelated, 'retained independent ledger');
  for (const base of [file, custom]) {
    await writeFile(`${base}.database.json`, 'old receipt');
    await mkdir(`${base}.pre-state-db-0123456789abcdef`, { recursive: true });
    await writeFile(path.join(`${base}.pre-state-db-0123456789abcdef`, 'private.json'), 'old chat');
    await writeFile(databasePath(base), 'old database');
  }
  await removePlatformOwnedData(custom, { report() {} });
  for (const base of [file, custom]) {
    await assert.rejects(readFile(databasePath(base)), { code: 'ENOENT' });
    await assert.rejects(readFile(`${base}.database.json`), { code: 'ENOENT' });
  }
  assert.equal(await readFile(unrelated, 'utf8'), 'retained independent ledger');
  assert.ok(root);
});

test('default-first startup resumes the original custom profile reset and removes both profiles', async t => {
  const { file, store, create } = await fixture(t); await store.close();
  const custom = path.join(path.dirname(file), 'custom.json');
  await writeFile(custom, JSON.stringify(snapshot()));
  const customStore = create(custom);
  await customStore.initialize();
  await assert.rejects(customStore.withDataReset(async () => {
    await preparePlatformOwnedDataReset(custom, {});
    await customStore.removeOwnedState(() => removePlatformOwnedData(custom, {
      report() {}, remove: async (entry, options) => {
        await rm(entry, options);
        if (entry === databasePath(custom)) throw Error('interrupted custom reset');
      },
    }));
  }), /interrupted custom reset/);
  await create().initialize();
  await assert.rejects(readFile(custom), { code: 'ENOENT' });
  await assert.rejects(readFile(`${custom}.database.json`), { code: 'ENOENT' });
  assert.equal((await readdir(path.dirname(file))).some(name => name.startsWith('custom.json.pre-state-db-')), false);
});

test('custom reset refuses a live default profile before changing its files', async t => {
  const { file, create } = await fixture(t);
  const custom = path.join(path.dirname(file), 'custom.json');
  await writeFile(custom, JSON.stringify(snapshot()));
  const customStore = create(custom);
  await customStore.initialize();
  const before = await readFile(custom);
  let invoked = false;
  await assert.rejects(customStore.withDataReset(async () => { invoked = true; }), PlatformResetBusyError);
  assert.equal(invoked, false);
  assert.deepEqual(await readFile(custom), before);
});

test('pending reset cannot choose a profile outside the state directory', async t => {
  const { root, file, store, create } = await fixture(t); await store.close();
  const outside = path.join(root, 'outside.json'); await writeFile(outside, 'keep');
  await writeFile(path.join(path.dirname(file), 'platform-data-reset.pending.json'), JSON.stringify({
    schemaVersion: 1, directories: [], profile: '../../outside.json',
  }));
  await assert.rejects(create().initialize(), /Invalid pending Platform reset profile/);
  assert.equal(await readFile(outside, 'utf8'), 'keep');
});

test('a Windows uppercase default filename never takes its own profile lock twice', { skip: process.platform !== 'win32' }, async t => {
  const { file, store, create } = await fixture(t); await store.close();
  // Initialize a fresh uppercase spelling, avoiding any unrelated old envelope identity.
  await removePlatformOwnedData(file, { report() {} });
  const uppercase = path.join(path.dirname(file), 'CHAT-STATE.LOCAL.JSON');
  const alias = create(uppercase, { lockTimeoutMs: 500 });
  await alias.initialize();
  let invoked = false;
  await alias.withDataReset(async () => { invoked = true; await alias.readCore(); });
  assert.equal(invoked, true);
  await alias.close();
  const ordinary = create(); await ordinary.initialize();
  await ordinary.withDataReset(async () => { await ordinary.readCore(); });
});

test('Windows case aliases also preserve imported legacy archives on reopen and reset', { skip: process.platform !== 'win32' }, async t => {
  const { file, store, create } = await fixture(t); await store.close();
  await removePlatformOwnedData(file, { report() {} });
  const uppercase = path.join(path.dirname(file), 'CHAT-STATE.LOCAL.JSON');
  await writeFile(uppercase, JSON.stringify(snapshot()));
  const alias = create(uppercase); await alias.initialize(); await alias.close();
  const ordinary = create(); await ordinary.initialize();
  assert.equal((await ordinary.read()).channels.length, 2);
  await ordinary.withDataReset(async () => {
    await preparePlatformOwnedDataReset(file, {});
    await ordinary.removeOwnedState(() => removePlatformOwnedData(file, { report() {} }));
  });
  assert.equal((await readdir(path.dirname(file))).some(name => name.toLowerCase().includes('.pre-state-db-')), false);
});

test('Windows reset deduplicates the physical primary and deletes it after every backup', { skip: process.platform !== 'win32' }, async t => {
  const { file, store } = await fixture(t); await store.close();
  const uppercase = path.join(path.dirname(file), path.basename(file).toUpperCase());
  await writeFile(`${uppercase}.OLDER.BAK`, 'prior backup');
  const removed = [];
  await removePlatformOwnedData(uppercase, { report() {}, remove: async (entry, options) => {
    removed.push(entry.toLowerCase()); await rm(entry, options);
  } });
  const primary = file.toLowerCase();
  assert.equal(removed.filter(entry => entry === primary).length, 1);
  assert.equal(removed.at(-1), primary);
});

for (const artifact of ['.leases', '.pre-state-db-0123456789abcdef']) {
  test(`Windows admission recognizes existing case-aliased recovery artifact ${artifact}`, { skip: process.platform !== 'win32' }, async t => {
    const { file, store, create } = await fixture(t); await store.close();
    await removePlatformOwnedData(file, { report() {} });
    await mkdir(`${path.join(path.dirname(file), path.basename(file).toUpperCase())}${artifact}`);
    await assert.rejects(create().initialize(), { code: 'missing_legacy_state' });
    await assert.rejects(readFile(file), { code: 'ENOENT' });
  });
}

test('Windows admission backs up uppercase upgrade files before removing them', { skip: process.platform !== 'win32' }, async t => {
  const { file, store, create } = await fixture(t); await store.close();
  await removePlatformOwnedData(file, { report() {} });
  await writeFile(file, JSON.stringify(snapshot()));
  const prior = `${path.join(path.dirname(file), path.basename(file).toUpperCase())}.PRIOR.BAK`;
  await writeFile(prior, 'Exact previous upgrade bytes');
  await create().initialize();
  const archive = (await readdir(path.dirname(file))).find(name => name.includes('.pre-state-db-'));
  const manifest = JSON.parse(await readFile(path.join(path.dirname(file), archive, 'manifest.json'), 'utf8'));
  const saved = manifest.files.find(entry => entry.kind === 'upgrade');
  assert.equal(await readFile(path.join(path.dirname(file), archive, saved.name), 'utf8'), 'Exact previous upgrade bytes');
  await assert.rejects(readFile(prior), { code: 'ENOENT' });
});
