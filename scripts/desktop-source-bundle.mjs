#!/usr/bin/env node
// Build and verify the complete first-party source archive for a Desktop release.
// Usage: node scripts/desktop-source-bundle.mjs build --tag vX.Y.Z --platform-commit <sha>
//   --runtime-root <checkout> --runtime-commit <sha> --output <directory>
// Usage: node scripts/desktop-source-bundle.mjs verify --archive <zip> --manifest <json>
//   --checksum <file> --tag vX.Y.Z --platform-commit <sha> --runtime-commit <sha>
// build archives committed files only; it fetches the selected Apps' published provenance
// and exact Git commits, verifies their rebuilt payloads, and never publishes anything.
// verify is offline. Dependencies still require npm/network; signing keys are not included.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { unzipSync, zipSync } from 'fflate';

const execute = promisify(execFile);
const SHA = /^[a-f0-9]{40}$/;
const TAG = /^v\d+\.\d+\.\d+$/;
const MAX_BYTES = 256 * 1024 * 1024;
export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const parseJson = (bytes) => JSON.parse(Buffer.from(bytes).toString('utf8'));
const safePath = (name) => typeof name === 'string' && name.length > 0 && !name.includes('\\')
  && !name.includes(':') && !name.startsWith('/') && !/[\x00-\x1f]/.test(name)
  && name.split('/').every((part) => part && part !== '.' && part !== '..');
const pins = (apps) => apps.map(({ id, version, sha256 }) => ({ id, version, sha256 }))
  .sort((a, b) => a.id.localeCompare(b.id));

async function run(command, args, cwd, options = {}) {
  const { input, ...execOptions } = options;
  const pending = execute(command, args, { cwd, maxBuffer: MAX_BYTES, timeout: 180_000, ...execOptions });
  if (input !== undefined) pending.child.stdin.end(input);
  const result = await pending;
  return result.stdout;
}

// App revisions that build with the Platform App SDK declare it as a locked devDependency.
// Install exactly the lockfile, without lifecycle scripts, before running their builder.
export function appBuildInstallCommand(manifest, platform = process.platform) {
  if (!manifest.dependencies && !manifest.devDependencies) return null;
  const args = ['ci', '--ignore-scripts', '--no-audit', '--no-fund'];
  return platform === 'win32' ? { command: 'npm.cmd', args, shell: true } : { command: 'npm', args, shell: false };
}

export async function archiveRepository(root, commit, repository, directory) {
  assert.match(commit, SHA, 'Source commit must be immutable');
  assert.ok(safePath(directory), 'Invalid source directory');
  const tree = await run('git', ['--no-replace-objects', 'ls-tree', '-rz', '--full-tree', commit], root);
  const tracked = tree.split('\0').filter(Boolean).map((entry) => {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t([\s\S]+)$/.exec(entry);
    assert.ok(match && safePath(match[3]), 'Unsupported source entry: symlinks/submodules need explicit source handling');
    return { mode: match[1], blob: match[2], name: match[3] };
  });
  // Read blobs directly: git archive can apply autocrlf, export-ignore and
  // export-subst. None of those should alter the exact committed source bytes.
  const ids = [...new Set(tracked.map((entry) => entry.blob))];
  const packed = await run('git', ['--no-replace-objects', 'cat-file', '--batch'], root,
    { encoding: 'buffer', input: `${ids.join('\n')}\n` });
  const blobs = new Map();
  let offset = 0;
  for (const id of ids) {
    const newline = packed.indexOf(10, offset);
    assert.ok(newline >= offset, 'Incomplete Git blob header');
    const header = /^([a-f0-9]{40}) blob (\d+)$/.exec(packed.subarray(offset, newline).toString());
    assert.ok(header && header[1] === id, 'Unexpected Git blob response');
    const length = Number(header[2]);
    const start = newline + 1;
    assert.ok(Number.isSafeInteger(length) && length >= 0 && start + length < packed.length && packed[start + length] === 10, 'Incomplete Git blob');
    const bytes = packed.subarray(start, start + length);
    assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), id, 'Git blob identity mismatch');
    blobs.set(id, bytes);
    offset = start + length + 1;
  }
  assert.equal(offset, packed.length, 'Unexpected trailing Git blob data');
  const files = Object.create(null);
  for (const { name, mode, blob } of tracked) {
    files[name] = { bytes: blobs.get(blob), mode };
  }
  assert.ok(files['LICENSE'] && files['package.json'] && files['package-lock.json'], 'Repository source/license/lock missing');
  return { repository, commit, directory, files };
}

