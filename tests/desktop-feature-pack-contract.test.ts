import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  checkFeaturePackManifestAgainstLock,
  compareFeaturePackVersions,
  featurePackArchiveName,
  findFeaturePackLockEntry,
  findFeaturePackPathCollision,
  isSafeFeaturePackPath,
  parseFeaturePackLock,
  parseFeaturePackManifest,
  readFeaturePackLock,
  selectFeaturePackLockEntries,
  verifyFeaturePackArchive,
} from '../desktop/host/featurePacks/featurePackContract.js';
import {
  FIXTURE_LANGUAGES,
  FIXTURE_MODEL_PATH,
  buildFixturePack,
  fixtureLock,
  fixtureManifest,
  fixturePackFiles,
  locateArchiveRecords,
  renameArchiveEntry,
  type FixturePackOptions,
} from './fixtures/featurePackFixtures.mjs';

const encoder = new TextEncoder();
const OTHER_SHA256 = 'f'.repeat(64);
const UNIX_SYMBOLIC_LINK_ATTRIBUTES = (0o120777 << 16) >>> 0;

async function fixturePack(options: FixturePackOptions = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'cats-feature-pack-'));
  const pack = await buildFixturePack(directory, options);
  const [entry] = parseFeaturePackLock(fixtureLock([pack.lockEntry])).packs;
  assert.ok(entry);
  return { ...pack, directory, entry };
}

function validLockEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'linux-stt',
    version: '1.2.0',
    minUsableVersion: '1.0.0',
    os: 'linux',
    arch: 'x64',
    url: 'https://example.invalid/releases/linux-stt-1.2.0-linux-x64.catspack',
    size: 1024,
    sha256: 'a'.repeat(64),
    unpackedSize: 4096,
    helperProtocol: 1,
    minGlibc: '2.35',
    prerequisites: ['libpulse.so.0'],
    licenses: [{ name: 'MIT', component: 'whisper.cpp' }],
    ...overrides,
  };
}

/** Patches one entry's central and local headers in place. */
function patchEntry(
  name: string,
  patch: (bytes: Buffer, central: number, local: number) => void,
): (input: Buffer) => Buffer {
  return (input) => {
    const bytes = Buffer.from(input);
    const record = locateArchiveRecords(bytes).entries.get(name);
    assert.ok(record, name);
    patch(bytes, record.central, record.local);
    return bytes;
  };
}

function patchEndRecord(patch: (bytes: Buffer, eocd: number) => void): (input: Buffer) => Buffer {
  return (input) => {
    const bytes = Buffer.from(input);
    patch(bytes, locateArchiveRecords(bytes).eocd);
    return bytes;
  };
}

function fixtureManifestJson(): Record<string, any> {
  return fixtureManifest(fixturePackFiles(), { id: 'linux-stt', version: '1.0.0', arch: 'x64' });
}

test('feature pack lock accepts schema 1 and selects the entry for this machine', () => {
  const lock = parseFeaturePackLock(fixtureLock([
    validLockEntry(),
    validLockEntry({ arch: 'arm64' }),
  ]));

  assert.equal(lock.packs.length, 2);
  assert.deepEqual(
    selectFeaturePackLockEntries(lock, 'linux', 'arm64').map((pack) => pack.arch),
    ['arm64'],
  );
  assert.deepEqual(selectFeaturePackLockEntries(lock, 'darwin', 'arm64'), []);
  assert.deepEqual(selectFeaturePackLockEntries(lock, 'linux', 'ia32'), []);
  assert.equal(findFeaturePackLockEntry(lock, 'linux-stt', 'linux', 'x64')?.arch, 'x64');
  assert.equal(findFeaturePackLockEntry(lock, 'other', 'linux', 'x64'), null);
  assert.deepEqual(parseFeaturePackLock({ schemaVersion: 1, packs: [] }).packs, []);
});

