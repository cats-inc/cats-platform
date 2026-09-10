import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeAppPackage, materializeAppSelection, parseAppLock, resolveAppLock, sha256, supportsVersion } from '#cats-app-package';

const envelope = () => ({ schemaVersion: 1, kind: 'cats-app', manifest: { id: 'cats.usage', version: '0.1.0', entrypoints: { renderer: 'renderer/index.html' } }, files: [{ path: 'renderer/index.html', base64: Buffer.from('<html><head></head><body>Usage</body></html>').toString('base64') }] });
const encode = (value) => gzipSync(Buffer.from(JSON.stringify(value)));

test('archive verifies digest, identity, renderer and bounded extraction paths', () => {
  const valid = envelope(); const bytes = encode(valid);
  const pin = { id: valid.manifest.id, version: valid.manifest.version, sha256: sha256(bytes) };
  assert.equal(decodeAppPackage(bytes, pin).files.length, 1);
  assert.throws(() => decodeAppPackage(bytes, { ...pin, sha256: '0'.repeat(64) }), /SHA-256/);
  assert.throws(() => decodeAppPackage(bytes, { ...pin, version: '0.2.0' }), /identity\/version/);
  for (const unsafe of ['../escape', '/absolute', 'C:/escape', 'a\\b', 'NUL', 'con.txt', 'a/../b', 'a//b', 'cats.app.json', '.package.json']) {
    const item = envelope(); item.files.push({ path: unsafe, base64: 'YQ==' });
    assert.throws(() => decodeAppPackage(encode(item)), /Unsafe/, unsafe);
  }
  const duplicate = envelope(); duplicate.files.push({ path: 'RENDERER/index.html', base64: 'YQ==' });
  assert.throws(() => decodeAppPackage(encode(duplicate)), /duplicate/);
  const bad64 = envelope(); bad64.files[0].base64 = 'a!';
  assert.throws(() => decodeAppPackage(encode(bad64)), /invalid/);
  const worker = envelope(); worker.manifest.entrypoints.worker = 'worker.js';
  assert.throws(() => decodeAppPackage(encode(worker)), /unsupported/);
  assert.throws(() => decodeAppPackage(Buffer.alloc(9 * 1024 * 1024)), /size limit/);
  assert.throws(() => decodeAppPackage(gzipSync(Buffer.alloc(25 * 1024 * 1024))), /buffer|length|size|larger/i);
});

test('compatibility parser rejects unsupported ranges and honors 0.x caret semantics', () => {
  for (const range of ['0.2.1', '^0.2.0', '0.2.x', '0.x']) assert.equal(supportsVersion('0.2.1', range), true, range);
  for (const range of ['^0.1.0', '^0.2.2', '*', 'latest', '>=0.1.0', '0.2.1-beta.1']) assert.equal(supportsVersion('0.2.1', range), false, range);
  assert.equal(supportsVersion('0.0.2', '^0.0.1'), false);
  assert.equal(supportsVersion('1.4.0', '^1.0.0'), true);
  assert.equal(supportsVersion('2.0.0', '^1.0.0'), false);
});

test('pin resolution produces an offline self-contained lock and rejects absent/moving/tampered inputs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cats-app-lock-test-'));
  const bytes = encode(envelope());
  const pin = { id: 'cats.usage', version: '0.1.0', sha256: sha256(bytes), artifact: 'input.catsapp' };
  const lockPath = join(directory, 'apps.lock.json');
  const save = (apps) => writeFile(lockPath, JSON.stringify({ schemaVersion: 1, apps }));
  await save([pin]);
  await assert.rejects(resolveAppLock(lockPath), /ENOENT/);
  await writeFile(join(directory, pin.artifact), bytes);
  const selected = await resolveAppLock(lockPath);
  const offlineLock = await materializeAppSelection(selected);
  const offline = await resolveAppLock(offlineLock);
  assert.equal(offline[0].sha256, pin.sha256); assert.equal(offline[0].bytes.equals(bytes), true);
  assert.equal(JSON.parse(await readFile(offlineLock, 'utf8')).apps[0].artifact, 'cats.usage-0.1.0.catsapp');
  await writeFile(join(directory, pin.artifact), encode({ ...envelope(), extra: true }));
  await assert.rejects(resolveAppLock(lockPath), /SHA-256/);
  for (const artifact of ['https://github.com/cats-inc/cats-apps/releases/latest/download/usage.catsapp', 'https://evil.example/a.catsapp', 'http://github.com/a/b']) {
    await save([{ ...pin, artifact }]); await assert.rejects(resolveAppLock(lockPath), /pinned|Unsupported/);
  }
  assert.throws(() => parseAppLock({ schemaVersion: 1, apps: [pin, pin] }), /Duplicate/);
  assert.throws(() => parseAppLock({ schemaVersion: 1, apps: [{ ...pin, sha256: '' }] }), /incomplete/);
});
