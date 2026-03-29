import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { resolveDesktopHostConfig } from '../dist-electron/config.js';
import {
  createDesktopPackagingPlan,
  stageDesktopPackagingOutputs,
} from '../dist-electron/packaging.js';

async function seedFile(path, contents = '') {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

test('createDesktopPackagingPlan keeps self-hosted npm compatibility while defining platform outputs', () => {
  const config = resolveDesktopHostConfig({
    env: {
      CATS_DESKTOP_APP_ENTRY: 'C:/repo/cats/dist-server/index.js',
      CATS_DESKTOP_RUNTIME_ENTRY: 'C:/repo/cats-runtime/dist/index.js',
      CATS_DESKTOP_RUNTIME_ROOT: 'C:/repo/cats-runtime',
    },
    userDataDir: 'C:/Users/test/AppData/Roaming/Cats',
  });

  const plan = createDesktopPackagingPlan(config, {
    generatedAt: new Date('2026-03-24T12:00:00.000Z'),
  });

  assert.equal(plan.strategy, 'electron-sidecar-bundle');
  assert.equal(plan.selfHostedNpmCompatible, true);
  assert.equal(plan.targets.some((target) => target.platform === 'windows'), true);
  assert.equal(plan.targets.some((target) => target.platform === 'macos'), true);
  assert.equal(plan.targets.some((target) => target.platform === 'linux'), true);
  assert.equal(plan.installer.requiresBundledRuntimeSidecar, true);
  assert.equal(plan.installer.providerSetup.baselineMode, 'api_baseline');
  assert.equal(plan.installer.providerSetup.executionDefaults.hostOwned, true);
  assert.equal(plan.installer.providerSetup.executionDefaults.rendererShellAccess, false);
  assert.equal(
    plan.installer.providerSetup.knowledgeSources.some(
      (source) => source.id === 'environment-bootstrap' && source.productDependency === false,
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.prioritizedAssets.some(
      (asset) => asset.id === 'windows-node-cli-pack' && asset.status === 'planned',
    ),
    true,
  );
});

test('package.json wires Windows installers through electron-builder NSIS', async () => {
  const packageJson = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8'));

  assert.equal(packageJson.main, 'dist-electron/main.js');
  assert.equal(Object.hasOwn(packageJson, 'types'), false);
  assert.equal(packageJson.scripts['desktop:package:windows'], 'node scripts/build-desktop-installer.mjs --target windows');
  assert.equal(packageJson.scripts['start:server'], 'node dist-server/index.js');
  assert.equal(packageJson.build.win.target[0].target, 'nsis');
  assert.equal(packageJson.build.nsis.oneClick, false);
});

test('Windows installer smoke-check script validates bundled sidecars and host state', async () => {
  const script = await readFile(
    join(process.cwd(), 'scripts', 'windows', 'Test-WindowsInstallerSmoke.ps1'),
    'utf8',
  );

  assert.match(script, /app-sidecar\\dist-server\\index\.js/);
  assert.match(script, /app-sidecar\\dist\\index\.html/);
  assert.match(script, /cats-runtime\\dist\\index\.js/);
  assert.match(script, /desktop-host\\state\.json/);
  assert.match(script, /electron-sidecar-bundle/);
  assert.match(script, /ready_for_setup/);
  assert.match(script, /ready_for_chat/);
  assert.match(script, /needs_prerequisites/);
});

test('build-desktop-installer script avoids shell execution on Windows', async () => {
  const script = await readFile(
    join(process.cwd(), 'scripts', 'build-desktop-installer.mjs'),
    'utf8',
  );

  assert.match(script, /npm-cli\.js/);
  assert.match(script, /npx-cli\.js/);
  assert.match(script, /process\.execPath/);
  assert.match(script, /shell: false/);
});

test('stageDesktopPackagingOutputs writes staging manifests and shared assets', async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-desktop-package-'));
  const packageRoot = join(workingDir, 'cats');
  const runtimeRoot = join(workingDir, 'cats-runtime');
  const outputRoot = join(workingDir, 'desktop-packaging');

  await seedFile(join(packageRoot, 'dist-server', 'index.js'), 'export {};');
  await seedFile(join(packageRoot, 'dist', 'index.html'), '<!doctype html>');
  await seedFile(join(packageRoot, 'dist-electron', 'main.js'), 'export {};');
  await seedFile(join(packageRoot, 'dist-electron', 'preload.cjs'), 'module.exports = {};');
  await seedFile(join(runtimeRoot, 'dist', 'index.js'), 'export {};');

  const config = resolveDesktopHostConfig({
    env: {
      CATS_DESKTOP_APP_ENTRY: join(packageRoot, 'dist-server', 'index.js'),
      CATS_DESKTOP_RUNTIME_ENTRY: join(runtimeRoot, 'dist', 'index.js'),
      CATS_DESKTOP_RUNTIME_ROOT: runtimeRoot,
      CATS_DESKTOP_PACKAGING_OUTPUT_ROOT: outputRoot,
    },
    userDataDir: join(workingDir, 'user-data'),
  });
  const plan = await stageDesktopPackagingOutputs(config, {
    generatedAt: new Date('2026-03-24T12:05:00.000Z'),
    platforms: ['windows', 'linux'],
  });

  assert.equal(plan.targets.every((target) => target.platform !== 'macos'), true);
  await access(join(plan.outputRoot, 'desktop-package-plan.json'));
  await access(join(plan.outputRoot, 'shared', 'dist-server', 'index.js'));
  await access(join(plan.outputRoot, 'shared', 'dist', 'index.html'));
  await access(join(plan.outputRoot, 'shared', 'dist-electron', 'main.js'));
  await access(join(plan.outputRoot, 'shared', 'dist-electron', 'preload.cjs'));
  await access(join(plan.outputRoot, 'targets', 'windows-x64', 'installer-manifest.json'));

  const targetManifest = JSON.parse(await readFile(
    join(plan.outputRoot, 'targets', 'windows-x64', 'installer-manifest.json'),
    'utf8',
  ));
  assert.equal(targetManifest.target.platform, 'windows');
  assert.equal(targetManifest.updates.channel, config.update.channel);
  assert.equal(targetManifest.target.artifactBaseName, 'cats-windows-x64');
  assert.equal(targetManifest.installer.providerSetup.capabilityPacks[0].id, 'api_baseline');
  assert.equal(
    targetManifest.installer.providerSetup.prioritizedAssets.some(
      (asset) => asset.id === 'windows-wsl-prerequisites',
    ),
    true,
  );
});

test('stageDesktopPackagingOutputs fails when cats-runtime sidecar build is missing', async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-desktop-package-missing-runtime-'));
  const packageRoot = join(workingDir, 'cats');
  const runtimeRoot = join(workingDir, 'cats-runtime');
  const outputRoot = join(workingDir, 'desktop-packaging');

  await seedFile(join(packageRoot, 'dist-server', 'index.js'), 'export {};');
  await seedFile(join(packageRoot, 'dist', 'index.html'), '<!doctype html>');
  await seedFile(join(packageRoot, 'dist-electron', 'main.js'), 'export {};');
  await seedFile(join(packageRoot, 'dist-electron', 'preload.cjs'), 'module.exports = {};');
  await mkdir(runtimeRoot, { recursive: true });

  const config = resolveDesktopHostConfig({
    env: {
      CATS_DESKTOP_APP_ENTRY: join(packageRoot, 'dist-server', 'index.js'),
      CATS_DESKTOP_RUNTIME_ENTRY: join(runtimeRoot, 'dist', 'index.js'),
      CATS_DESKTOP_RUNTIME_ROOT: runtimeRoot,
      CATS_DESKTOP_PACKAGING_OUTPUT_ROOT: outputRoot,
    },
    userDataDir: join(workingDir, 'user-data'),
  });

  await assert.rejects(
    stageDesktopPackagingOutputs(config, {
      generatedAt: new Date('2026-03-24T12:05:00.000Z'),
      platforms: ['windows'],
    }),
    /requires a bundled cats-runtime sidecar/,
  );
});
