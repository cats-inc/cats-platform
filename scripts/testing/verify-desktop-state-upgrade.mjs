/**
 * Verify ADR-152 on a private isolated copy, never on the selected original profile.
 * Usage: node --import ./scripts/testing/isolate-cats-home.mjs
 *   scripts/testing/verify-desktop-state-upgrade.mjs --source=path/to/chat-state.local.json
 *   [--report=content-free-report.json]
 * Copies primary/.bak/upgrade backups, exports logical state before/after migration,
 * compares every byte in bounded memory, then validates rollback. Scratch contents are
 * removed after closing all handles. Reports contain counts, hashes and timings only.
 */
import { mkdtemp, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map(process.argv.slice(2).map(value => {
  const [key, ...rest] = value.replace(/^--/, '').split('='); return [key, rest.join('=')];
}));
if (args.has('help')) {
  console.log('Usage: node --import ./scripts/testing/isolate-cats-home.mjs scripts/testing/verify-desktop-state-upgrade.mjs --source=profile.json [--report=report.json]');
} else {
  try { await verify(); }
  catch (error) {
    console.error(JSON.stringify({ verificationFailed: true, code: error.code ?? error.name }));
    process.exitCode = 1;
  }
}

async function verify() {
  if (!args.get('source')) throw new Error('An explicit --source is required');
  const load = file => import(pathToFileURL(join(root, 'build/server', file)).href);
  const { copyDurableFile } = await load('platform/persistence/state-db/atomicFile.js');
  const { fileDigest } = await load('platform/persistence/state-db/fileDigest.js');
  const { canonicalJson } = await load('platform/persistence/state-db/canonicalJson.js');
  const { readLegacyProfileSnapshot } = await load('products/chat/state/database/legacyImport.js');
  const { DatabaseChatStore } = await load('products/chat/state/databaseStore.js');
  const { databasePath } = await load('products/chat/state/database/profileFormat.js');
  const { openStateDatabase } = await load('platform/persistence/state-db/stateDatabase.js');
  const { restoreLegacyProfile } = await load('products/chat/state/database/restoreProfile.js');
  const source = resolve(args.get('source'));
  const names = (await readdir(dirname(source))).filter(name => name === basename(source)
    || name.startsWith(`${basename(source)}.`) && name.endsWith('.bak')).sort();
  if (!names.length) throw new Error('No legacy source files found');
  const originals = names.map(name => ({ name, digest: fileDigest(join(dirname(source), name)) }));
  const scratch = await mkdtemp(join(tmpdir(), 'cats-desktop-private-upgrade-'));
  const file = join(scratch, basename(source));
  const started = performance.now(); let store;
  try {
    for (const entry of originals) {
      await copyDurableFile(join(dirname(source), entry.name), join(scratch, entry.name));
      if (fileDigest(join(scratch, entry.name)) !== entry.digest) throw new Error('Copy proof failed');
    }
    const logical = await readLegacyProfileSnapshot(file);
    const before = join(scratch, 'logical-before.json');
    const beforeFd = await open(before, 'wx', 0o600);
    try {
      let buffer = '';
      for (const token of canonicalJson(logical)) {
        buffer += token;
        if (buffer.length >= 64 * 1024) { await beforeFd.writeFile(buffer); buffer = ''; }
      }
      if (buffer) await beforeFd.writeFile(buffer);
      await beforeFd.sync();
    } finally { await beforeFd.close(); }
    const migrationStarted = performance.now();
    store = new DatabaseChatStore(file); await store.initialize();
    const migrationMs = performance.now() - migrationStarted;
    const after = join(scratch, 'logical-after.json'); await store.exportLogicalState(after);
    const byteEqual = await equalFiles(before, after);
    const beforeDigest = fileDigest(before); const afterDigest = fileDigest(after);
    if (!byteEqual) throw new Error('Logical exports differ');
    const reader = openStateDatabase({ file: databasePath(file), mode: 'reader' });
    let manifest;
    try { manifest = resolve(scratch, reader.meta('legacy_manifest')); } finally { reader.close(); }
    await store.close(); store = null;
    await restoreLegacyProfile(file, manifest);
    const restored = await readLegacyProfileSnapshot(file);
    const unchanged = originals.every(entry => fileDigest(join(dirname(source), entry.name)) === entry.digest);
    if (!unchanged) throw new Error('Original source changed externally during verification');
    const report = {
      measuredAt: new Date().toISOString(), runtime: { node: process.versions.node, electron: process.versions.electron ?? null },
      sourceFiles: originals.length, sourceVersion: logical.version,
      channels: logical.chat.channels.length,
      messages: logical.chat.channels.reduce((sum, channel) => sum + channel.messages.length, 0),
      beforeDigest, afterDigest, byteEqual, migrationMs, totalMs: performance.now() - started,
      restoredVersion: restored.version, rollbackReadable: true, originalUnchanged: unchanged,
    };
    if (args.has('report')) await writeFile(resolve(args.get('report')), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify(report));
  } finally {
    await store?.close();
    if (!resolve(scratch).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe scratch cleanup');
    await rm(scratch, { recursive: true, force: true, maxRetries: 10 });
  }
}

async function equalFiles(left, right) {
  const a = await open(left, 'r'); const b = await open(right, 'r');
  try {
    const size = (await a.stat()).size;
    if ((await b.stat()).size !== size) return false;
    const x = Buffer.allocUnsafe(64 * 1024); const y = Buffer.allocUnsafe(x.length);
    for (let offset = 0; offset < size; offset += x.length) {
      const length = Math.min(x.length, size - offset);
      for (const [fd, bytes] of [[a, x], [b, y]]) {
        let filled = 0;
        while (filled < length) {
          const result = await fd.read(bytes, filled, length - filled, offset + filled);
          if (result.bytesRead === 0) return false;
          filled += result.bytesRead;
        }
      }
      if (!x.subarray(0, length).equals(y.subarray(0, length))) return false;
    }
    return true;
  } finally { await a.close(); await b.close(); }
}
