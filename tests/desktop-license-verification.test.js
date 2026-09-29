import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createPackage } from '@electron/asar';
import { collectDesktopLicenses } from '../build/desktop/licenses.js';
import { verifyDesktopLicenses } from '../scripts/verify-desktop-licenses.mjs';
import { seedRuntimeNotices, seedRendererNotices } from './fixtures/desktopLicenseFixture.js';

const incompleteMitBodies = (text) => [
  text.slice(0, text.indexOf('LIABILITY, WHETHER')),
  text.replace('copies or substantial portions of the Software.', ''),
];

test('installed Desktop must retain its own licenses and notices matching the shipped Runtime bundle', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'cats-desktop-licenses-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const resources = join(root, 'resources');
  const platform = join(resources, 'app-sidecar');
  const runtime = join(resources, 'cats-runtime');
  const bundle = join(runtime, 'build/runtime');
  const host = join(root, 'host');
  for (const directory of [platform, bundle, host]) await mkdir(directory, { recursive: true });
  const license = await readFile(new URL('../LICENSE', import.meta.url));
  for (const directory of [platform, runtime, host]) await writeFile(join(directory, 'LICENSE'), license);
  await createPackage(host, join(resources, 'app.asar'));
  await writeFile(join(resources, 'desktop-package-plan.json'), JSON.stringify({ sidecarLayout: { runtime: 'bundle' } }));
  await writeFile(join(bundle, 'index.js'), 'export {};');
  await seedRuntimeNotices(bundle, 'export {};');
  const renderer = join(platform, 'build/renderer');
  await mkdir(renderer, { recursive: true });
  await writeFile(join(renderer, 'index.html'), '<html>fixture</html>');
  await seedRendererNotices(renderer);
  assert.deepEqual(await verifyDesktopLicenses(resources), {
    catsLicenses: true, rendererNotices: true, runtimeBundledNotices: true, nativeWindowsNotices: false,
  });
  for (const file of [join(platform, 'LICENSE'), join(runtime, 'LICENSE'), join(bundle, 'THIRD-PARTY-NOTICES.txt'), join(renderer, 'THIRD-PARTY-NOTICES.txt')]) {
    const original = await readFile(file);
    await rm(file);
    await assert.rejects(verifyDesktopLicenses(resources), /ENOENT/);
    await writeFile(file, 'MIT');
    await assert.rejects(verifyDesktopLicenses(resources), /license|notices/);
    await writeFile(file, original);
  }
  for (const incomplete of incompleteMitBodies(license.toString('utf8'))) {
    await writeFile(join(runtime, 'LICENSE'), incomplete);
    await assert.rejects(verifyDesktopLicenses(resources), /incomplete Runtime MIT license/);
  }
  await writeFile(join(runtime, 'LICENSE'), license);
  await writeFile(join(bundle, 'index.js'), 'export const changed = true;');
  await assert.rejects(verifyDesktopLicenses(resources), /stale/);
  await writeFile(join(resources, 'desktop-package-plan.json'), JSON.stringify({ sidecarLayout: { runtime: 'split' } }));
  assert.deepEqual(await verifyDesktopLicenses(resources), {
    catsLicenses: true, rendererNotices: true, runtimeBundledNotices: false, nativeWindowsNotices: false,
  });
  await writeFile(join(renderer, 'index.html'), '<html>changed</html>');
  await assert.rejects(verifyDesktopLicenses(resources), /Renderer.*stale/);
  await seedRendererNotices(renderer);
  await writeFile(join(host, 'LICENSE'), Buffer.concat([license, Buffer.from('\nDifferent license identity\n')]));
  await createPackage(host, join(resources, 'app.asar'));
  await assert.rejects(verifyDesktopLicenses(resources), /same Cats license/);
});

test('staging captures complete license bytes and rejects missing or stale Runtime build notices', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'cats-stage-licenses-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const platform = join(root, 'platform');
  const runtime = join(root, 'runtime');
  const bundle = join(runtime, 'build/runtime-bundle');
  for (const directory of [platform, bundle]) await mkdir(directory, { recursive: true });
  const license = new URL('../LICENSE', import.meta.url);
  await cp(license, join(platform, 'LICENSE'));
  await cp(license, join(runtime, 'LICENSE'));
  const renderer = join(platform, 'build/renderer');
  await mkdir(renderer, { recursive: true });
  await writeFile(join(renderer, 'index.html'), '<html>fixture</html>');
  await assert.rejects(collectDesktopLicenses(platform, runtime, 'split'), /ENOENT/);
  await seedRendererNotices(renderer);
  assert.equal((await collectDesktopLicenses(platform, runtime, 'split')).length, 2);
  for (const incomplete of incompleteMitBodies(await readFile(license, 'utf8'))) {
    await writeFile(join(runtime, 'LICENSE'), incomplete);
    await assert.rejects(collectDesktopLicenses(platform, runtime, 'split'), /incomplete .* MIT license/);
  }
  // Different line endings/wrapping and copyright text remain valid; copy bytes verbatim.
  const wrapped = (await readFile(license, 'utf8')).replace('sammykenny2 and contributors', 'Example contributors')
    .replaceAll('\n', '\r\n');
  await writeFile(join(runtime, 'LICENSE'), wrapped);
  const split = await collectDesktopLicenses(platform, runtime, 'split');
  assert.deepEqual(split[1].bytes, Buffer.from(wrapped));
  await writeFile(join(bundle, 'index.js'), 'export {};');
  await assert.rejects(collectDesktopLicenses(platform, runtime, 'bundle'), /ENOENT/);
  await seedRuntimeNotices(bundle, 'export {};');
  const assets = await collectDesktopLicenses(platform, runtime, 'bundle');
  assert.equal(assets.length, 4);
  for (const asset of assets) assert.deepEqual(asset.bytes, await readFile(asset.source));
  await writeFile(join(renderer, 'unexpected.js'), 'alert(1);');
  await assert.rejects(collectDesktopLicenses(platform, runtime, 'split'), /Renderer.*stale/);
  await rm(join(renderer, 'unexpected.js'));
  await writeFile(join(bundle, 'index.js'), 'export const changed = true;');
  await assert.rejects(collectDesktopLicenses(platform, runtime, 'bundle'), /stale/);
});
