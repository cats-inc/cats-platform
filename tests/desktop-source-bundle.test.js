import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unzipSync, zipSync } from 'fflate';
import { load } from 'js-yaml';
import { archiveRepository, createSourceBundle, verifySourceBundle, validateAppProvenance,
  verifyBuildReceipts, buildSourceBundle, digest, appBuildInstallCommand } from '../scripts/desktop-source-bundle.mjs';
import { validateSourceAssets, validateReleaseAssets } from '../scripts/validate-release-assets.mjs';

const platformCommit = 'a'.repeat(40);
const runtimeCommit = 'b'.repeat(40);
const appCommit = 'c'.repeat(40);
const tag = 'v0.5.14';
const pin = { id: 'cats.usage', version: '0.4.0', sha256: 'd'.repeat(64),
  artifact: 'https://github.com/cats-inc/cats-apps/releases/download/usage-v0.4.0/usage-0.4.0.catsapp' };
const file = (value) => ({ bytes: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)), mode: '100644' });
function repo(repository, commit, directory, files = {}) {
  return { repository, commit, directory, files: { LICENSE: file('MIT fixture'),
    'package.json': file({ version: '0.5.14' }), 'package-lock.json': file({ lockfileVersion: 3 }), ...files } };
}
function fixture() {
  const repositories = [repo('cats-inc/cats-platform', platformCommit, 'cats-platform', {
    'config/desktop-apps.lock.json': file({ schemaVersion: 1, apps: [pin] }),
    'src/not-a-build-output.txt': file('Platform source'),
  }), repo('cats-inc/cats-runtime', runtimeCommit, 'cats-runtime'),
  repo('cats-inc/cats-apps', appCommit, `cats-apps/${appCommit}`, {
    'apps/usage/cats.app.json': file({ id: pin.id, version: pin.version }),
    'scripts/build-app.mjs': { bytes: Buffer.from('/* build fixture */'), mode: '100755' },
  })];
  const apps = [{ ...pin, slug: 'usage', sourceRevision: appCommit,
    sourceDirectory: `cats-apps/${appCommit}`, payloadVerified: true }];
  const result = createSourceBundle({ tag, repositories, apps });
  return { ...result, tag, platformCommit, runtimeCommit,
    checksum: `${digest(result.archive)}  Cats-${tag}-source.zip` };
}
function receipts(manifest) {
  return ['windows', 'macos', 'linux'].map((platform) => ({ schemaVersion: 1, offlineActivation: true, platformStartup: true,
    descriptor: { tag, version: tag.slice(1), platform, commit: platformCommit, runtimeCommit }, apps: manifest.apps }));
}

test('source archive retains all selected repository trees and verifies independently', () => {
  const input = fixture();
  assert.equal(verifySourceBundle(input).repositories.length, 3);
  const entries = unzipSync(input.archive);
  assert.ok(entries['cats-platform/src/not-a-build-output.txt']);
  assert.ok(entries[`cats-apps/${appCommit}/scripts/build-app.mjs`]);
  assert.ok(entries.BUILDING === undefined);
  assert.match(Buffer.from(entries['BUILDING.md']).toString(), /npm run build:no-mobile/);
  assert.match(Buffer.from(entries['BUILDING.md']).toString(), /--apps-lock config\/desktop-apps.lock.json --skip-mobile/);
  assert.deepEqual(input.archive, fixture().archive, 'Same inputs produce stable source archive bytes');
});

test('source verification rejects wrong pins, incomplete source and unrelated contents', () => {
  const input = fixture();
  assert.throws(() => verifySourceBundle({ ...input, runtimeCommit: 'e'.repeat(40) }), /commit mismatch/);
  assert.throws(() => verifySourceBundle({ ...input, checksum: 'bad' }), /checksum mismatch/);
  for (const mutate of [
    (entries) => { delete entries['cats-runtime/LICENSE']; },
    (entries) => { entries['cats-platform/src/not-a-build-output.txt'] = Buffer.from('changed'); },
    (entries) => { entries['unselected-package.txt'] = Buffer.from('extra'); },
  ]) {
    const entries = unzipSync(input.archive); mutate(entries);
    const archive = Buffer.from(zipSync(entries));
    assert.throws(() => verifySourceBundle({ ...input, archive,
      checksum: `${digest(archive)}  Cats-${tag}-source.zip` }), /count mismatch|digest mismatch|Unexpected source/);
  }
  const changed = JSON.parse(input.manifestBytes);
  changed.apps[0].sourceRevision = runtimeCommit;
  const entries = unzipSync(input.archive);
  const manifestBytes = Buffer.from(JSON.stringify(changed)); entries['sources.json'] = manifestBytes;
  const archive = Buffer.from(zipSync(entries));
  assert.throws(() => verifySourceBundle({ ...input, archive, manifestBytes,
    checksum: `${digest(archive)}  Cats-${tag}-source.zip` }), /Missing App source/);
});

