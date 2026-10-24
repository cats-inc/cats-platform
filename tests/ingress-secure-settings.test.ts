import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PlatformIngressSettingsStore, emptyIngressSettings } from '../src/platform/apps/ingressSettings.ts';
import { fixtureIngressSecrets } from './fixtures/ingressSecrets.ts';

const token = 'fixture-ngrok-token-private-12345';
const oldSettings = { schemaVersion: 2, enabled: true, provider: 'ngrok', listenPort: 0,
  authtoken: token, publicOrigin: 'https://fixture.example' };
async function fixture(t: { after(fn: () => Promise<unknown>): void }) {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-ingress-secure-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const secrets = fixtureIngressSecrets();
  const store = new PlatformIngressSettingsStore(path.join(root, 'config', 'ingress.local.json'),
    path.join(root, 'apps', 'ingress'), secrets);
  await mkdir(path.dirname(store.filename), { recursive: true });
  return { root, store, secrets };
}

test('schema 2, plaintext backups and interrupted staging migrate into verified encrypted material once', async t => {
  const { root, store, secrets } = await fixture(t);
  const original = JSON.stringify(oldSettings);
  await writeFile(store.filename, original);
  const backup = `${store.filename}.${randomUUID()}.bak`;
  const staging = `${store.filename}.${randomUUID()}.tmp`;
  await writeFile(backup, original); await writeFile(staging, original.slice(0, -5));
  await mkdir(store.legacyDirectory, { recursive: true });
  const legacyFile = path.join(store.legacyDirectory, 'test.one.json');
  await writeFile(legacyFile, JSON.stringify({ schemaVersion: 1, enabled: true, authtoken: token }));
  const migrated = await store.read(); assert.ok(migrated);
  assert.equal(migrated.schemaVersion, 3); assert.equal(migrated.autoConnect, true);
  assert.equal(await store.credential(migrated), token);
  assert.equal((await readFile(store.filename, 'utf8')).includes(token), false);
  for (const file of [backup, staging, legacyFile]) await assert.rejects(readFile(file), { code: 'ENOENT' });
  const files = await readdir(root, { recursive: true, withFileTypes: true });
  for (const file of files.filter(entry => entry.isFile())) {
    assert.equal((await readFile(path.join(file.parentPath, file.name), 'utf8')).includes(token), false);
  }
  const vaultFiles = await readdir(store.vaultDirectory);
  const records = await Promise.all(vaultFiles.map(async name => JSON.parse(await readFile(path.join(store.vaultDirectory, name), 'utf8'))));
  const backupRecord = records.find(record => record.purpose === 'backup'); assert.ok(backupRecord);
  const recovered = JSON.parse(await secrets.unseal('backup', backupRecord.ciphertext));
  assert.equal(recovered.find((item: { filename: string }) => item.filename === store.filename).contents, original);
  assert.deepEqual(await store.read(), migrated);
  assert.deepEqual(await readdir(store.vaultDirectory), vaultFiles);
});

test('unavailable secure storage and unknown active schema leave original settings untouched', async t => {
  const { store } = await fixture(t); const original = JSON.stringify(oldSettings);
  await writeFile(store.filename, original);
  const unavailable = new PlatformIngressSettingsStore(store.filename, store.legacyDirectory);
  await assert.rejects(unavailable.read(), /secure_storage_unavailable/);
  assert.equal(await readFile(store.filename, 'utf8'), original);
  await writeFile(store.filename, '{"schemaVersion":999,"preserve":"original"}');
  await assert.rejects(store.read(), /recovery/);
  assert.equal(await readFile(store.filename, 'utf8'), '{"schemaVersion":999,"preserve":"original"}');
});