function inventory(files) {
  return Object.keys(files).sort().map((name) => [name, files[name].mode, digest(files[name].bytes)]);
}

export function createSourceBundle({ tag, repositories, apps }) {
  assert.match(tag, TAG);
  const entries = Object.create(null);
  const manifest = { schemaVersion: 1, tag, version: tag.slice(1), repositories: [], apps, plugins: [] };
  for (const repo of repositories) {
    assert.match(repo.commit, SHA);
    assert.ok(safePath(repo.directory));
    const records = inventory(repo.files);
    assert.ok(records.length > 0);
    manifest.repositories.push({ repository: repo.repository, commit: repo.commit, directory: repo.directory,
      fileCount: records.length, treeSha256: digest(jsonBytes(records)), executableFiles: records.filter((r) => r[1] === '100755').map((r) => r[0]) });
    for (const [name, file] of Object.entries(repo.files)) {
      assert.ok(safePath(name));
      const key = `${repo.directory}/${name}`;
      assert.ok(!Object.hasOwn(entries, key), 'Duplicate source path');
      entries[key] = [file.bytes, { os: 3, attrs: (parseInt(file.mode, 8) << 16) >>> 0 }];
    }
  }
  entries['sources.json'] = jsonBytes(manifest);
  entries['BUILDING.md'] = Buffer.from(`# Cats ${tag} source bundle\n\n`
    + 'This archive contains the committed Platform and Runtime trees used by all three Desktop builds, '
    + 'plus the complete Cats Apps repository at each selected App source commit. '
    + 'sources.json records commits, tree hashes, executable files and verified App artifact provenance.\n\n'
    + 'The default bundle contains no managed Plugins. cats-one is a separate launcher, not an input to this Desktop build. '
    + 'Third-party dependencies are resolved from the included lockfiles; node_modules, Git history, signing keys and user profiles are not included.\n\n'
    + 'Use the Node.js version in cats-platform/.nvmrc. From cats-runtime run npm ci and npm run build. '
    + 'From cats-platform run npm ci, npm rebuild electron, then npm run build:no-mobile. '
    + 'For a local installer run node scripts/build-desktop-installer.mjs --target current --apps-lock config/desktop-apps.lock.json --skip-mobile. '
    + 'This downloads the exact published App artifacts named by the lock, as the release workflow does. '
    + 'These local commands do not publish or grant official release identity. Network access and OS build tools are required.\n\n'
    + 'To rebuild an included App, enter its sourceDirectory from sources.json, run npm ci --ignore-scripts '
    + 'when its package.json declares dependencies, then run '
    + 'node scripts/build-app.mjs --app SLUG --version VERSION --output-dir dist. '
    + 'Compare decoded package content with the selected artifact. Revisions built with the Platform App SDK '
    + 'encoder reproduce the gzip bytes too; older revisions can differ with the Node/zlib version. '
    + 'Each repository includes its LICENSE and build instructions. ZIP tools that omit Unix modes can restore '
    + 'the executableFiles listed for each repository. Signing/notarization requires separately held credentials; '
    + 'the archive does not promise bit-identical signed installers.\n');
  return { manifest, manifestBytes: jsonBytes(manifest), archive: Buffer.from(zipSync(entries, { level: 9, mtime: new Date('2000-01-01T00:00:00Z') })) };
}

