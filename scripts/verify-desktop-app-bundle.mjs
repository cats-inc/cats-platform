#!/usr/bin/env node
// Verify the actual unpacked installer resources and offline App activation.
// Usage: node scripts/verify-desktop-app-bundle.mjs --release-root release --expect-lock config/desktop-apps.lock.json
// Alternatively pass --resources <resources-directory>. Uses only a temporary registry;
// does not start provider CLIs, download Apps, or touch the user's installed state.
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveDesktopHostConfig } from '../build/desktop/config.js';
import { buildManagedServiceSpecs } from '../build/desktop/processSupervisor.js';
import { installBundledApps } from '../build/server/platform/apps/packageInstaller.js';
import { FileCatsAppRegistry } from '../build/server/platform/apps/registry.js';
import { readAppRenderer } from '../build/server/platform/apps/renderer.js';

const pins = (apps) => apps.map(({ id, version, sha256 }) => ({ id, version, sha256 }));

export async function verifyDesktopAppBundle(resourcesRoot, expectedLockPath) {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-packaged-app-check-'));
  try {
    const config = resolveDesktopHostConfig({
      env: {}, packaged: true, resourcesPath: path.resolve(resourcesRoot),
      userDataDir: path.join(root, 'desktop'), catsHomeDir: path.join(root, 'cats-home'),
    });
    const [, platform] = buildManagedServiceSpecs(config, {}, process.platform);
    const sdk = await import(pathToFileURL(path.join(config.packageRoot, 'packages/app-sdk/package.js')).href);
    const expected = sdk.parseAppLock(JSON.parse(await readFile(expectedLockPath, 'utf8')));
    const bundledLock = platform.env.CATS_APP_BUNDLE_PATH;
    assert.equal(bundledLock, path.join(config.packageRoot, 'official-apps/bundle.lock.json'));
    assert.equal(config.paths.platformBundledConfigDir, path.join(config.packageRoot, 'config'));
    await access(config.paths.appEntryScript);
    await access(path.join(config.paths.platformBundledConfigDir, 'provider-capability-bootstrap.yaml.example'));
    const bundled = sdk.parseAppLock(JSON.parse(await readFile(bundledLock, 'utf8')));
    const plan = JSON.parse(await readFile(path.join(resourcesRoot, 'desktop-package-plan.json'), 'utf8'));
    assert.deepEqual(pins(bundled.apps), pins(expected.apps), 'Installer must contain the selected exact App set');
    assert.deepEqual(pins(plan.apps ?? []), pins(expected.apps), 'Packaging plan must retain the selected App set');
    assert.ok((await sdk.readBrowserSdk()).includes('getSnapshot'), 'Shipped browser SDK must be readable');
    for (const app of bundled.apps) {
      assert.equal(app.artifact, `${app.id}-${app.version}.catsapp`, 'Startup must use adjacent offline archives');
      sdk.decodeAppPackage(await readFile(path.join(path.dirname(bundledLock), app.artifact)), app);
    }
    // Exercise the same installer invoked before the Platform HTTP server starts.
    // These compiled modules come from this build; bytes and SDK above come from
    // the actual installer resources, including bundled-sidecar builds.
    await installBundledApps(config.paths.appStatePath, bundledLock);
    await installBundledApps(config.paths.appStatePath, bundledLock);
    const registry = new FileCatsAppRegistry({ registryPath: path.join(config.paths.platformDir, 'apps/registry.json') });
    const installed = await registry.listInstalledApps();
    assert.equal(installed.length, expected.apps.length);
    for (const app of installed) {
      assert.equal(app.enabled, true);
      assert.equal(app.installState, 'enabled');
      assert.equal(app.packageSource, 'desktop-bundle');
      assert.ok(app.manifest.contributions.lobbyApps.length > 0);
      assert.ok((await readAppRenderer(app)).html.includes('<head>'));
    }
    return { resources: path.resolve(resourcesRoot), apps: pins(bundled.apps), offlineActivation: true };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function findResources(directory, depth = 0) {
  try {
    await access(path.join(directory, 'desktop-package-plan.json'));
    return [directory];
  } catch { /* Look only through unpacked distribution directories below. */ }
  if (depth >= 6) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.filter((entry) => entry.isDirectory()
    && !['node_modules', 'app-sidecar', 'cats-runtime'].includes(entry.name))
    .map((entry) => findResources(path.join(directory, entry.name), depth + 1)));
  return nested.flat();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: verify-desktop-app-bundle.mjs (--release-root <directory> | --resources <directory>) --expect-lock <lock>');
    return;
  }
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!['--resources', '--release-root', '--expect-lock'].includes(args[index])
      || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error('Invalid verifier arguments. Use --help.');
    options[args[index]] = path.resolve(args[index + 1]);
  }
  assert.ok(options['--expect-lock'], '--expect-lock is required');
  assert.ok(Boolean(options['--resources']) !== Boolean(options['--release-root']), 'Select resources or release-root');
  const roots = options['--resources'] ? [options['--resources']] : await findResources(options['--release-root']);
  assert.ok(roots.length > 0, 'No unpacked installer resources found');
  for (const resources of roots) console.log(JSON.stringify(await verifyDesktopAppBundle(resources, options['--expect-lock']), null, 2));
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