test('failed atomic replacement preserves plaintext and journal, then restart resumes the validated transaction', async t => {
  const { store, secrets } = await fixture(t); const original = JSON.stringify(oldSettings);
  await writeFile(store.filename, original);
  const rename = fs.rename;
  const failure = t.mock.method(fs, 'rename', async (...args: Parameters<typeof rename>) => {
    if (args[1] === store.filename) throw new Error('fixture_write_failure');
    return rename(...args);
  });
  syncBuiltinESMExports();
  try { await assert.rejects(store.read(), /recovery/); }
  finally { failure.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(await readFile(store.filename, 'utf8'), original);
  const journal = JSON.parse(await readFile(store.filename + '.migration.json', 'utf8'));
  assert.equal(JSON.stringify(journal).includes(token), false);
  const restart = new PlatformIngressSettingsStore(store.filename, store.legacyDirectory, secrets);
  const recovered = await restart.read(); assert.ok(recovered);
  assert.equal(await restart.credential(recovered), token);
  await assert.rejects(readFile(store.filename + '.migration.json'), { code: 'ENOENT' });
});

test('partial retirement resumes without overwriting active settings or losing the encrypted original', async t => {
  const { store } = await fixture(t);
  await writeFile(store.filename, JSON.stringify(oldSettings));
  const backup = `${store.filename}.${randomUUID()}.bak`;
  await writeFile(backup, JSON.stringify(oldSettings));
  const unlink = fs.unlink;
  const failure = t.mock.method(fs, 'unlink', async (filename: Parameters<typeof unlink>[0]) => {
    if (filename === backup) throw new Error('fixture_cleanup_failure');
    return unlink(filename);
  });
  syncBuiltinESMExports();
  try { await assert.rejects(store.read(), /recovery/); }
  finally { failure.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(JSON.parse(await readFile(store.filename, 'utf8')).schemaVersion, 3);
  assert.ok((await readFile(backup, 'utf8')).includes(token));
  const recovered = await store.read(); assert.ok(recovered);
  assert.equal(await store.credential(recovered), token);
  await assert.rejects(readFile(backup), { code: 'ENOENT' });
});

test('an interrupted journal cannot overwrite newer authoritative settings', async t => {
  const { store } = await fixture(t);
  await writeFile(store.filename, JSON.stringify(oldSettings));
  const rename = fs.rename;
  const failure = t.mock.method(fs, 'rename', async (...args: Parameters<typeof rename>) => {
    if (args[1] === store.filename) throw new Error('fixture_write_failure');
    return rename(...args);
  });
  syncBuiltinESMExports();
  try { await assert.rejects(store.read()); }
  finally { failure.mock.restore(); syncBuiltinESMExports(); }
  const newer = JSON.stringify({ ...emptyIngressSettings, publicOrigin: 'https://newer.example' });
  await writeFile(store.filename, newer);
  await assert.rejects(store.read(), /recovery/);
  assert.equal(await readFile(store.filename, 'utf8'), newer);
});

test('resume refuses a missing credential blob before settings commit or plaintext retirement', async t => {
  const { store } = await fixture(t); const original = JSON.stringify(oldSettings);
  await writeFile(store.filename, original);
  const rename = fs.rename;
  const failure = t.mock.method(fs, 'rename', async (...args: Parameters<typeof rename>) => {
    if (args[1] === store.filename) throw new Error('fixture_write_failure');
    return rename(...args);
  });
  syncBuiltinESMExports();
  try { await assert.rejects(store.read()); }
  finally { failure.mock.restore(); syncBuiltinESMExports(); }
  const journal = JSON.parse(await readFile(store.filename + '.migration.json', 'utf8'));
  const credentialFile = path.join(store.vaultDirectory, journal.settings.credentialRef + '.json');
  const credentialBytes = await readFile(credentialFile); await fs.unlink(credentialFile);
  await assert.rejects(store.read(), /recovery/);
  assert.equal(await readFile(store.filename, 'utf8'), original);
  await writeFile(credentialFile, credentialBytes);
  assert.equal((await store.read())?.schemaVersion, 3);
});

test('unknown backup schemas remain untouched and block migration', async t => {
  const { store } = await fixture(t); const original = JSON.stringify(oldSettings);
  await writeFile(store.filename, original);
  const backup = `${store.filename}.${randomUUID()}.bak`;
  const unknown = '{"schemaVersion":999,"preserve":"original"}';
  await writeFile(backup, unknown);
  await assert.rejects(store.read(), /recovery/);
  assert.equal(await readFile(store.filename, 'utf8'), original);
  assert.equal(await readFile(backup, 'utf8'), unknown);
});