export function verifySourceBundle({ archive, manifestBytes, checksum, tag, platformCommit, runtimeCommit }) {
  assert.match(tag, TAG);
  assert.match(platformCommit, SHA);
  assert.match(runtimeCommit, SHA);
  assert.equal(checksum.trim(), `${digest(archive)}  Cats-${tag}-source.zip`, 'Source ZIP checksum mismatch');
  const entries = unzipSync(archive, { filter: (file) => {
    assert.ok(file.originalSize <= MAX_BYTES, 'Source entry too large'); return true;
  } });
  assert.deepEqual(Buffer.from(entries['sources.json'] ?? []), Buffer.from(manifestBytes), 'Inner/outer source manifest mismatch');
  const manifest = parseJson(manifestBytes);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.tag, tag);
  assert.equal(manifest.version, tag.slice(1));
  assert.deepEqual(manifest.plugins, [], 'Bundled Plugin source support must be explicit');
  const expected = [['cats-inc/cats-platform', platformCommit, 'cats-platform'], ['cats-inc/cats-runtime', runtimeCommit, 'cats-runtime']];
  assert.ok(Array.isArray(manifest.repositories) && manifest.repositories.length >= 2);
  const seen = new Set();
  const consumed = new Set(['sources.json', 'BUILDING.md']);
  assert.ok(entries['BUILDING.md']?.length);
  for (const repo of manifest.repositories) {
    assert.match(repo.commit, SHA);
    assert.ok(safePath(repo.directory) && !seen.has(repo.directory), 'Invalid/duplicate repository directory');
    seen.add(repo.directory);
    const files = Object.create(null);
    for (const [name, bytes] of Object.entries(entries)) {
      assert.ok(safePath(name), 'Unsafe source ZIP path');
      if (!name.startsWith(`${repo.directory}/`)) continue;
      assert.ok(!consumed.has(name), 'Overlapping source directories');
      consumed.add(name);
      const relative = name.slice(repo.directory.length + 1);
      files[relative] = { bytes, mode: repo.executableFiles.includes(relative) ? '100755' : '100644' };
    }
    assert.equal(Object.keys(files).length, repo.fileCount, 'Source file count mismatch');
    assert.equal(digest(jsonBytes(inventory(files))), repo.treeSha256, 'Source tree digest mismatch');
    assert.ok(files.LICENSE && files['package.json'] && files['package-lock.json'], 'Incomplete source repository');
    assert.ok(repo.executableFiles.every((name) => Object.hasOwn(files, name)), 'Missing executable source');
  }
  assert.equal(consumed.size, Object.keys(entries).length, 'Unexpected source bundle entries');
  for (const [repository, commit, directory] of expected) {
    assert.equal(manifest.repositories.filter((r) => r.repository === repository).length, 1);
    assert.ok(manifest.repositories.some((r) => r.repository === repository && r.commit === commit && r.directory === directory), 'Packaged source commit mismatch');
  }
  assert.equal(parseJson(entries['cats-platform/package.json']).version, tag.slice(1));
  const lock = parseJson(entries['cats-platform/config/desktop-apps.lock.json']);
  assert.deepEqual(pins(manifest.apps), pins(lock.apps), 'Source App set differs from Desktop selection');
  const appRoots = new Set();
  for (const app of manifest.apps) {
    assert.ok(manifest.repositories.some((r) => r.repository === 'cats-inc/cats-apps' && r.commit === app.sourceRevision && r.directory === app.sourceDirectory), 'Missing App source');
    assert.match(app.slug, /^[a-z][a-z0-9-]*$/);
    const appManifest = parseJson(entries[`${app.sourceDirectory}/apps/${app.slug}/cats.app.json`]);
    assert.equal(appManifest.id, app.id); assert.equal(appManifest.version, app.version);
    assert.equal(lock.apps.find((pin) => pin.id === app.id).artifact, app.artifact);
    assert.equal(app.payloadVerified, true, 'App source was not compared with published payload');
    appRoots.add(app.sourceDirectory);
  }
  assert.ok(manifest.repositories.every((r) => expected.some(([name]) => name === r.repository)
    || (r.repository === 'cats-inc/cats-apps' && appRoots.has(r.directory))), 'Unselected source repository');
  return manifest;
}