test('feature pack lock rejects the whole lock for any malformed entry', () => {
  const rejected: Array<[string, unknown]> = [
    ['an unknown schema', { schemaVersion: 2, packs: [] }],
    ['packs that are not a list', { schemaVersion: 1, packs: {} }],
    ['a plain HTTP URL', fixtureLock([validLockEntry({ url: 'http://example.com/x.catspack' })])],
    [
      'a URL with credentials',
      fixtureLock([validLockEntry({ url: 'https://user:secret@example.com/x.catspack' })]),
    ],
    ['an upper-case hash', fixtureLock([validLockEntry({ sha256: 'A'.repeat(64) })])],
    ['a short hash', fixtureLock([validLockEntry({ sha256: 'a'.repeat(63) })])],
    ['an empty archive', fixtureLock([validLockEntry({ size: 0 })])],
    ['a fractional size', fixtureLock([validLockEntry({ unpackedSize: 1.5 })])],
    ['an unimplemented helper protocol', fixtureLock([validLockEntry({ helperProtocol: 2 })])],
    [
      'a usable version above the version',
      fixtureLock([validLockEntry({ minUsableVersion: '1.3.0' })]),
    ],
    ['a prerelease version', fixtureLock([validLockEntry({ version: '1.2.0-rc.1' })])],
    ['another operating system', fixtureLock([validLockEntry({ os: 'darwin' })])],
    ['another architecture', fixtureLock([validLockEntry({ arch: 'ia32' })])],
    ['a malformed glibc version', fixtureLock([validLockEntry({ minGlibc: '2' })])],
    ['no licenses', fixtureLock([validLockEntry({ licenses: [] })])],
    [
      'a repeated prerequisite',
      fixtureLock([validLockEntry({ prerequisites: ['libpulse.so.0', 'libpulse.so.0'] })]),
    ],
    ['an unsafe pack id', fixtureLock([validLockEntry({ id: '../linux-stt' })])],
    ['two entries for one machine', fixtureLock([validLockEntry(), validLockEntry()])],
  ];
  for (const [label, lock] of rejected) {
    assert.throws(() => parseFeaturePackLock(lock), /Invalid feature pack lock/u, label);
  }
});

test('reading the feature pack lock fails closed with a reason to log', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cats-feature-pack-lock-'));
  const lockPath = join(directory, 'desktop-feature-packs.lock.json');

  const missing = await readFeaturePackLock(lockPath);
  assert.deepEqual(missing.lock.packs, []);
  assert.match(missing.problem ?? '', /could not be read/u);

  await writeFile(lockPath, '{ "schemaVersion": 1, ', 'utf8');
  const malformed = await readFeaturePackLock(lockPath);
  assert.deepEqual(malformed.lock.packs, []);
  assert.ok(malformed.problem);

  await writeFile(
    lockPath,
    JSON.stringify({ schemaVersion: 9, packs: [validLockEntry()] }),
    'utf8',
  );
  const unknown = await readFeaturePackLock(lockPath);
  assert.deepEqual(unknown.lock.packs, []);
  assert.match(unknown.problem ?? '', /unsupported schemaVersion 9/u);

  await writeFile(lockPath, JSON.stringify(fixtureLock([validLockEntry()])), 'utf8');
  const valid = await readFeaturePackLock(lockPath);
  assert.equal(valid.problem, null);
  assert.equal(valid.lock.packs[0]?.id, 'linux-stt');
});

test('feature pack names, versions and paths follow the shared contract', () => {
  assert.equal(
    featurePackArchiveName({ id: 'linux-stt', version: '1.2.0', os: 'linux', arch: 'arm64' }),
    'linux-stt-1.2.0-linux-arm64.catspack',
  );
  assert.equal(compareFeaturePackVersions('1.2.0', '1.10.0'), -1);
  assert.equal(compareFeaturePackVersions('2.0.0', '1.99.99'), 1);
  assert.equal(compareFeaturePackVersions('1.2.3', '1.2.3'), 0);

  for (const path of ['cats-stt-linux', 'models/ggml-base.bin', 'licenses/whisper.cpp.txt']) {
    assert.equal(isSafeFeaturePackPath(path), true, path);
  }
  for (const path of [
    '',
    '../evil',
    'models/../evil',
    '/etc/passwd',
    'C:/evil',
    'models\\evil',
    'models//evil',
    'models/',
    '.hidden',
    'trailing.',
    'aux.txt',
    'model\u00e9.bin',
    'a'.repeat(241),
  ]) {
    assert.equal(isSafeFeaturePackPath(path), false, JSON.stringify(path));
  }

  assert.equal(findFeaturePackPathCollision(['a/b', 'c']), null);
  assert.equal(findFeaturePackPathCollision(['Models/x.bin', 'models/X.bin']), 'models/X.bin');
  assert.equal(findFeaturePackPathCollision(['models', 'models/x.bin']), 'models/x.bin');
});

