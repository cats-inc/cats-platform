import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { collectDesktopPlugins, readDesktopPluginArchive } from '../build/desktop/pluginBundle.js';
import { resolveDesktopHostConfig } from '../build/desktop/config.js';
import { buildManagedServiceSpecs } from '../build/desktop/processSupervisor.js';
import { AGENCY_PLUGIN } from '../build/server/shared/managedPlugins.js';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

test('preview pins the production archive accepted by Runtime; release carries no plugin', () => {
  const preview = collectDesktopPlugins(packageRoot, 'preview');
  assert.equal(preview.plugins.length, 1);
  assert.equal(preview.plugins[0].sha256, AGENCY_PLUGIN.digest);
  assert.equal(preview.files.get(preview.plugins[0].artifact).length, 40_832);
  const release = collectDesktopPlugins(packageRoot, 'release');
  assert.deepEqual(release.plugins, []);
  assert.equal(release.files.size, 0);
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  assert.ok(manifest.build.extraResources.some(entry => entry.from === 'build/desktop-packaging/shared/bundled-plugins'
    && entry.to === 'app-sidecar/bundled-plugins'));
});

test('only a verified packaged preview gives both sidecars the shared installation policy', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'cats-plugin-bundle-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = resolveDesktopHostConfig({ env: {}, packaged: true, resourcesPath: root,
    userDataDir: join(root, 'profile'), catsHomeDir: join(root, 'home') });
  const env = { CATS_PLUGIN_POLICY: 'internal-experiment', CATS_PLUGIN_BUNDLE_PATH: '/untrusted', CATS_PLUGIN_MANAGEMENT_KEY: 'host-generated-secret' };
  const absent = buildManagedServiceSpecs(config, env);
  for (const spec of absent) {
    assert.equal(spec.env.CATS_PLUGIN_POLICY, undefined);
    assert.equal(spec.env.CATS_PLUGIN_MANAGEMENT_KEY, undefined);
    assert.equal(spec.env.CATS_PLUGIN_BUNDLE_PATH, undefined);
  }
  const bundle = collectDesktopPlugins(packageRoot, 'preview');
  const directory = join(config.packageRoot, 'bundled-plugins'); mkdirSync(directory, { recursive: true });
  const manifest = join(directory, 'bundle.json');
  const archive = join(directory, bundle.plugins[0].artifact);
  writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, profile: 'preview', plugins: bundle.plugins }));
  writeFileSync(archive, bundle.files.get(bundle.plugins[0].artifact));
  assert.equal(readDesktopPluginArchive(config.packageRoot), archive);
  const [runtime, platform] = buildManagedServiceSpecs(config, env);
  for (const spec of [runtime, platform]) {
    assert.equal(spec.env.CATS_PLUGIN_POLICY, 'desktop-preview');
    assert.equal(spec.env.CATS_PLUGIN_MANAGEMENT_KEY, env.CATS_PLUGIN_MANAGEMENT_KEY);
  }
  assert.equal(runtime.env.CATS_PLUGIN_BUNDLE_PATH, undefined);
  assert.equal(platform.env.CATS_PLUGIN_BUNDLE_PATH, archive);
  for (const spec of buildManagedServiceSpecs(config, {})) assert.equal(spec.env.CATS_PLUGIN_POLICY, undefined);
  writeFileSync(archive, 'damaged');
  assert.throws(() => readDesktopPluginArchive(config.packageRoot), /SHA-256/);
  for (const spec of buildManagedServiceSpecs(config, env)) assert.equal(spec.env.CATS_PLUGIN_POLICY, undefined);
  writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, profile: 'release', plugins: [] }));
  assert.equal(readDesktopPluginArchive(config.packageRoot), undefined);
});