export function validateAppProvenance(pin, provenance) {
  const match = /^https:\/\/github\.com\/cats-inc\/cats-apps\/releases\/download\/([a-z][a-z0-9-]*)-v(\d+\.\d+\.\d+)\/\1-\2\.catsapp$/.exec(pin.artifact);
  assert.ok(match, 'App source requires an official exact release URL');
  assert.equal(match[2], pin.version);
  assert.equal(provenance.repository, 'cats-inc/cats-apps');
  assert.match(provenance.sourceRevision, SHA, 'App provenance needs an exact source commit');
  for (const key of ['id', 'version', 'sha256']) assert.equal(provenance[key], pin[key], `App provenance ${key} mismatch`);
  assert.equal(provenance.artifact, `${match[1]}-${pin.version}.catsapp`);
  return match[1];
}

async function download(url, limit) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  assert.ok(response.ok, `Download failed (${response.status}): ${url}`);
  let size = 0; const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length; assert.ok(size <= limit, 'Source input exceeds download limit'); chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function materialize(repo, root) {
  for (const [name, file] of Object.entries(repo.files)) {
    const target = path.join(root, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.bytes, { mode: parseInt(file.mode, 8) & 0o777 });
  }
}

export async function buildSourceBundle({ platformRoot, platformCommit, runtimeRoot, runtimeCommit, tag, output }) {
  const repos = [await archiveRepository(platformRoot, platformCommit, 'cats-inc/cats-platform', 'cats-platform'),
    await archiveRepository(runtimeRoot, runtimeCommit, 'cats-inc/cats-runtime', 'cats-runtime')];
  assert.equal(parseJson(repos[0].files['package.json'].bytes).version, tag.slice(1));
  const lock = parseJson(repos[0].files['config/desktop-apps.lock.json'].bytes);
  assert.equal(lock.schemaVersion, 1); assert.ok(Array.isArray(lock.apps));
  assert.equal(new Set(lock.apps.map((app) => app.id)).size, lock.apps.length, 'Duplicate App selection');
  const staging = await mkdtemp(path.join(tmpdir(), 'cats-release-sources-'));
  const apps = [];
  try {
    for (const pin of lock.apps) {
      // Validate the origin and full version before any request.
      const probe = { ...pin, artifact: path.posix.basename(pin.artifact), repository: 'cats-inc/cats-apps', sourceRevision: '0'.repeat(40) };
      validateAppProvenance(pin, probe);
      const provenance = parseJson(await download(pin.artifact.replace(/\.catsapp$/, '.provenance.json'), 1024 * 1024));
      const slug = validateAppProvenance(pin, provenance);
      const published = await download(pin.artifact, 64 * 1024 * 1024);
      assert.equal(digest(published), pin.sha256, 'Published App checksum mismatch');
      let repo = repos.find((r) => r.repository === provenance.repository && r.commit === provenance.sourceRevision);
      if (!repo) {
        const checkout = path.join(staging, provenance.sourceRevision);
        await mkdir(checkout);
        await run('git', ['init', '--quiet'], checkout);
        await run('git', ['fetch', '--quiet', '--depth=1', 'https://github.com/cats-inc/cats-apps.git', provenance.sourceRevision], checkout);
        repo = await archiveRepository(checkout, provenance.sourceRevision, provenance.repository, `cats-apps/${provenance.sourceRevision}`);
        repos.push(repo);
        await materialize(repo, checkout);
      }
      const checkout = path.join(staging, provenance.sourceRevision);
      const built = path.join(staging, `built-${slug}`);
      const install = appBuildInstallCommand(parseJson(await readFile(path.join(checkout, 'package.json'))));
      if (install) await run(install.command, install.args, checkout, { shell: install.shell, timeout: 600_000 });
      await run(process.execPath, ['scripts/build-app.mjs', '--app', slug, '--version', pin.version, '--output-dir', built], checkout);
      const rebuilt = await readFile(path.join(built, provenance.artifact));
      assert.deepEqual(gunzipSync(rebuilt, { maxOutputLength: MAX_BYTES }), gunzipSync(published, { maxOutputLength: MAX_BYTES }), 'App source does not reproduce selected payload');
      const rebuiltProvenance = parseJson(await readFile(path.join(built, `${slug}-${pin.version}.provenance.json`)));
      assert.equal(rebuiltProvenance.sourceDigest, provenance.sourceDigest, 'App source digest mismatch');
      apps.push({ ...pin, slug, sourceRevision: repo.commit, sourceDirectory: repo.directory,
        provenanceSha256: digest(jsonBytes(provenance)), sourceDigest: provenance.sourceDigest, payloadVerified: true });
    }
    const bundle = createSourceBundle({ tag, repositories: repos, apps });
    const checksum = `${digest(bundle.archive)}  Cats-${tag}-source.zip\n`;
    verifySourceBundle({ ...bundle, checksum, tag, platformCommit, runtimeCommit });
    await mkdir(output, { recursive: true });
    await writeFile(path.join(output, `Cats-${tag}-source.zip`), bundle.archive);
    await writeFile(path.join(output, `Cats-${tag}-source.zip.sha256`), checksum);
    await writeFile(path.join(output, `Cats-${tag}-sources.json`), bundle.manifestBytes);
    return bundle.manifest;
  } finally { await rm(staging, { recursive: true, force: true }); }
}