test('feature pack manifest validation covers every field', () => {
  const valid = parseFeaturePackManifest(fixtureManifestJson());
  assert.deepEqual(valid.languages, FIXTURE_LANGUAGES);
  assert.equal(valid.model.path, FIXTURE_MODEL_PATH);

  const invalid: Array<[string, (manifest: Record<string, any>) => void]> = [
    ['an unknown schema', (manifest) => { manifest.schemaVersion = 2; }],
    ['no languages', (manifest) => { manifest.languages = []; }],
    ['a missing languages field', (manifest) => { delete manifest.languages; }],
    ['an upper-case language', (manifest) => { manifest.languages = ['EN']; }],
    ['a language with a region', (manifest) => { manifest.languages = ['en-US']; }],
    ['a repeated language', (manifest) => { manifest.languages = ['en', 'en']; }],
    ['an entry missing from files', (manifest) => { manifest.entry = 'other-helper'; }],
    ['a model with another hash', (manifest) => { manifest.model.sha256 = OTHER_SHA256; }],
    ['a model missing from files', (manifest) => { manifest.model.path = 'models/other.bin'; }],
    ['a license missing from files', (manifest) => { manifest.licenses[0].path = 'x.txt'; }],
    ['no upstream', (manifest) => { manifest.upstream = []; }],
    ['a malformed upstream commit', (manifest) => { manifest.upstream[0].commit = 'main'; }],
    ['a non-boolean executable flag', (manifest) => { manifest.files[0].executable = 1; }],
    ['a negative file size', (manifest) => { manifest.files[0].size = -1; }],
    ['an unsafe file path', (manifest) => { manifest.files[0].path = '../cats-stt-linux'; }],
    [
      'a file named like the manifest',
      (manifest) => { manifest.files.push({ ...manifest.files[1], path: 'feature-pack.json' }); },
    ],
    [
      'files colliding by case',
      (manifest) => { manifest.files.push({ ...manifest.files[1], path: 'Cats-stt-linux' }); },
    ],
  ];
  for (const [label, edit] of invalid) {
    const manifest = fixtureManifestJson();
    edit(manifest);
    assert.throws(
      () => parseFeaturePackManifest(manifest),
      { name: 'FeaturePackError', stage: 'manifest', code: 'manifest_invalid' },
      label,
    );
  }

  const notExecutable = fixtureManifestJson();
  const entryFile = notExecutable.files.find(
    (file: { path: string }) => file.path === 'cats-stt-linux',
  );
  entryFile.executable = false;
  assert.throws(
    () => parseFeaturePackManifest(notExecutable),
    { stage: 'manifest', code: 'entry_not_executable' },
  );
});

test('feature pack manifest must equal its lock entry', () => {
  const manifest = parseFeaturePackManifest(fixtureManifestJson());
  const [entry] = parseFeaturePackLock(fixtureLock([validLockEntry({ version: '1.0.0' })])).packs;
  assert.ok(entry);
  checkFeaturePackManifestAgainstLock(manifest, entry);

  for (const [field, value] of [
    ['minGlibc', '2.39'],
    ['prerequisites', ['libpulse.so.0', 'libasound.so.2']],
    ['version', '1.0.1'],
  ] as const) {
    assert.throws(
      () => checkFeaturePackManifestAgainstLock({ ...manifest, [field]: value }, entry),
      { stage: 'manifest', code: 'manifest_lock_mismatch' },
      field,
    );
  }
  checkFeaturePackManifestAgainstLock(
    { ...manifest, prerequisites: [...manifest.prerequisites].reverse() },
    entry,
  );
});