test('App provenance must match the exact selected artifact and immutable source', () => {
  const provenance = { ...pin, artifact: 'usage-0.4.0.catsapp', repository: 'cats-inc/cats-apps', sourceRevision: appCommit };
  assert.equal(validateAppProvenance(pin, provenance), 'usage');
  for (const change of [{ id: 'cats.other' }, { version: '0.4.1' }, { sha256: '0'.repeat(64) },
    { sourceRevision: null }, { sourceRevision: 'main' }, { repository: 'someone/else' }]) {
    assert.throws(() => validateAppProvenance(pin, { ...provenance, ...change }));
  }
  assert.throws(() => validateAppProvenance({ ...pin, artifact: 'http://127.0.0.1/test.catsapp' }, provenance), /official exact/);
});

test('all three actual packaged identities must match the source set', () => {
  const { manifest } = fixture();
  verifyBuildReceipts(manifest, receipts(manifest));
  assert.throws(() => verifyBuildReceipts(manifest, receipts(manifest).slice(1)), /Three OS/);
  for (const mutate of [
    (r) => { r[0].descriptor.runtimeCommit = platformCommit; },
    (r) => { r[0].descriptor.commit = runtimeCommit; },
    (r) => { r[0].descriptor.tag = 'v0.5.13'; },
    (r) => { r[0].descriptor.platform = 'macos'; },
    (r) => { r[0].apps = []; },
    (r) => { r[0].offlineActivation = false; },
    (r) => { delete r[0].platformStartup; },
  ]) { const changed = structuredClone(receipts(manifest)); mutate(changed); assert.throws(() => verifyBuildReceipts(manifest, changed)); }
});