export function verifyBuildReceipts(manifest, receipts) {
  assert.equal(receipts.length, 3, 'Three OS build receipts are required');
  assert.deepEqual(receipts.map((r) => r.descriptor.platform).sort(), ['linux', 'macos', 'windows']);
  for (const receipt of receipts) {
    assert.equal(receipt.schemaVersion, 1);
    assert.equal(receipt.offlineActivation, true);
    assert.equal(receipt.platformStartup, true, 'Packaged Platform startup must pass before publication');
    assert.equal(receipt.descriptor.tag, manifest.tag);
    assert.equal(receipt.descriptor.version, manifest.version);
    assert.equal(receipt.descriptor.commit, manifest.repositories.find((r) => r.repository === 'cats-inc/cats-platform').commit);
    assert.equal(receipt.descriptor.runtimeCommit, manifest.repositories.find((r) => r.repository === 'cats-inc/cats-runtime').commit);
    assert.deepEqual(pins(receipt.apps), pins(manifest.apps), 'Installer App selection differs from source bundle');
  }
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  if (!command || command === '--help' || argv.includes('--help')) {
    console.log('Usage: desktop-source-bundle.mjs build --tag vX.Y.Z --platform-commit SHA --runtime-root PATH --runtime-commit SHA --output PATH\n       desktop-source-bundle.mjs verify --archive ZIP --manifest JSON --checksum FILE --tag vX.Y.Z --platform-commit SHA --runtime-commit SHA');
    return;
  }
  const options = {};
  const allowed = new Set(['tag', 'platform-commit', 'runtime-commit', 'runtime-root', 'output', 'archive', 'manifest', 'checksum']);
  for (let i = 0; i < argv.length; i += 2) {
    assert.ok(argv[i].startsWith('--') && allowed.has(argv[i].slice(2)) && argv[i + 1] && !argv[i + 1].startsWith('--'), 'Invalid source bundle arguments');
    options[argv[i].slice(2)] = argv[i + 1];
  }
  const shared = { tag: options.tag, platformCommit: options['platform-commit'], runtimeCommit: options['runtime-commit'] };
  assert.match(shared.tag, TAG); assert.match(shared.platformCommit, SHA); assert.match(shared.runtimeCommit, SHA);
  let result;
  if (command === 'build') result = await buildSourceBundle({ ...shared, platformRoot: process.cwd(), runtimeRoot: path.resolve(options['runtime-root']), output: path.resolve(options.output) });
  else if (command === 'verify') result = verifySourceBundle({ ...shared, archive: await readFile(options.archive), manifestBytes: await readFile(options.manifest), checksum: await readFile(options.checksum, 'utf8') });
  else throw new Error('Expected build or verify');
  console.log(JSON.stringify({ tag: result.tag, repositories: result.repositories.map(({ files, ...repo }) => repo), apps: result.apps }, null, 2));
}
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error); process.exitCode = 1; });