test('valid stored and deflated feature packs verify against their lock', async () => {
  for (const writer of ['sync', 'streaming'] as const) {
    for (const compression of ['stored', 'deflated'] as const) {
      const label = `${writer} ${compression}`;
      const pack = await fixturePack({ compression, writer });
      const manifest = await verifyFeaturePackArchive(pack.archivePath, pack.entry);
      assert.equal(manifest.entry, 'cats-stt-linux', label);
      assert.deepEqual(manifest.languages, FIXTURE_LANGUAGES, label);
      if (compression === 'deflated') {
        assert.ok(
          pack.archiveBytes.length < pack.lockEntry.unpackedSize,
          `${label}: the fixture really deflates`,
        );
      }
      // A streaming writer leaves the local sizes to a data descriptor.
      assert.equal(
        (pack.archiveBytes.readUInt16LE(6) & 0x0008) !== 0,
        writer === 'streaming',
        `${label}: data descriptor flag`,
      );
    }
  }
});

test('feature pack archives with any AC-01 defect are rejected', async () => {
  const cases: Array<{
    label: string;
    options: FixturePackOptions;
    stage: string;
    code: string;
  }> = [
    {
      label: 'a wrong archive hash',
      options: { editLockEntry: (entry) => ({ ...entry, sha256: OTHER_SHA256 }) },
      stage: 'hash',
      code: 'archive_hash_mismatch',
    },
    {
      label: 'a wrong archive size',
      options: { editLockEntry: (entry) => ({ ...entry, size: entry.size + 1 }) },
      stage: 'hash',
      code: 'archive_size_mismatch',
    },
    {
      label: 'an extra file',
      options: { extraFiles: { 'licenses/extra.txt': encoder.encode('extra') } },
      stage: 'manifest',
      code: 'file_not_in_manifest',
    },
    {
      label: 'a missing file',
      options: { omitFiles: ['licenses/models.txt'] },
      stage: 'manifest',
      code: 'file_missing',
    },
    {
      label: 'a duplicate file',
      options: {
        extraFiles: { 'licenses/helpeX.txt': encoder.encode('MIT License (fixture)\n') },
        patchArchive: (bytes) => (
          renameArchiveEntry(bytes, 'licenses/helpeX.txt', 'licenses/helper.txt')
        ),
      },
      stage: 'extract',
      code: 'duplicate_path',
    },
    {
      label: 'a path traversal',
      options: {
        extraFiles: { 'xx/evil.txt': encoder.encode('evil') },
        patchArchive: (bytes) => renameArchiveEntry(bytes, 'xx/evil.txt', '../evil.txt'),
      },
      stage: 'extract',
      code: 'unsafe_path',
    },
    {
      label: 'an absolute path',
      options: {
        extraFiles: { 'xevil.txt': encoder.encode('evil') },
        patchArchive: (bytes) => renameArchiveEntry(bytes, 'xevil.txt', '/evil.txt'),
      },
      stage: 'extract',
      code: 'unsafe_path',
    },
    {
      label: 'a symbolic link',
      options: {
        extraFiles: { 'licenses/link.txt': encoder.encode('helper.txt') },
        attributes: { 'licenses/link.txt': { os: 3, attrs: UNIX_SYMBOLIC_LINK_ATTRIBUTES } },
      },
      stage: 'extract',
      code: 'symbolic_link',
    },
    {
      label: 'a directory entry',
      options: { extraFiles: { 'licenses/': new Uint8Array(0) } },
      stage: 'extract',
      code: 'not_a_regular_file',
    },
    {
      label: 'paths colliding by case',
      options: { extraFiles: { 'Licenses/Helper.txt': encoder.encode('other') } },
      stage: 'extract',
      code: 'colliding_path',
    },
    {
      label: 'a mismatched id',
      options: { editManifest: (manifest) => ({ ...manifest, id: 'other-pack' }) },
      stage: 'manifest',
      code: 'manifest_lock_mismatch',
    },
    {
      label: 'a mismatched architecture',
      options: { editManifest: (manifest) => ({ ...manifest, arch: 'arm64' }) },
      stage: 'manifest',
      code: 'manifest_lock_mismatch',
    },
    {
      label: 'a mismatched helper protocol',
      options: { editManifest: (manifest) => ({ ...manifest, helperProtocol: 2 }) },
      stage: 'manifest',
      code: 'unsupported_helper_protocol',
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
      stage: 'extract',
      code: 'file_hash_mismatch',
    },
    {
      label: 'a file size unlike the manifest',
      options: {
        editManifest: (manifest) => ({
          ...manifest,
          files: manifest.files.map((file: { path: string; size: number }) => (
            file.path === 'licenses/helper.txt' ? { ...file, size: file.size + 1 } : file
          )),
        }),
      },
      stage: 'extract',
      code: 'file_size_mismatch',
    },
    {
      label: 'more bytes than the lock unpacked size',
      options: { editLockEntry: (entry) => ({ ...entry, unpackedSize: 10 }) },
      stage: 'manifest',
      code: 'unpacked_size_exceeded',
    },
    {
      label: 'bytes that are not a ZIP file',
      options: { patchArchive: () => encoder.encode('not a zip file at all') },
      stage: 'extract',
      code: 'malformed_archive',
    },
  ];

  for (const { label, options, stage, code } of cases) {
    for (const compression of ['stored', 'deflated'] as const) {
      const pack = await fixturePack({ ...options, compression });
      await assert.rejects(
        verifyFeaturePackArchive(pack.archivePath, pack.entry),
        { name: 'FeaturePackError', stage, code },
        `${label} (${compression})`,
      );
    }
  }
});

