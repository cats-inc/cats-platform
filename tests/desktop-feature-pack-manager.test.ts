import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  featurePackContract,
  parseFeaturePackLock,
  type FeaturePackLockEntry,
} from '../desktop/host/featurePacks/featurePackContract.js';
import {
  FeaturePackManager,
  createFeaturePackSystemProbe,
  type FeaturePackChange,
  type FeaturePackInstallStep,
  type FeaturePackLogRecord,
  type FeaturePackManagerOptions,
  type FeaturePackSystem,
} from '../desktop/host/featurePacks/featurePackManager.js';
import {
  buildFixturePack,
  createFixtureTransport,
  fixtureBody,
  fixtureLock,
  serveArchive,
  type FixturePackOptions,
} from './fixtures/featurePackFixtures.mjs';

const ID = 'linux-stt';
const CHUNK = 16 * 1024;
const OTHER_SHA256 = 'f'.repeat(64);
const SUPPORTED: FeaturePackSystem = {
  glibcVersion: () => '2.39',
  hasLibrary: async () => true,
  freeBytes: async () => null,
};

async function harness() {
  const base = await mkdtemp(join(tmpdir(), 'cats-feature-pack-manager-'));
  const root = join(base, 'feature-packs');
  const archives = new Map<string, Uint8Array>();
  const transport = createFixtureTransport(archives);
  const logs: FeaturePackLogRecord[] = [];
  const changes: FeaturePackChange[] = [];
  const build = async (options: FixturePackOptions = {}) => {
    const directory = await mkdtemp(join(base, 'archive-'));
    const pack = await buildFixturePack(directory, options);
    const [entry] = parseFeaturePackLock(fixtureLock([pack.lockEntry])).packs;
    assert.ok(entry);
    archives.set(entry.url, pack.archiveBytes);
    return { entry, bytes: pack.archiveBytes };
  };
  const open = async (
    entries: FeaturePackLockEntry[],
    overrides: Partial<FeaturePackManagerOptions> = {},
  ) => {
    const manager = new FeaturePackManager({
      root,
      entries,
      contract: featurePackContract,
      transport,
      system: SUPPORTED,
      log: (record) => logs.push(record),
      checkpointBytes: CHUNK,
      releaseTimeoutMs: 200,
      ...overrides,
    });
    await manager.initialize();
    manager.onChange((change) => changes.push(change));
    return manager;
  };
  const staging = () => readdir(join(root, '.staging'));
  const packDirectory = join(root, ID);
  const versionDirectory = (version: string) => join(packDirectory, `${version}-linux-x64`);
  /** Version 1.1.0, which still lets 1.0.0 dictate. */
  const buildUpdate = () => build({
    version: '1.1.0',
    editLockEntry: (lock) => ({ ...lock, minUsableVersion: '1.0.0' }),
  });
  return {
    base,
    root,
    archives,
    transport,
    logs,
    changes,
    build,
    buildUpdate,
    open,
    staging,
    packDirectory,
    versionDirectory,
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function eventually(check: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('condition not reached');
}

/** Answers the next request normally, pausing the manager once `bytes` have arrived. */
function pauseAfter(
  h: Awaited<ReturnType<typeof harness>>,
  manager: () => FeaturePackManager,
  bytes: Uint8Array,
  stop: (manager: FeaturePackManager) => Promise<void>,
) {
  h.transport.respondOnce(({ headers, signal }) => serveArchive(bytes, headers, signal, {
    onChunk: (sent) => {
      if (sent >= CHUNK) {
        void stop(manager());
      }
    },
  }));
}

test('a pack downloads, verifies and activates in the FR-B1 layout', async () => {
  const h = await harness();
  const { entry, bytes } = await h.build();
  const manager = await h.open([entry]);
  assert.equal((await manager.get(ID)).status, 'not_installed');

  await manager.download(ID);

  const snapshot = await manager.get(ID);
  assert.equal(snapshot.status, 'installed');
  assert.equal(snapshot.usable, true);
  assert.equal(snapshot.activeVersion, '1.0.0');
  assert.deepEqual(snapshot.languages, ['en', 'zh', 'ja']);
  assert.equal(snapshot.sourceHost, 'example.invalid');
  assert.equal(snapshot.downloadSize, bytes.length);
  assert.ok((snapshot.installedSize ?? 0) > 0);
  assert.deepEqual(
    [...new Set(h.changes.map((change) => change.snapshot.status))],
    ['downloading', 'verifying', 'installed'],
  );

  const versionDirectory = h.versionDirectory('1.0.0');
  const files = ['cats-stt-linux', 'feature-pack.json', '.receipt.json', 'models/ggml-fixture.bin'];
  for (const file of files) {
    assert.ok(await exists(join(versionDirectory, file)), file);
  }
  assert.deepEqual(
    JSON.parse(await readFile(join(h.packDirectory, 'active.json'), 'utf8')),
    { schemaVersion: 1, version: '1.0.0', os: 'linux', arch: 'x64' },
  );
  assert.deepEqual(await h.staging(), []);
  if (process.platform !== 'win32') {
    const mode = async (path: string) => (await lstat(path)).mode & 0o777;
    assert.equal(await mode(join(versionDirectory, 'cats-stt-linux')), 0o755);
    assert.equal(await mode(join(versionDirectory, 'models/ggml-fixture.bin')), 0o644);
    for (const directory of [h.root, join(h.root, '.staging'), h.packDirectory]) {
      assert.equal(await mode(directory), 0o700, directory);
    }
  }

  const lease = await manager.acquireHelper(ID);
  assert.ok(lease);
  assert.equal(lease.entryPath, join(versionDirectory, 'cats-stt-linux'));
  assert.deepEqual(lease.languages, ['en', 'zh', 'ja']);
  lease.release();
});

test('pausing keeps the partial download, and a 206 resume continues it', async () => {
  const h = await harness();
  const { entry, bytes } = await h.build();
  const manager = await h.open([entry]);
  pauseAfter(h, () => manager, bytes, (m) => m.pause(ID));

  await manager.download(ID);

  const paused = await manager.get(ID);
  assert.equal(paused.status, 'paused');
  assert.equal(paused.pauseReason, 'owner');
  const received = paused.receivedBytes ?? 0;
  assert.ok(received >= CHUNK && received < bytes.length, String(received));
  const sidecar = JSON.parse(await readFile(
    join(h.root, '.staging', 'linux-stt-1.0.0-linux-x64.catspack.part.json'),
    'utf8',
  ));
  assert.equal(sidecar.received, received);
  assert.equal(sidecar.sha256, entry.sha256);

  await manager.resume(ID);

  assert.equal(h.transport.requests.at(-1)?.headers.range, `bytes=${received}-`);
  assert.equal((await manager.get(ID)).status, 'installed');
});

test('download progress reaches onChange as bytes arrive', async () => {
  const h = await harness();
  const { entry, bytes } = await h.build({ modelSize: 1024 * 1024 });
  const manager = await h.open([entry]);

  await manager.download(ID);

  const progress = h.changes
    .filter((change) => change.snapshot.status === 'downloading')
    .map((change) => change.snapshot.receivedBytes ?? -1);
  assert.ok(progress.length >= 4, String(progress));
  assert.deepEqual(progress, [...progress].sort((left, right) => left - right));
  assert.ok((progress.at(-1) ?? 0) > 0 && (progress.at(-1) ?? 0) <= bytes.length);
});

test('pause and cancel also stop verification', async () => {
  for (const action of ['pause', 'cancel'] as const) {
    const h = await harness();
    const { entry, bytes } = await h.build();
    const manager = await h.open([entry]);
    const unsubscribe = manager.onChange((change) => {
      if (change.snapshot.status === 'verifying') {
        unsubscribe();
        void manager[action](ID);
      }
    });

    await manager.download(ID);

    assert.ok((await h.staging()).every((name) => !name.includes('.extract-')), action);
    assert.equal(await exists(join(h.packDirectory, 'active.json')), false, action);
    const snapshot = await manager.get(ID);
    if (action === 'pause') {
      assert.equal(snapshot.status, 'paused');
      assert.equal(snapshot.pauseReason, 'owner');
      assert.equal(snapshot.receivedBytes, bytes.length);
      const requests = h.transport.requests.length;
      await manager.resume(ID);
      assert.equal(h.transport.requests.length, requests, 'a complete partial needs no request');
      assert.equal((await manager.get(ID)).status, 'installed');
    } else {
      assert.equal(snapshot.status, 'not_installed');
      assert.deepEqual(await h.staging(), []);
    }
  }
});

test('a body that ends quietly on abort still pauses instead of installing', async () => {
  const h = await harness();
  const { entry, bytes } = await h.build();
  const manager = await h.open([entry]);
  h.transport.respondOnce(({ headers, signal }) => serveArchive(bytes, headers, signal, {
    endOnAbort: true,
    onChunk: (sent) => {
      if (sent >= CHUNK) {
        void manager.pause(ID);
      }
    },
  }));

  await manager.download(ID);

  const snapshot = await manager.get(ID);
  assert.equal(snapshot.status, 'paused');
  assert.equal(snapshot.pauseReason, 'owner');
  assert.ok((snapshot.receivedBytes ?? 0) < bytes.length);
  assert.equal(await exists(join(h.packDirectory, 'active.json')), false);
  assert.ok(
    !h.changes.some((change) => change.snapshot.status === 'verifying'),
    'a stopped download never reaches verification',
  );
});

test('a local disk failure keeps the download instead of blaming the network', async () => {
  const h = await harness();
  const { entry } = await h.build();
  const manager = await h.open([entry]);
  await mkdir(join(h.root, '.staging', 'linux-stt-1.0.0-linux-x64.catspack.part'));

  await assert.rejects(manager.download(ID), { stage: 'download', code: 'io_error' });

  const snapshot = await manager.get(ID);
  assert.equal(snapshot.status, 'not_installed');
  assert.equal(snapshot.pauseReason, null);
  assert.equal(h.transport.requests.length, 0);
});

test('a 200 answer to a resume restarts the download from zero', async () => {
  const h = await harness();
  const { entry, bytes } = await h.build();
  const manager = await h.open([entry]);
  pauseAfter(h, () => manager, bytes, (m) => m.pause(ID));
  await manager.download(ID);
  h.transport.respondOnce(({ headers, signal }) => (
    serveArchive(bytes, headers, signal, { ignoreRange: true })
  ));

  await manager.resume(ID);

  assert.match(h.transport.requests.at(-1)?.headers.range ?? '', /^bytes=\d+-$/u);
  assert.equal((await manager.get(ID)).status, 'installed');
});

test('other resume answers and dropped connections pause with reason network', async () => {
  const h = await harness();
  const { entry, bytes } = await h.build();
  const manager = await h.open([entry]);
  pauseAfter(h, () => manager, bytes, (m) => m.pause(ID));
  await manager.download(ID);
  const received = (await manager.get(ID)).receivedBytes ?? 0;

  h.transport.respondOnce(({ signal }) => ({
    status: 503,
    headers: {},
    body: fixtureBody(new Uint8Array(0), signal),
  }));
  await assert.rejects(manager.resume(ID), { stage: 'resume', code: 'unexpected_response' });
  let snapshot = await manager.get(ID);
  assert.equal(snapshot.status, 'paused');
  assert.equal(snapshot.pauseReason, 'network');
  assert.equal(snapshot.receivedBytes, received);

  h.transport.respondOnce(({ signal }) => ({
    status: 206,
    headers: { 'content-range': `bytes 0-${bytes.length - 1}/${bytes.length}` },
    body: fixtureBody(bytes, signal),
  }));
  await assert.rejects(manager.resume(ID), { stage: 'resume', code: 'unexpected_range' });
  assert.equal((await manager.get(ID)).pauseReason, 'network');

  h.transport.respondOnce(({ headers, signal }) => (
    serveArchive(bytes, headers, signal, { failAfter: CHUNK })
  ));
  await assert.rejects(manager.resume(ID), { stage: 'download', code: 'network' });
  snapshot = await manager.get(ID);
  assert.equal(snapshot.pauseReason, 'network');
  assert.ok((snapshot.receivedBytes ?? 0) > received);
  assert.ok(h.changes.some((change) => change.failure?.code === 'network'));

  await manager.resume(ID);
  assert.equal((await manager.get(ID)).status, 'installed');
});

test('a lock change discards the partial download', async () => {
  const h = await harness();
  const first = await h.build();
  const manager = await h.open([first.entry]);
  pauseAfter(h, () => manager, first.bytes, (m) => m.pause(ID));
  await manager.download(ID);
  assert.equal((await h.staging()).length, 2);

  // Same name and URL, other bytes: only the sidecar's hash tells them apart.
  const rebuilt = await h.build({
    editManifest: (manifest) => ({ ...manifest, languages: ['en'] }),
  });
  assert.equal(rebuilt.entry.url, first.entry.url);
  assert.notEqual(rebuilt.entry.sha256, first.entry.sha256);
  const restarted = await h.open([rebuilt.entry]);

  assert.deepEqual(await h.staging(), []);
  assert.equal((await restarted.get(ID)).status, 'not_installed');
});

test('a partial download survives a restart as paused (quit)', async () => {
  const h = await harness();
  const { entry, bytes } = await h.build();
  const manager = await h.open([entry]);
  pauseAfter(h, () => manager, bytes, (m) => m.shutdown());
  await manager.download(ID);
  const quit = await manager.get(ID);
  assert.equal(quit.pauseReason, 'quit');

  const restarted = await h.open([entry]);
  const snapshot = await restarted.get(ID);
  assert.equal(snapshot.status, 'paused');
  assert.equal(snapshot.pauseReason, 'quit');
  assert.equal(snapshot.receivedBytes, quit.receivedBytes);

  await restarted.resume(ID);
  assert.equal((await restarted.get(ID)).status, 'installed');
});

test('cancel and discard delete the partial download', async () => {
  const h = await harness();
  const { entry, bytes } = await h.build();
  const manager = await h.open([entry]);
  pauseAfter(h, () => manager, bytes, (m) => m.cancel(ID));
  await manager.download(ID);
  assert.equal((await manager.get(ID)).status, 'not_installed');
  assert.deepEqual(await h.staging(), []);

  pauseAfter(h, () => manager, bytes, (m) => m.pause(ID));
  await manager.download(ID);
  assert.equal((await manager.get(ID)).status, 'paused');
  await manager.cancel(ID);
  assert.equal((await manager.get(ID)).status, 'not_installed');
  assert.deepEqual(await h.staging(), []);
});

test('oversize bodies, non-HTTPS redirects and insufficient space are refused', async () => {
  const h = await harness();
  const { entry, bytes } = await h.build();
  const manager = await h.open([entry]);

  h.transport.respondOnce(({ signal }) => ({
    status: 200,
    headers: {},
    body: fixtureBody(Buffer.concat([bytes, Buffer.alloc(CHUNK)]), signal),
  }));
  await assert.rejects(manager.download(ID), { stage: 'download', code: 'oversize' });
  assert.equal((await manager.get(ID)).status, 'not_installed');
  assert.deepEqual(await h.staging(), []);

  h.transport.respondOnce(({ signal }) => ({
    status: 200,
    headers: { 'content-length': String(bytes.length + 1) },
    body: fixtureBody(bytes, signal),
  }));
  await assert.rejects(manager.download(ID), { code: 'oversize' });
  assert.deepEqual(await h.staging(), []);

  h.transport.respondOnce(({ signal }) => ({
    status: 302,
    headers: { location: 'http://example.invalid/linux-stt.catspack' },
    body: fixtureBody(new Uint8Array(0), signal),
  }));
  await assert.rejects(manager.download(ID), { stage: 'download', code: 'insecure_redirect' });
  assert.equal((await manager.get(ID)).pauseReason, 'network');

  const mirror = 'https://mirror.invalid/linux-stt.catspack';
  h.archives.set(mirror, bytes);
  h.transport.respondOnce(({ signal }) => ({
    status: 302,
    headers: { location: mirror },
    body: fixtureBody(new Uint8Array(0), signal),
  }));
  await manager.download(ID);
  assert.equal(h.transport.requests.at(-1)?.url, mirror);
  assert.equal((await manager.get(ID)).status, 'installed');

  const cramped = await harness();
  const small = await cramped.build();
  const full = await cramped.open([small.entry], {
    system: { ...SUPPORTED, freeBytes: async () => 10 },
  });
  await assert.rejects(full.download(ID), { stage: 'space', code: 'insufficient_space' });
  assert.equal(cramped.transport.requests.length, 0);
  assert.equal((await full.get(ID)).status, 'not_installed');
  assert.deepEqual(await cramped.staging(), []);
  assert.ok(cramped.changes.some((change) => change.failure?.code === 'insufficient_space'));
});

test('a hash mismatch discards the download, logs the stage and does not retry', async () => {
  const h = await harness();
  const { entry } = await h.build({ editLockEntry: (lock) => ({ ...lock, sha256: OTHER_SHA256 }) });
  const manager = await h.open([entry]);

  await assert.rejects(manager.download(ID), { stage: 'hash', code: 'archive_hash_mismatch' });

  assert.equal(h.transport.requests.length, 1);
  assert.equal((await manager.get(ID)).status, 'not_installed');
  assert.deepEqual(await h.staging(), []);
  assert.ok(h.logs.some((record) => (
    record.outcome === 'failed' && record.stage === 'hash' && record.version === '1.0.0'
  )));
});

test('archives with an AC-01 defect leave nothing activated', async () => {
  const cases: Array<{ label: string; options: FixturePackOptions; code: string }> = [
    {
      label: 'a wrong archive hash',
      options: { editLockEntry: (lock) => ({ ...lock, sha256: OTHER_SHA256 }) },
      code: 'archive_hash_mismatch',
    },
    {
      label: 'an extra file',
      options: { extraFiles: { 'licenses/extra.txt': new TextEncoder().encode('extra') } },
      code: 'file_not_in_manifest',
    },
    {
      label: 'a missing file',
      options: { omitFiles: ['licenses/models.txt'] },
      code: 'file_missing',
    },
    {
      label: 'a symbolic link',
      options: {
        extraFiles: { 'licenses/link.txt': new TextEncoder().encode('helper.txt') },
        attributes: { 'licenses/link.txt': { os: 3, attrs: (0o120777 << 16) >>> 0 } },
      },
      code: 'symbolic_link',
    },
    {
      label: 'a mismatched id',
      options: { editManifest: (manifest) => ({ ...manifest, id: 'other-pack' }) },
      code: 'manifest_lock_mismatch',
    },
    {
      label: 'a wrong file hash',
      options: {
        editManifest: (manifest) => ({
          ...manifest,
          files: manifest.files.map((file: { path: string }) => (
            file.path === 'licenses/helper.txt' ? { ...file, sha256: OTHER_SHA256 } : file
          )),
        }),
      },
      code: 'file_hash_mismatch',
    },
  ];
  for (const { label, options, code } of cases) {
    const h = await harness();
    const { entry } = await h.build(options);
    const manager = await h.open([entry]);
    await assert.rejects(manager.download(ID), { code }, label);
    assert.equal(await exists(join(h.packDirectory, 'active.json')), false, label);
    assert.deepEqual(await readdir(h.packDirectory).catch(() => []), [], label);
    assert.deepEqual(await h.staging(), [], label);
    assert.equal((await manager.acquireHelper(ID)), null, label);
  }
});

test('a crash between FR-B4 steps leaves an allowed state', async () => {
  const steps: FeaturePackInstallStep[] = ['extracted', 'renamed', 'activated', 'archive_removed'];
  for (const step of steps) {
    for (const scenario of ['fresh', 'update'] as const) {
      const label = `${scenario} ${step}`;
      const h = await harness();
      const v1 = await h.build();
      const v2 = await h.buildUpdate();
      if (scenario === 'update') {
        await (await h.open([v1.entry])).download(ID);
      }
      let crashed = () => undefined as void;
      const reached = new Promise<void>((resolve) => {
        crashed = resolve;
      });
      const crashing = await h.open([v2.entry], {
        onInstallStep: async (current) => {
          if (current === step) {
            crashed();
            await new Promise<never>(() => undefined);
          }
        },
      });
      void crashing.download(ID).catch(() => undefined);
      await reached;

      const restarted = await h.open([v2.entry]);
      const snapshot = await restarted.get(ID);
      const requestsBefore = h.transport.requests.length;
      if (step === 'extracted' || step === 'renamed') {
        assert.equal(snapshot.status, 'paused', label);
        assert.equal(snapshot.pauseReason, 'quit', label);
        assert.equal(snapshot.receivedBytes, v2.bytes.length, label);
        assert.equal(snapshot.activeVersion, scenario === 'update' ? '1.0.0' : null, label);
        assert.equal(snapshot.usable, scenario === 'update', label);
      } else {
        assert.equal(snapshot.status, 'installed', label);
        assert.equal(snapshot.activeVersion, '1.1.0', label);
        assert.deepEqual(await h.staging(), [], label);
        assert.deepEqual(
          (await readdir(h.packDirectory)).sort(),
          ['1.1.0-linux-x64', 'active.json'],
          label,
        );
      }
      const lease = await restarted.acquireHelper(ID);
      assert.equal(lease?.version ?? null, snapshot.usable ? snapshot.activeVersion : null, label);
      if (lease) {
        assert.ok(await exists(lease.entryPath), label);
        lease.release();
      }
      if (snapshot.status === 'paused') {
        await restarted.resume(ID);
        assert.equal(h.transport.requests.length, requestsBefore, `${label}: no request`);
        assert.equal((await restarted.get(ID)).status, 'installed', label);
      }
    }
  }
});

test('an older usable version dictates during an update and goes once released', async () => {
  const h = await harness();
  const v1 = await h.build();
  const v2 = await h.buildUpdate();
  await (await h.open([v1.entry])).download(ID);
  const manager = await h.open([v2.entry]);

  const before = await manager.get(ID);
  assert.equal(before.status, 'update_available');
  assert.equal(before.usable, true);
  const lease = await manager.acquireHelper(ID);
  assert.equal(lease?.version, '1.0.0');

  await manager.download(ID);
  assert.equal((await manager.get(ID)).status, 'installed');
  assert.ok(await exists(h.versionDirectory('1.0.0')), 'kept while its helper runs');
  lease?.release();
  await eventually(async () => !await exists(h.versionDirectory('1.0.0')));
});

test('an unusable active version requires an update', async () => {
  const h = await harness();
  const v1 = await h.build();
  const v2 = await h.buildUpdate();
  await (await h.open([v1.entry])).download(ID);

  for (const entry of [
    { ...v2.entry, minUsableVersion: '1.1.0' },
    { ...v2.entry, helperProtocol: 2 },
  ]) {
    const manager = await h.open([entry]);
    const snapshot = await manager.get(ID);
    assert.equal(snapshot.status, 'update_required');
    assert.equal(snapshot.usable, false);
    assert.equal(await manager.acquireHelper(ID), null);
  }
});

test('a failed start-time check or Check files marks the pack damaged', async () => {
  const h = await harness();
  const { entry } = await h.build();
  const manager = await h.open([entry]);
  await manager.download(ID);
  const model = join(h.versionDirectory('1.0.0'), 'models', 'ggml-fixture.bin');

  const intact = await manager.check(ID);
  assert.equal(intact.status, 'installed');
  assert.equal(h.changes.at(-1)?.failure, null);

  await rm(model);
  assert.equal((await manager.get(ID)).status, 'damaged');
  assert.equal(await manager.acquireHelper(ID), null);

  await manager.download(ID);
  assert.equal((await manager.get(ID)).status, 'installed');

  const bytes = await readFile(model);
  bytes[0] = (bytes[0] ?? 0) ^ 0xff;
  await writeFile(model, bytes);
  assert.equal((await manager.get(ID)).status, 'installed', 'sizes alone still match');
  const checked = await manager.check(ID);
  assert.equal(checked.status, 'damaged');
  assert.equal(h.changes.at(-1)?.failure?.code, 'file_hash_mismatch');
  assert.equal(await manager.acquireHelper(ID), null);
});

test('Remove revokes helpers and deletes only the receipt paths', async () => {
  const h = await harness();
  const { entry } = await h.build();
  const manager = await h.open([entry]);
  await manager.download(ID);
  const versionDirectory = h.versionDirectory('1.0.0');
  await writeFile(join(versionDirectory, 'notes.txt'), 'not ours');
  let revoked = 0;
  const lease = await manager.acquireHelper(ID, () => {
    revoked += 1;
    lease?.release();
  });
  assert.ok(lease);

  await manager.remove(ID);

  assert.equal(revoked, 1);
  assert.equal(await exists(join(h.packDirectory, 'active.json')), false);
  assert.deepEqual(await readdir(versionDirectory), ['notes.txt']);
  assert.equal((await manager.get(ID)).status, 'not_installed');
  assert.ok(h.logs.some((record) => (
    record.operation === 'remove' && record.outcome === 'succeeded'
  )));
});

test('startup cleanup keeps the active and lock versions and a matching partial', async () => {
  const h = await harness();
  const v1 = await h.build();
  const v2 = await h.buildUpdate();
  await (await h.open([v1.entry])).download(ID);
  const staging = join(h.root, '.staging');
  await writeFile(join(staging, 'junk.txt'), 'junk');
  await writeFile(join(staging, 'linux-stt-0.9.0-linux-x64.catspack.part'), 'old');
  await writeFile(join(staging, 'linux-stt-0.9.0-linux-x64.catspack.part.json'), '{}');
  await mkdir(join(h.versionDirectory('0.8.0'), 'models'), { recursive: true });
  await mkdir(h.versionDirectory('1.1.0'));
  await writeFile(join(h.packDirectory, 'active.json.0123.tmp'), '{}');

  const manager = await h.open([v2.entry]);

  assert.deepEqual(await h.staging(), []);
  assert.deepEqual(
    (await readdir(h.packDirectory)).sort(),
    ['1.0.0-linux-x64', '1.1.0-linux-x64', 'active.json'],
  );
  assert.equal((await manager.get(ID)).status, 'update_available');
});

test('an unsupported system refuses downloads; an undecidable check does not', async () => {
  const cases: Array<{ system: FeaturePackSystem; unsupported: unknown }> = [
    {
      system: { ...SUPPORTED, glibcVersion: () => '2.31' },
      unsupported: { reason: 'glibc', detail: '2.35' },
    },
    {
      system: { ...SUPPORTED, glibcVersion: () => null },
      unsupported: { reason: 'glibc', detail: '2.35' },
    },
    {
      system: { ...SUPPORTED, hasLibrary: async () => false },
      unsupported: { reason: 'prerequisite', detail: 'libpulse.so.0' },
    },
    { system: { ...SUPPORTED, hasLibrary: async () => null }, unsupported: null },
  ];
  for (const { system, unsupported } of cases) {
    const h = await harness();
    const { entry } = await h.build();
    const manager = await h.open([entry], { system });
    const snapshot = await manager.get(ID);
    assert.deepEqual(snapshot.unsupported, unsupported);
    if (unsupported) {
      assert.equal(snapshot.status, 'unsupported');
      await assert.rejects(manager.download(ID), { code: 'unsupported' });
      assert.equal(h.transport.requests.length, 0);
    } else {
      assert.equal(snapshot.status, 'not_installed');
    }
  }
});

test('one download runs per pack, and only lock ids are accepted', async () => {
  const h = await harness();
  const { entry } = await h.build();
  const manager = await h.open([entry]);

  const first = manager.download(ID);
  assert.equal(manager.download(ID), first);
  await assert.rejects(manager.remove(ID), { code: 'busy' });
  await assert.rejects(manager.check(ID), { code: 'busy' });
  await first;

  assert.equal(h.transport.requests.length, 1);
  assert.throws(() => manager.download('other-pack'), { code: 'unknown_pack' });
});

test('the default system probe reads glibc, the loader cache and statfs', {
  skip: process.platform !== 'linux',
}, async () => {
  const probe = createFeaturePackSystemProbe();
  const glibc = probe.glibcVersion();
  if (glibc !== null) {
    assert.match(glibc, /^\d+\.\d+/u);
  }
  assert.notEqual(await probe.hasLibrary('libc.so.6', process.arch), false);
  assert.notEqual(await probe.hasLibrary('libcats-feature-pack-missing.so.0', process.arch), true);
  assert.ok(((await probe.freeBytes(tmpdir())) ?? 0) > 0);
});