test('published source verification requires every asset and OS receipt; updater cannot consume the source ZIP', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-source-assets-'));
  try {
    const input = fixture();
    const outputs = { [`Cats-${tag}-source.zip`]: input.archive,
      [`Cats-${tag}-sources.json`]: input.manifestBytes, [`Cats-${tag}-source.zip.sha256`]: input.checksum };
    for (const receipt of receipts(input.manifest)) outputs[`cats-build-${receipt.descriptor.platform}.json`] = JSON.stringify(receipt);
    const files = [];
    for (const [name, bytes] of Object.entries(outputs)) { const target = path.join(root, name); await writeFile(target, bytes); files.push(target); }
    await validateSourceAssets(files, { tag, platformCommit, runtimeCommit });
    await assert.rejects(validateSourceAssets(files.slice(1), { tag, platformCommit, runtimeCommit }), /Expected exactly one/);
    await assert.rejects(validateSourceAssets([...files, files[0]], { tag, platformCommit, runtimeCommit }), /Expected exactly one/);
    const result = validateReleaseAssets({ files, metadataDocuments: [{ name: 'latest-mac.yml', document: { path: `Cats-${tag}-source.zip` } }] });
    assert.ok(result.problems.some((p) => p.code === 'source_asset_used_as_update'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('committed source capture and complete builder exclude local changes, Git state and ignored files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-source-git-'));
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  try {
    const platform = path.join(root, 'platform'); const runtime = path.join(root, 'runtime');
    for (const directory of [platform, runtime]) {
      await mkdir(path.join(directory, 'config'), { recursive: true });
      await writeFile(path.join(directory, 'LICENSE'), 'MIT fixture');
      await writeFile(path.join(directory, 'package.json'), JSON.stringify({ version: tag.slice(1) }));
      await writeFile(path.join(directory, 'package-lock.json'), '{}');
      await writeFile(path.join(directory, '.gitignore'), 'ignored-local.txt\n');
      await writeFile(path.join(directory, 'config/desktop-apps.lock.json'), JSON.stringify({ schemaVersion: 1, apps: [] }));
      git(directory, 'init', '--quiet'); git(directory, 'add', '.');
      git(directory, '-c', 'user.name=Source Test', '-c', 'user.email=source@example.invalid', 'commit', '--quiet', '-m', 'source fixture');
    }
    const p = git(platform, 'rev-parse', 'HEAD'); const r = git(runtime, 'rev-parse', 'HEAD');
    await writeFile(path.join(platform, 'ignored-local.txt'), 'not source');
    await writeFile(path.join(platform, 'untracked.txt'), 'not source');
    await writeFile(path.join(platform, 'LICENSE'), 'local modification');
    const snapshot = await archiveRepository(platform, p, 'cats-inc/cats-platform', 'cats-platform');
    assert.equal(snapshot.files.LICENSE.bytes.toString(), 'MIT fixture');
    assert.equal(snapshot.files['untracked.txt'], undefined);
    const output = path.join(root, 'output');
    await buildSourceBundle({ platformRoot: platform, platformCommit: p, runtimeRoot: runtime, runtimeCommit: r, tag, output });
    const archive = await readFile(path.join(output, `Cats-${tag}-source.zip`));
    const manifestBytes = await readFile(path.join(output, `Cats-${tag}-sources.json`));
    const checksum = await readFile(path.join(output, `Cats-${tag}-source.zip.sha256`), 'utf8');
    assert.equal(verifySourceBundle({ archive, manifestBytes, checksum, tag, platformCommit: p, runtimeCommit: r }).repositories.length, 2);
    await writeFile(path.join(runtime, '.gitattributes'), 'LICENSE export-ignore\n');
    git(runtime, 'add', '.gitattributes');
    git(runtime, '-c', 'user.name=Source Test', '-c', 'user.email=source@example.invalid', 'commit', '--quiet', '-m', 'omit required source');
    const ignored = await archiveRepository(runtime, git(runtime, 'rev-parse', 'HEAD'), 'cats-inc/cats-runtime', 'cats-runtime');
    assert.equal(ignored.files.LICENSE.bytes.toString(), 'MIT fixture', 'export-ignore must not omit committed source');
    await writeFile(path.join(runtime, '.gitattributes'), 'STAMP export-subst\n');
    await writeFile(path.join(runtime, 'STAMP'), '$Format:%H$');
    git(runtime, 'add', '.');
    git(runtime, '-c', 'user.name=Source Test', '-c', 'user.email=source@example.invalid', 'commit', '--quiet', '-m', 'transformed archive');
    const substituted = git(runtime, 'rev-parse', 'HEAD');
    const exact = await archiveRepository(runtime, substituted, 'cats-inc/cats-runtime', 'cats-runtime');
    assert.equal(exact.files.STAMP.bytes.toString(), '$Format:%H$', 'export-subst must not transform committed source');
    git(runtime, 'replace', r, substituted);
    const original = await archiveRepository(runtime, r, 'cats-inc/cats-runtime', 'cats-runtime');
    assert.equal(original.files.STAMP, undefined, 'Local replace refs must not replace the pinned source');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('release workflow shares one Runtime pin and gates publication on source and packaged receipt verification', async () => {
  const workflow = load(await readFile(new URL('../.github/workflows/desktop-release.yml', import.meta.url), 'utf8'));
  const jobs = workflow.jobs;
  assert.equal(workflow.concurrency.group, 'desktop-release-${{ inputs.tag || github.ref_name }}');
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  for (const job of [jobs.build, jobs.sources]) {
    const checkout = job.steps.find((s) => s.with?.repository === 'cats-inc/cats-runtime');
    assert.equal(checkout.with.ref, '${{ needs.guard.outputs.runtime_commit }}');
  }
  assert.ok(jobs['validate-assets'].needs.includes('sources'));
  assert.ok(jobs.publish.needs.includes('validate-assets'));
  assert.ok(jobs['validate-assets'].steps.some((s) => s.run?.includes('--source-tag') && s.run.includes('--runtime-commit')));
  assert.ok(jobs.build.steps.some((s) => s.run?.includes('verify-desktop-app-bundle') && s.run.includes('--receipt')));
  assert.ok(jobs.sources.steps.some((s) => s.run?.includes('gh release upload')));
  assert.ok(jobs.publish.steps.some((s) => s.run?.includes('Complete Cats source code')));
});

test('App revisions that declare dependencies install their lockfile before rebuilding', () => {
  // Apps built before the Platform App SDK have no dependencies and rebuild directly.
  assert.equal(appBuildInstallCommand({ private: true, workspaces: ['apps/*'] }), null);
  const locked = { devDependencies: { '@cats-inc/cats-platform': '0.5.16' } };
  assert.deepEqual(appBuildInstallCommand(locked, 'linux'),
    { command: 'npm', args: ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], shell: false });
  assert.equal(appBuildInstallCommand(locked, 'win32').command, 'npm.cmd');
  const bundle = createSourceBundle({ tag, repositories: [], apps: [] });
  const building = Buffer.from(unzipSync(bundle.archive)['BUILDING.md']).toString();
  assert.match(building, /npm ci --ignore-scripts\s+when its package\.json declares dependencies/);
});