test('feature pack archives outside the FR-A2 ZIP subset are rejected', async () => {
  const helperLicense = 'licenses/helper.txt';
  const cases: Array<{ label: string; options: FixturePackOptions; code: string }> = [
    {
      label: 'an unsupported compression method',
      options: {
        patchArchive: patchEntry(helperLicense, (bytes, central, local) => {
          bytes.writeUInt16LE(12, central + 10);
          bytes.writeUInt16LE(12, local + 8);
        }),
      },
      code: 'unsupported_method',
    },
    {
      label: 'an encrypted entry',
      options: {
        patchArchive: patchEntry(helperLicense, (bytes, central, local) => {
          bytes.writeUInt16LE(bytes.readUInt16LE(central + 8) | 0x0001, central + 8);
          bytes.writeUInt16LE(bytes.readUInt16LE(local + 6) | 0x0001, local + 6);
        }),
      },
      code: 'encrypted_entry',
    },
    {
      label: 'a local header named unlike its central record',
      options: {
        patchArchive: patchEntry(helperLicense, (bytes, _central, local) => {
          bytes.write('X', local + 30 + 'licenses/'.length, 'latin1');
        }),
      },
      code: 'entry_mismatch',
    },
    {
      label: 'a second disk',
      options: { patchArchive: patchEndRecord((bytes, eocd) => bytes.writeUInt16LE(1, eocd + 4)) },
      code: 'multi_disk_unsupported',
    },
    {
      label: 'a ZIP64 entry count',
      options: {
        patchArchive: patchEndRecord((bytes, eocd) => bytes.writeUInt16LE(0xffff, eocd + 10)),
      },
      code: 'zip64_unsupported',
    },
  ];
  for (const { label, options, code } of cases) {
    for (const compression of ['stored', 'deflated'] as const) {
      const pack = await fixturePack({ ...options, compression });
      await assert.rejects(
        verifyFeaturePackArchive(pack.archivePath, pack.entry),
        { name: 'FeaturePackError', stage: 'extract', code },
        `${label} (${compression})`,
      );
    }
  }

  // Overlap needs a data descriptor: without one, a central size unlike the
  // local size is already an entry mismatch.
  const overlapping = await fixturePack({
    compression: 'deflated',
    writer: 'streaming',
    patchArchive: patchEntry('feature-pack.json', (bytes, central) => {
      bytes.writeUInt32LE(bytes.readUInt32LE(central + 20) + 64, central + 20);
    }),
  });
  await assert.rejects(
    verifyFeaturePackArchive(overlapping.archivePath, overlapping.entry),
    { name: 'FeaturePackError', stage: 'extract', code: 'overlapping_entries' },
  );
});
