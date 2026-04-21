import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { resolveDesktopHostConfig } from '../build/desktop/config.js';
import { resolveDesktopWindowIconPath } from '../build/desktop/windowIcon.js';
import {
  buildWindowsExecutableEditOptions,
  resolveWindowsExecutableEditPlan,
} from '../scripts/shared/edit-windows-exe-icon.mjs';
import {
  buildInstallerEnvironment,
  parseArgs as parseBuildDesktopInstallerArgs,
} from '../scripts/build-desktop-installer.mjs';
import {
  assertDesktopIconAssetsPresent,
  parseArgs as parsePackageDesktopArgs,
  resolveRequiredDesktopIconPaths,
} from '../scripts/package-desktop.mjs';
import {
  createDesktopPackagingPlan,
  stageDesktopPackagingOutputs,
} from '../build/desktop/packaging.js';

async function seedFile(path, contents = '') {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

function createDesktopIconManifest(overrides = {}) {
  return {
    sourceSvg: 'assets/app-icon-silhouette.svg',
    shape: 'circle',
    app: {
      png: 'assets/build/icon.png',
      ico: 'assets/build/icon.ico',
      icns: 'assets/build/icon.icns',
      installerIcon: 'assets/build/installerIcon.ico',
      uninstallerIcon: 'assets/build/uninstallerIcon.ico',
      installerHeaderIcon: 'assets/build/installerHeaderIcon.ico',
      linuxIcons: {
        16: 'assets/build/icons/linux/16x16.png',
        24: 'assets/build/icons/linux/24x24.png',
        32: 'assets/build/icons/linux/32x32.png',
        48: 'assets/build/icons/linux/48x48.png',
        64: 'assets/build/icons/linux/64x64.png',
        128: 'assets/build/icons/linux/128x128.png',
        256: 'assets/build/icons/linux/256x256.png',
        512: 'assets/build/icons/linux/512x512.png',
      },
    },
    tray: {
      default: 'assets/tray-icon.png',
      retina: 'assets/tray-icon@2x.png',
      template: 'assets/tray-iconTemplate.png',
      templateRetina: 'assets/tray-iconTemplate@2x.png',
    },
    ...overrides,
  };
}

async function seedRuntimeSidecar(runtimeRoot) {
  await seedFile(join(runtimeRoot, 'build', 'runtime', 'index.js'), 'export {};');
  await seedFile(join(runtimeRoot, 'package.json'), JSON.stringify({
    name: 'cats-runtime',
    version: '0.1.0',
    type: 'module',
    dependencies: {
      '@hono/node-server': '^1.14.0',
      hono: '^4.7.0',
      'playwright-core': '^1.58.2',
      yaml: '^2.8.2',
    },
  }, null, 2));
  await seedFile(join(runtimeRoot, 'public', 'index.html'), '<!doctype html>');
  await seedFile(join(runtimeRoot, 'public', 'playground.html'), '<!doctype html>');
  await seedFile(join(runtimeRoot, 'public', 'provider-setup.html'), '<!doctype html>');
  await seedFile(join(runtimeRoot, 'skills', 'README.md'), '# skills');
  await seedFile(join(runtimeRoot, 'config', 'management.yaml.example'), 'version: 1\n');
  await seedFile(join(runtimeRoot, 'config', 'providers.yaml.example'), 'version: 1\n');
  await seedFile(join(runtimeRoot, 'config', 'curated-model-catalogs.yaml.example'), 'schema_version: 1\ncatalogs: []\n');
  await seedFile(join(runtimeRoot, 'node_modules', '@hono', 'node-server', 'package.json'), '{"name":"@hono/node-server"}');
  await seedFile(join(runtimeRoot, 'node_modules', 'hono', 'package.json'), '{"name":"hono"}');
  await seedFile(join(runtimeRoot, 'node_modules', 'playwright-core', 'package.json'), '{"name":"playwright-core"}');
  await seedFile(join(runtimeRoot, 'node_modules', 'yaml', 'package.json'), '{"name":"yaml"}');
}

async function seedPlatformServerBundle(packageRoot, contents = 'export const layout = "bundle";') {
  await seedFile(join(packageRoot, 'build', 'server-bundle', 'index.js'), contents);
  await seedFile(join(packageRoot, 'build', 'server-bundle', 'index.js.map'), '{"version":3}');
}

async function seedRuntimeBundle(runtimeRoot, contents = 'export const layout = "bundle";') {
  await seedFile(join(runtimeRoot, 'build', 'runtime-bundle', 'index.js'), contents);
  await seedFile(join(runtimeRoot, 'build', 'runtime-bundle', 'index.js.map'), '{"version":3}');
}

async function seedWindowsSetupAssets(packageRoot) {
  await seedFile(join(packageRoot, 'scripts', 'windows', '_HiddenProcess.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Setup-NodeGlobalPrefix.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-NodeCliPack.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-ClaudeCode.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-CursorAgent.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-Goose.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-Junie.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Check-WslPrerequisites.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-WslUbuntuEnvironment.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-KiroCli.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-DockerDesktop.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-Ollama.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Check-WindowsSetupReadiness.ps1'), '# helper');
}

async function seedUnixSetupAssets(packageRoot, platform) {
  await seedFile(join(packageRoot, 'scripts', platform, 'provider-cli-common.sh'), '#!/usr/bin/env bash\n');
  await seedFile(join(packageRoot, 'scripts', platform, 'node-cli-common.sh'), '#!/usr/bin/env bash\n');
  await seedFile(join(packageRoot, 'scripts', platform, 'setup-node-global-prefix.sh'), '#!/usr/bin/env bash\n');
  await seedFile(join(packageRoot, 'scripts', platform, 'install-node-cli-tools.sh'), '#!/usr/bin/env bash\n');
  await seedFile(join(packageRoot, 'scripts', platform, 'install-claude-code.sh'), '#!/usr/bin/env bash\n');
  await seedFile(join(packageRoot, 'scripts', platform, 'install-cursor-agent.sh'), '#!/usr/bin/env bash\n');
  await seedFile(join(packageRoot, 'scripts', platform, 'install-goose.sh'), '#!/usr/bin/env bash\n');
  await seedFile(join(packageRoot, 'scripts', platform, 'install-junie.sh'), '#!/usr/bin/env bash\n');
  await seedFile(join(packageRoot, 'scripts', platform, 'install-kiro-cli.sh'), '#!/usr/bin/env bash\n');
  await seedFile(join(packageRoot, 'scripts', platform, 'check-installation.sh'), '#!/usr/bin/env bash\n');
}

test('createDesktopPackagingPlan keeps self-hosted npm compatibility while defining platform outputs', () => {
  const config = resolveDesktopHostConfig({
    env: {
      CATS_DESKTOP_APP_ENTRY: 'C:/repo/cats-platform/build/server/index.js',
      CATS_DESKTOP_RUNTIME_ENTRY: 'C:/repo/cats-runtime/build/runtime/index.js',
      CATS_DESKTOP_RUNTIME_ROOT: 'C:/repo/cats-runtime',
    },
    userDataDir: 'C:/Users/test/AppData/Roaming/Cats',
    catsHomeDir: 'C:/Users/test/.cats',
  });

  const plan = createDesktopPackagingPlan(config, {
    generatedAt: new Date('2026-03-24T12:00:00.000Z'),
  });

  assert.equal(plan.strategy, 'electron-sidecar-bundle');
  assert.deepEqual(plan.sidecarLayout, {
    app: 'split',
    runtime: 'split',
  });
  assert.equal(plan.selfHostedNpmCompatible, true);
  assert.equal(plan.targets.some((target) => target.platform === 'windows'), true);
  assert.equal(plan.targets.some((target) => target.platform === 'macos'), true);
  assert.equal(plan.targets.some((target) => target.platform === 'linux'), true);
  assert.equal(plan.installer.requiresBundledRuntimeSidecar, true);
  assert.equal(plan.installer.providerSetup.baselineMode, 'api_baseline');
  assert.equal(plan.installer.providerSetup.executionDefaults.hostOwned, true);
  assert.equal(plan.installer.providerSetup.executionDefaults.rendererShellAccess, false);
  assert.equal(
    plan.installer.providerSetup.localProviders.some(
      (provider) => provider.id === 'claude_code'
        && provider.deliveryPhase === 'initial_packaged_path'
        && provider.bundledInCurrentInstaller === true
        && provider.helperIds.includes('windows-claude-native-installer'),
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.localProviders.some(
      (provider) => provider.id === 'opencode'
        && provider.pack === 'native_cli_pack'
        && provider.deliveryPhase === 'initial_packaged_path'
        && provider.bundledInCurrentInstaller === true
        && provider.helperIds.includes('windows-node-cli-pack'),
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.localProviders.some(
      (provider) => provider.id === 'kilo'
        && provider.pack === 'native_cli_pack'
        && provider.deliveryPhase === 'initial_packaged_path'
        && provider.bundledInCurrentInstaller === true
        && provider.helperIds.includes('windows-node-cli-pack'),
    ),
    true,
  );
  const bundledNativeProviders = plan.installer.providerSetup.localProviders.map((provider) => provider.id);
  assert.equal(
    bundledNativeProviders.indexOf('kilo'),
    bundledNativeProviders.indexOf('opencode') + 1,
  );
  assert.equal(
    plan.installer.providerSetup.localProviders.some(
      (provider) => provider.id === 'kiro'
        && provider.pack === 'native_cli_pack'
        && provider.platform === 'cross_platform'
        && provider.deliveryPhase === 'initial_packaged_path'
        && provider.bundledInCurrentInstaller === true
        && provider.helperIds.includes('windows-kiro-native-installer')
        && provider.helperIds.includes('linux-kiro-native-installer')
        && provider.helperIds.includes('macos-kiro-native-installer'),
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.localProviders.some(
      (provider) => provider.id === 'goose'
        && provider.pack === 'native_cli_pack'
        && provider.deliveryPhase === 'initial_packaged_path'
        && provider.bundledInCurrentInstaller === true
        && provider.helperIds.includes('windows-goose-native-installer'),
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.localProviders.some(
      (provider) => provider.id === 'junie'
        && provider.pack === 'native_cli_pack'
        && provider.deliveryPhase === 'initial_packaged_path'
        && provider.bundledInCurrentInstaller === true
        && provider.helperIds.includes('windows-junie-native-installer'),
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.localProviders.some(
      (provider) => provider.id === 'ollama'
        && provider.pack === 'local_model_pack'
        && provider.deliveryPhase === 'initial_packaged_path'
        && provider.bundledInCurrentInstaller === true
        && provider.helperIds.includes('windows-ollama-local-model-installer'),
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-claude-native-installer'
        && helper.assetId === 'windows-claude-native-installer-script'
        && helper.supportsCheckOnly === true
        && helper.supportsUpgrade === true,
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-cursor-native-installer'
        && helper.assetId === 'windows-cursor-native-installer-script'
        && helper.supportsCheckOnly === true
        && helper.supportsApply === true,
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-goose-native-installer'
        && helper.assetId === 'windows-goose-native-installer-script'
        && helper.supportsCheckOnly === true
        && helper.supportsUpgrade === true,
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-junie-native-installer'
        && helper.assetId === 'windows-junie-native-installer-script'
        && helper.supportsCheckOnly === true
        && helper.supportsForce === true,
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-install-readiness-audit'
        && helper.assetId === 'windows-setup-readiness-audit-script'
        && helper.supportsCheckOnly === true
        && helper.supportsApply === false,
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'linux-install-readiness-audit'
        && helper.assetId === 'linux-setup-readiness-audit-script'
        && helper.platform === 'linux'
        && helper.supportsCheckOnly === true,
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'macos-install-readiness-audit'
        && helper.assetId === 'macos-setup-readiness-audit-script'
        && helper.platform === 'macos'
        && helper.supportsCheckOnly === true,
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-wsl-environment-installer'
        && helper.assetId === 'windows-wsl-environment-installer-script'
        && helper.supportsApply === true
        && helper.supportsUpgrade === true
        && helper.requiresElevation === true,
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-kiro-native-installer'
        && helper.assetId === 'windows-kiro-native-installer-script'
        && helper.platform === 'windows'
        && helper.supportsForce === true,
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-docker-desktop-installer'
        && helper.assetId === 'windows-docker-desktop-installer-script'
        && helper.pack === 'local_model_pack'
        && helper.requiresElevation === true,
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-ollama-local-model-installer'
        && helper.assetId === 'windows-ollama-local-model-installer-script'
        && helper.pack === 'local_model_pack'
        && helper.supportsUpgrade === true
        && helper.requiresElevation === false,
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.knowledgeSources.some(
      (source) => source.id === 'environment-bootstrap' && source.productDependency === false,
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.prioritizedAssets.some(
      (asset) => asset.id === 'windows-npm-prefix-helper' && asset.status === 'ported',
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.prioritizedAssets.some(
      (asset) => asset.id === 'windows-node-cli-pack' && asset.status === 'ported',
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.prioritizedAssets.some(
      (asset) => asset.id === 'windows-claude-native-installer' && asset.status === 'ported',
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.prioritizedAssets.some(
      (asset) => asset.id === 'windows-cursor-native-installer' && asset.status === 'ported',
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.prioritizedAssets.some(
      (asset) => asset.id === 'windows-goose-native-installer' && asset.status === 'ported',
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.prioritizedAssets.some(
      (asset) => asset.id === 'windows-junie-native-installer' && asset.status === 'ported',
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.prioritizedAssets.some(
      (asset) => asset.id === 'windows-wsl-prerequisite-preflight' && asset.status === 'ported',
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.prioritizedAssets.some(
      (asset) => asset.id === 'windows-wsl-environment-installer' && asset.status === 'ported',
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.prioritizedAssets.some(
      (asset) => asset.id === 'windows-kiro-native-installer' && asset.status === 'ported',
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.prioritizedAssets.some(
      (asset) => asset.id === 'windows-install-readiness-audit' && asset.status === 'ported',
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.prioritizedAssets.some(
      (asset) => asset.id === 'windows-docker-local-model-helper' && asset.status === 'ported',
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.prioritizedAssets.some(
      (asset) => asset.id === 'windows-ollama-local-model-installer' && asset.status === 'ported',
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.prioritizedAssets.some(
      (asset) => asset.id === 'linux-node-cli-pack' && asset.status === 'ported',
    ),
    true,
  );
  assert.equal(
    plan.installer.providerSetup.prioritizedAssets.some(
      (asset) => asset.id === 'macos-node-cli-pack' && asset.status === 'ported',
    ),
    true,
  );
  const windowsTarget = plan.targets.find((target) => target.id === 'windows-x64');
  const linuxTarget = plan.targets.find((target) => target.id === 'linux-x64');
  const macosTarget = plan.targets.find((target) => target.id === 'macos-universal');
  assert.equal(
    windowsTarget?.artifacts.some(
      (artifact) => artifact.id === 'windows-npm-prefix-helper-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    windowsTarget?.artifacts.some(
      (artifact) => artifact.id === 'windows-node-cli-pack-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    windowsTarget?.artifacts.some(
      (artifact) => artifact.id === 'windows-claude-native-installer-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    windowsTarget?.artifacts.some(
      (artifact) => artifact.id === 'windows-cursor-native-installer-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    windowsTarget?.artifacts.some(
      (artifact) => artifact.id === 'windows-goose-native-installer-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    windowsTarget?.artifacts.some(
      (artifact) => artifact.id === 'windows-junie-native-installer-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    windowsTarget?.artifacts.some(
      (artifact) => artifact.id === 'windows-wsl-prerequisite-preflight-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    windowsTarget?.artifacts.some(
      (artifact) => artifact.id === 'windows-wsl-environment-installer-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    windowsTarget?.artifacts.some(
      (artifact) => artifact.id === 'windows-kiro-native-installer-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    windowsTarget?.artifacts.some(
      (artifact) => artifact.id === 'windows-docker-desktop-installer-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    windowsTarget?.artifacts.some(
      (artifact) => artifact.id === 'windows-ollama-local-model-installer-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    windowsTarget?.artifacts.some(
      (artifact) => artifact.id === 'windows-setup-readiness-audit-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    windowsTarget?.artifacts.some(
      (artifact) => artifact.id === 'windows-hidden-process-support-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    linuxTarget?.artifacts.some(
      (artifact) => artifact.id === 'linux-setup-assets-manifest' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    linuxTarget?.artifacts.some(
      (artifact) => artifact.id === 'linux-node-cli-pack-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    linuxTarget?.artifacts.some(
      (artifact) => artifact.id === 'linux-setup-readiness-audit-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    linuxTarget?.artifacts.some(
      (artifact) => artifact.id === 'linux-provider-cli-common-support-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    linuxTarget?.artifacts.some(
      (artifact) => artifact.id === 'linux-node-cli-common-support-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    macosTarget?.artifacts.some(
      (artifact) => artifact.id === 'macos-setup-assets-manifest' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    macosTarget?.artifacts.some(
      (artifact) => artifact.id === 'macos-node-cli-pack-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    macosTarget?.artifacts.some(
      (artifact) => artifact.id === 'macos-setup-readiness-audit-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    macosTarget?.artifacts.some(
      (artifact) => artifact.id === 'macos-provider-cli-common-support-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    macosTarget?.artifacts.some(
      (artifact) => artifact.id === 'macos-node-cli-common-support-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
});

test('package.json wires Windows, macOS, and Linux installer targets through electron-builder', async () => {
  const packageJson = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8'));

  assert.equal(packageJson.main, 'build/desktop/main.js');
  assert.equal(Object.hasOwn(packageJson, 'types'), false);
  assert.equal(packageJson.scripts.build, 'npm run clean:build && node scripts/build-server-artifacts.mjs && npm run build:web && npm run build:host');
  assert.equal(packageJson.scripts['build:server-bundle'], 'node scripts/bundle-server.mjs');
  assert.equal(packageJson.scripts['desktop:package:linux'], 'node scripts/build-desktop-installer.mjs --target linux');
  assert.equal(packageJson.scripts['desktop:package:macos'], 'node scripts/build-desktop-installer.mjs --target macos');
  assert.equal(packageJson.scripts['desktop:package:windows'], 'node scripts/build-desktop-installer.mjs --target windows');
  assert.equal(packageJson.scripts['desktop:smoke:linux'], 'bash ./scripts/linux/test-linux-package-smoke.sh');
  assert.equal(packageJson.scripts['desktop:smoke:macos'], 'bash ./scripts/macos/test-macos-package-smoke.sh');
  assert.equal(packageJson.scripts['start:server'], 'node build/server/index.js');
  assert.equal(packageJson.build.extraMetadata?.name, 'Cats');
  assert.equal(packageJson.build.afterPack, './scripts/shared/edit-windows-exe-icon.mjs');
  assert.equal(packageJson.build.win.target[0].target, 'nsis');
  assert.equal(packageJson.build.mac.target.some((entry) => entry.target === 'dmg'), true);
  assert.equal(packageJson.build.mac.target.some((entry) => entry.target === 'pkg'), true);
  assert.equal(packageJson.build.mac.target.some((entry) => entry.target === 'zip'), true);
  assert.equal(packageJson.build.linux.target.some((entry) => entry.target === 'AppImage'), true);
  assert.equal(packageJson.build.linux.target.some((entry) => entry.target === 'deb'), true);
  assert.equal(packageJson.build.linux.target.some((entry) => entry.target === 'tar.gz'), true);
  assert.equal(packageJson.build.nsis.oneClick, false);
  assert.equal(packageJson.build.win.icon, 'icon.ico');
  assert.equal(packageJson.build.win.signAndEditExecutable, false);
  assert.equal(packageJson.build.mac.icon, 'icon.icns');
  assert.equal(packageJson.build.linux.icon, 'icons/linux');
  assert.equal(packageJson.build.nsis.installerIcon, 'installerIcon.ico');
  assert.equal(packageJson.build.nsis.uninstallerIcon, 'uninstallerIcon.ico');
  assert.equal(packageJson.build.nsis.installerHeaderIcon, 'installerHeaderIcon.ico');
  assert.equal(packageJson.build.files.includes('assets/build/icon.ico'), true);
  assert.equal(packageJson.build.files.includes('assets/build/icon.png'), true);
  assert.equal(packageJson.build.extraResources.some(
    (entry) => entry.to === 'desktop/setup-assets',
  ), true);
  assert.equal(packageJson.build.extraResources.some(
    (entry) => entry.from === 'build/desktop-packaging/shared/app-sidecar/package.json'
      && entry.to === 'app-sidecar/package.json',
  ), true);
  assert.equal(packageJson.build.extraResources.some(
    (entry) => entry.from === 'build/desktop-packaging/shared/cats-runtime'
      && entry.to === 'cats-runtime'
      && Array.isArray(entry.filter)
      && entry.filter.includes('!node_modules{,/**/*}'),
  ), true);
  assert.equal(packageJson.build.extraResources.some(
    (entry) => entry.from === 'build/desktop-packaging/shared/cats-runtime/node_modules'
      && entry.to === 'cats-runtime/node_modules',
  ), true);
});

test('resolveDesktopWindowIconPath finds packaged window icons for supported desktop platforms', async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-window-icon-'));
  const iconIcoPath = join(workingDir, 'assets', 'build', 'icon.ico');
  const iconPngPath = join(workingDir, 'assets', 'build', 'icon.png');

  await seedFile(iconIcoPath, 'ico');
  await seedFile(iconPngPath, 'png');

  assert.equal(resolveDesktopWindowIconPath(workingDir, 'win32'), iconIcoPath);
  assert.equal(resolveDesktopWindowIconPath(workingDir, 'linux'), iconPngPath);
  assert.equal(resolveDesktopWindowIconPath(workingDir, 'darwin'), null);

  await rm(iconIcoPath);
  await rm(iconPngPath);

  assert.equal(resolveDesktopWindowIconPath(workingDir, 'win32'), null);
  assert.equal(resolveDesktopWindowIconPath(workingDir, 'linux'), null);
});

test('Windows afterPack hook edits the packaged executable icon without re-enabling signing', () => {
  const plan = resolveWindowsExecutableEditPlan({
    electronPlatformName: 'win32',
    appOutDir: 'C:/release/win-unpacked',
    packager: {
      buildResourcesDir: 'C:/repo/assets/build',
      appInfo: {
        productName: 'Cats',
        productFilename: 'Cats',
        copyright: 'Copyright (c) Cats Inc.',
        shortVersion: '0.1.0',
        buildVersion: '0.1.0',
        shortVersionWindows: '0.1.0.0',
        companyName: 'Cats Inc.',
        getVersionInWeirdWindowsForm() {
          return '0.1.0.0';
        },
      },
      platformSpecificBuildOptions: {
        requestedExecutionLevel: 'asInvoker',
      },
    },
  });

  assert.equal(plan?.executablePath, join('C:/release/win-unpacked', 'Cats.exe'));
  assert.equal(plan?.options.icon, join('C:/repo/assets/build', 'icon.ico'));
  assert.equal(plan?.options['version-string'].ProductName, 'Cats');
  assert.equal(plan?.options['version-string'].CompanyName, 'Cats Inc.');
  assert.equal(Object.hasOwn(plan?.options ?? {}, 'requested-execution-level'), false);

  assert.equal(
    resolveWindowsExecutableEditPlan({
      electronPlatformName: 'darwin',
      appOutDir: 'C:/release/darwin-unpacked',
      packager: {
        buildResourcesDir: 'C:/repo/assets/build',
        appInfo: {
          productFilename: 'Cats',
          productName: 'Cats',
          copyright: '',
          shortVersion: '0.1.0',
          buildVersion: '0.1.0',
          shortVersionWindows: '0.1.0.0',
          companyName: 'Cats Inc.',
          getVersionInWeirdWindowsForm() {
            return '0.1.0.0';
          },
        },
        platformSpecificBuildOptions: {
          requestedExecutionLevel: 'asInvoker',
        },
      },
    }),
    null,
  );
});

test('Windows executable edit options preserve metadata while setting the packaged icon', () => {
  const plan = buildWindowsExecutableEditOptions({
    executablePath: 'C:/release/win-unpacked/Cats.exe',
    iconPath: 'C:/repo/assets/build/icon.ico',
    productName: 'Cats',
    copyright: 'Copyright (c) Cats Inc.',
    shortVersion: '0.1.0',
    buildVersion: '0.1.0',
    shortVersionWindows: '0.1.0.0',
    weirdWindowsVersion: '0.1.0.0',
    companyName: 'Cats Inc.',
    internalName: 'Cats',
    requestedExecutionLevel: 'highestAvailable',
  });

  assert.equal(plan.executablePath, 'C:/release/win-unpacked/Cats.exe');
  assert.equal(plan.options['version-string'].FileDescription, 'Cats');
  assert.equal(plan.options['version-string'].InternalName, 'Cats');
  assert.equal(plan.options['requested-execution-level'], 'highestAvailable');
  assert.equal(plan.options.icon, 'C:/repo/assets/build/icon.ico');
});

test('Windows installer smoke-check script validates bundled sidecars and host state', async () => {
  const script = await readFile(
    join(process.cwd(), 'scripts', 'windows', 'Test-WindowsInstallerSmoke.ps1'),
    'utf8',
  );

  assert.match(script, /app-sidecar\\build\\server\\index\.js/);
  assert.match(script, /app-sidecar\\build\\renderer\\index\.html/);
  assert.match(script, /app-sidecar\\package\.json/);
  assert.match(script, /cats-runtime\\build\\runtime\\index\.js/);
  assert.match(script, /cats-runtime\\package\.json/);
  assert.match(script, /cats-runtime\\public\\provider-setup\.html/);
  assert.match(script, /cats-runtime\\skills\\README\.md/);
  assert.match(script, /cats-runtime\\config\\providers\.yaml\.example/);
  assert.match(script, /cats-runtime\\node_modules\\yaml\\package\.json/);
  assert.match(script, /desktop\\setup-assets\\windows\\Setup-NodeGlobalPrefix\.ps1/);
  assert.match(script, /desktop\\setup-assets\\windows\\Install-NodeCliPack\.ps1/);
  assert.match(script, /desktop\\setup-assets\\windows\\Install-ClaudeCode\.ps1/);
  assert.match(script, /desktop\\setup-assets\\windows\\Install-CursorAgent\.ps1/);
  assert.match(script, /desktop\\setup-assets\\windows\\Install-Goose\.ps1/);
  assert.match(script, /desktop\\setup-assets\\windows\\Install-Junie\.ps1/);
  assert.match(script, /desktop\\setup-assets\\windows\\Check-WslPrerequisites\.ps1/);
  assert.match(script, /desktop\\setup-assets\\windows\\Install-WslUbuntuEnvironment\.ps1/);
  assert.match(script, /desktop\\setup-assets\\windows\\Install-KiroCli\.ps1/);
  assert.match(script, /desktop\\setup-assets\\windows\\Install-DockerDesktop\.ps1/);
  assert.match(script, /desktop\\setup-assets\\windows\\Install-Ollama\.ps1/);
  assert.match(script, /desktop\\setup-assets\\windows\\Check-WindowsSetupReadiness\.ps1/);
  assert.match(script, /providerSetup\.localProviders/);
  assert.match(script, /id -eq 'opencode'/);
  assert.match(script, /id -eq 'kilo'/);
  assert.match(script, /windows-ollama-local-model-installer/);
  assert.match(script, /windows-docker-desktop-installer/);
  assert.match(script, /desktop\\setup-assets\\manifest\.json/);
  assert.match(script, /\.cats\\desktop\\state\.json/);
  assert.match(script, /electron-sidecar-bundle/);
  assert.match(script, /ready_for_setup/);
  assert.match(script, /ready_for_chat/);
  assert.match(script, /needs_prerequisites/);
});

test('macOS and Linux unpacked smoke-check scripts validate bundled sidecars and packaged setup assets', async () => {
  const linuxScript = await readFile(
    join(process.cwd(), 'scripts', 'linux', 'test-linux-package-smoke.sh'),
    'utf8',
  );
  const macosScript = await readFile(
    join(process.cwd(), 'scripts', 'macos', 'test-macos-package-smoke.sh'),
    'utf8',
  );

  assert.match(linuxScript, /release\/linux-unpacked/);
  assert.match(linuxScript, /desktop\/setup-assets\/linux\/setup-node-global-prefix\.sh/);
  assert.match(linuxScript, /desktop\/setup-assets\/linux\/provider-cli-common\.sh/);
  assert.match(linuxScript, /linux-node-cli-pack-script/);
  assert.match(linuxScript, /linux-install-readiness-audit/);
  assert.match(macosScript, /release\/mac-universal\/Cats\.app/);
  assert.match(macosScript, /desktop\/setup-assets\/macos\/setup-node-global-prefix\.sh/);
  assert.match(macosScript, /desktop\/setup-assets\/macos\/node-cli-common\.sh/);
  assert.match(macosScript, /macos-node-cli-pack-script/);
  assert.match(macosScript, /macos-install-readiness-audit/);
});

test('build-desktop-installer script avoids shell execution on Windows', async () => {
  const script = await readFile(
    join(process.cwd(), 'scripts', 'build-desktop-installer.mjs'),
    'utf8',
  );
  const linuxWrapper = await readFile(
    join(process.cwd(), 'scripts', 'linux', 'build-linux-installer.sh'),
    'utf8',
  );
  const macosWrapper = await readFile(
    join(process.cwd(), 'scripts', 'macos', 'build-macos-installer.sh'),
    'utf8',
  );

  assert.match(script, /<current\|windows\|macos\|linux>/);
  assert.match(script, /--arch <x64\|arm64\|universal>/);
  assert.match(script, /--format <nsis\|dmg\|pkg\|zip\|AppImage\|deb\|tar\.gz>/);
  assert.match(script, /--sidecar-layout <split\|bundle>/);
  assert.match(script, /Without --arch\/--format, the electron-builder target matrix from package\.json is preserved\./);
  assert.match(script, /case 'darwin':/);
  assert.match(script, /case 'linux':/);
  assert.match(script, /macos:\s*\['dmg', 'pkg', 'zip'\]/);
  assert.match(script, /linux:\s*\['AppImage', 'deb', 'tar\.gz'\]/);
  assert.match(script, /candidate\.toLowerCase\(\) === formatOverride\.toLowerCase\(\)/);
  assert.match(script, /--mac/);
  assert.match(script, /--linux/);
  assert.match(script, /npm-cli\.js/);
  assert.match(script, /npx-cli\.js/);
  assert.match(script, /process\.execPath/);
  assert.match(script, /CSC_IDENTITY_AUTO_DISCOVERY:\s*'false'/);
  assert.match(script, /for \(const key of \['WIN_CSC_LINK', 'CSC_LINK', 'WIN_CSC_KEY_PASSWORD', 'CSC_KEY_PASSWORD'\]\)/);
  assert.match(script, /typeof value !== 'string' \|\| value\.trim\(\) === ''/);
  assert.match(script, /delete env\[key\]/);
  assert.match(script, /shell: false/);
  assert.match(script, /scripts\/package-desktop\.mjs'/);
  assert.match(script, /'--platform'/);
  assert.match(script, /resolvedTarget/);
  assert.match(script, /'--sidecar-layout',\s*parsed\.sidecarLayout/);
  assert.match(linuxWrapper, /build-desktop-installer\.mjs --target linux/);
  assert.match(macosWrapper, /build-desktop-installer\.mjs --target macos/);
});

test('buildInstallerEnvironment drops empty-signing overrides instead of passing project-root-like paths', () => {
  const env = buildInstallerEnvironment({
    PATH: process.env.PATH,
    CSC_LINK: '',
    WIN_CSC_LINK: '',
    CSC_KEY_PASSWORD: '',
    WIN_CSC_KEY_PASSWORD: '',
    KEEP_ME: '1',
  });

  assert.equal(env.CSC_IDENTITY_AUTO_DISCOVERY, 'false');
  assert.equal(env.KEEP_ME, '1');
  assert.equal('CSC_LINK' in env, false);
  assert.equal('WIN_CSC_LINK' in env, false);
  assert.equal('CSC_KEY_PASSWORD' in env, false);
  assert.equal('WIN_CSC_KEY_PASSWORD' in env, false);
});

test('buildInstallerEnvironment preserves explicit signing credentials when provided', () => {
  const env = buildInstallerEnvironment({
    PATH: process.env.PATH,
    CSC_LINK: 'file:///tmp/macos-signing.p12',
    WIN_CSC_LINK: 'file:///tmp/windows-signing.p12',
    CSC_KEY_PASSWORD: 'mac-secret',
    WIN_CSC_KEY_PASSWORD: 'win-secret',
  });

  assert.equal(env.CSC_IDENTITY_AUTO_DISCOVERY, 'false');
  assert.equal(env.CSC_LINK, 'file:///tmp/macos-signing.p12');
  assert.equal(env.WIN_CSC_LINK, 'file:///tmp/windows-signing.p12');
  assert.equal(env.CSC_KEY_PASSWORD, 'mac-secret');
  assert.equal(env.WIN_CSC_KEY_PASSWORD, 'win-secret');
});

test('desktop packaging scripts keep icon selection outside the build flags', () => {
  assert.deepEqual(parsePackageDesktopArgs([]), {
    help: false,
    platform: 'all',
    outputDir: null,
    sidecarLayout: 'split',
  });
  assert.deepEqual(parsePackageDesktopArgs(['--platform', 'windows']), {
    help: false,
    platform: 'windows',
    outputDir: null,
    sidecarLayout: 'split',
  });
  assert.deepEqual(parsePackageDesktopArgs(['--platform', 'windows', '--sidecar-layout', 'bundle']), {
    help: false,
    platform: 'windows',
    outputDir: null,
    sidecarLayout: 'bundle',
  });

  assert.deepEqual(parseBuildDesktopInstallerArgs([]), {
    help: false,
    target: 'current',
    arch: null,
    format: null,
    sidecarLayout: 'split',
  });
  assert.deepEqual(
    parseBuildDesktopInstallerArgs(['--target', 'linux', '--arch', 'arm64', '--format', 'deb', '--sidecar-layout', 'bundle']),
    {
      help: false,
      target: 'linux',
      arch: 'arm64',
      format: 'deb',
      sidecarLayout: 'bundle',
    },
  );
  assert.deepEqual(
    parseBuildDesktopInstallerArgs([], { CATS_DESKTOP_SIDECAR_LAYOUT: 'bundle' }),
    {
      help: false,
      target: 'current',
      arch: null,
      format: null,
      sidecarLayout: 'bundle',
    },
  );
});

test('package-desktop requires prebuilt icon assets instead of regenerating them', async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-package-icons-'));

  await assert.rejects(
    assertDesktopIconAssetsPresent(workingDir),
    /Missing required desktop icon asset: assets\/build\/icon\.png/,
  );

  const requiredPaths = resolveRequiredDesktopIconPaths(workingDir);
  for (const iconPath of requiredPaths) {
    await seedFile(
      iconPath,
      iconPath.endsWith('icon-manifest.json')
        ? JSON.stringify(createDesktopIconManifest(), null, 2)
        : 'icon',
    );
  }

  await assert.doesNotReject(assertDesktopIconAssetsPresent(workingDir));
});

test('package-desktop verifies the generated icon manifest matches packaged icon assets', async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-package-icon-manifest-'));
  const requiredPaths = resolveRequiredDesktopIconPaths(workingDir);

  for (const iconPath of requiredPaths) {
    await seedFile(
      iconPath,
      iconPath.endsWith('icon-manifest.json')
        ? JSON.stringify(createDesktopIconManifest({
            tray: {
              default: 'assets/tray-icon.png',
              retina: 'assets/tray-icon@2x.png',
              template: 'assets/tray-iconTemplate.png',
            },
          }), null, 2)
        : 'icon',
    );
  }

  await assert.rejects(
    assertDesktopIconAssetsPresent(workingDir),
    /Desktop icon manifest is missing generated asset: assets\/tray-iconTemplate@2x\.png/u,
  );
});

test('stageDesktopPackagingOutputs writes staging manifests and shared assets', async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-desktop-package-'));
  const packageRoot = join(workingDir, 'cats');
  const runtimeRoot = join(workingDir, 'cats-runtime');
  const outputRoot = join(workingDir, 'desktop-packaging');

  await seedFile(join(packageRoot, 'build', 'server', 'index.js'), 'export {};');
  await seedFile(join(packageRoot, 'build', 'renderer', 'index.html'), '<!doctype html>');
  await seedFile(join(packageRoot, 'build', 'desktop', 'main.js'), 'export {};');
  await seedFile(join(packageRoot, 'build', 'desktop', 'preload.cjs'), 'module.exports = {};');
  await seedFile(join(packageRoot, 'package.json'), JSON.stringify({
    name: '@cats-inc/cats-platform',
    version: '0.1.0',
    type: 'module',
  }, null, 2));
  await seedWindowsSetupAssets(packageRoot);
  await seedUnixSetupAssets(packageRoot, 'linux');
  await seedUnixSetupAssets(packageRoot, 'macos');
  await seedRuntimeSidecar(runtimeRoot);

  const config = resolveDesktopHostConfig({
    env: {
      CATS_DESKTOP_APP_ENTRY: join(packageRoot, 'build', 'server', 'index.js'),
      CATS_DESKTOP_RUNTIME_ENTRY: join(runtimeRoot, 'build', 'runtime', 'index.js'),
      CATS_DESKTOP_RUNTIME_ROOT: runtimeRoot,
      CATS_DESKTOP_PACKAGING_OUTPUT_ROOT: outputRoot,
    },
    userDataDir: join(workingDir, 'user-data'),
    catsHomeDir: join(workingDir, '.cats'),
  });
  const plan = await stageDesktopPackagingOutputs(config, {
    generatedAt: new Date('2026-03-24T12:05:00.000Z'),
    platforms: ['windows', 'linux'],
  });

  assert.deepEqual(plan.sidecarLayout, {
    app: 'split',
    runtime: 'split',
  });
  assert.equal(plan.targets.every((target) => target.platform !== 'macos'), true);
  await access(join(plan.outputRoot, 'desktop-package-plan.json'));
  await access(join(plan.outputRoot, 'shared', 'build', 'server', 'index.js'));
  await access(join(plan.outputRoot, 'shared', 'build', 'renderer', 'index.html'));
  await access(join(plan.outputRoot, 'shared', 'app-sidecar', 'package.json'));
  await access(join(plan.outputRoot, 'shared', 'build', 'desktop', 'main.js'));
  await access(join(plan.outputRoot, 'shared', 'build', 'desktop', 'preload.cjs'));
  await access(join(plan.outputRoot, 'shared', 'cats-runtime', 'build', 'runtime', 'index.js'));
  await access(join(plan.outputRoot, 'shared', 'cats-runtime', 'package.json'));
  await access(join(plan.outputRoot, 'shared', 'cats-runtime', 'public', 'provider-setup.html'));
  await access(join(plan.outputRoot, 'shared', 'cats-runtime', 'skills', 'README.md'));
  await access(join(plan.outputRoot, 'shared', 'cats-runtime', 'config', 'management.yaml.example'));
  await access(join(plan.outputRoot, 'shared', 'cats-runtime', 'config', 'providers.yaml.example'));
  await access(join(plan.outputRoot, 'shared', 'cats-runtime', 'config', 'curated-model-catalogs.yaml.example'));
  await access(join(plan.outputRoot, 'shared', 'cats-runtime', 'node_modules', 'yaml', 'package.json'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'windows', 'Setup-NodeGlobalPrefix.ps1'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'windows', 'Install-NodeCliPack.ps1'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'windows', 'Install-ClaudeCode.ps1'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'windows', 'Install-CursorAgent.ps1'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'windows', 'Install-Goose.ps1'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'windows', 'Install-Junie.ps1'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'windows', 'Check-WslPrerequisites.ps1'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'windows', 'Install-WslUbuntuEnvironment.ps1'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'windows', 'Install-KiroCli.ps1'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'windows', 'Install-DockerDesktop.ps1'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'windows', 'Install-Ollama.ps1'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'windows', 'Check-WindowsSetupReadiness.ps1'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'windows', '_HiddenProcess.ps1'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'linux', 'setup-node-global-prefix.sh'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'linux', 'install-node-cli-tools.sh'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'linux', 'install-claude-code.sh'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'linux', 'install-cursor-agent.sh'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'linux', 'install-goose.sh'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'linux', 'install-junie.sh'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'linux', 'install-kiro-cli.sh'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'linux', 'check-installation.sh'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'linux', 'provider-cli-common.sh'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'linux', 'node-cli-common.sh'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'manifest.json'));
  await access(join(plan.outputRoot, 'targets', 'windows-x64', 'installer-manifest.json'));
  await access(join(plan.outputRoot, 'targets', 'linux-x64', 'installer-manifest.json'));

  const assetMap = JSON.parse(await readFile(
    join(plan.outputRoot, 'shared', 'asset-map.json'),
    'utf8',
  ));
  assert.deepEqual(assetMap.sidecarLayout, {
    app: 'split',
    runtime: 'split',
  });
  assert.equal(
    assetMap.assets.some(
      (asset) => asset.target === 'shared/build/server/index.js'
        && asset.source.replace(/\\/g, '/').endsWith('/server/index.js'),
    ),
    true,
  );
  assert.equal(
    assetMap.assets.some(
      (asset) => asset.target === 'shared/cats-runtime/build/runtime/index.js'
        && asset.source.replace(/\\/g, '/').endsWith('cats-runtime/build/runtime/index.js'),
    ),
    true,
  );

  const targetManifest = JSON.parse(await readFile(
    join(plan.outputRoot, 'targets', 'windows-x64', 'installer-manifest.json'),
    'utf8',
  ));
  const linuxTargetManifest = JSON.parse(await readFile(
    join(plan.outputRoot, 'targets', 'linux-x64', 'installer-manifest.json'),
    'utf8',
  ));
  assert.equal(targetManifest.target.platform, 'windows');
  assert.deepEqual(targetManifest.sidecarLayout, {
    app: 'split',
    runtime: 'split',
  });
  assert.equal(linuxTargetManifest.target.platform, 'linux');
  assert.equal(targetManifest.updates.channel, config.update.channel);
  assert.equal(targetManifest.target.artifactBaseName, 'cats-windows-x64');
  assert.equal(targetManifest.installer.providerSetup.capabilityPacks[0].id, 'api_baseline');
  assert.equal(
    targetManifest.installer.providerSetup.localProviders.some(
      (provider) => provider.id === 'opencode'
        && provider.deliveryPhase === 'initial_packaged_path'
        && provider.bundledInCurrentInstaller === true
        && provider.helperIds.includes('windows-node-cli-pack')
        && provider.currentHome.includes('Install-NodeCliPack'),
    ),
    true,
  );
  assert.equal(
    targetManifest.installer.providerSetup.localProviders.some(
      (provider) => provider.id === 'kilo'
        && provider.deliveryPhase === 'initial_packaged_path'
        && provider.bundledInCurrentInstaller === true
        && provider.helperIds.includes('windows-node-cli-pack')
        && provider.currentHome.includes('Install-NodeCliPack'),
    ),
    true,
  );
  const targetLocalProviders = targetManifest.installer.providerSetup.localProviders.map(
    (provider) => provider.id,
  );
  assert.equal(
    targetLocalProviders.indexOf('kilo'),
    targetLocalProviders.indexOf('opencode') + 1,
  );
  assert.equal(
    targetManifest.installer.providerSetup.localProviders.some(
      (provider) => provider.id === 'kiro'
        && provider.deliveryPhase === 'initial_packaged_path'
        && provider.bundledInCurrentInstaller === true,
    ),
    true,
  );
  assert.equal(
    targetManifest.installer.providerSetup.localProviders.some(
      (provider) => provider.id === 'goose'
        && provider.deliveryPhase === 'initial_packaged_path'
        && provider.bundledInCurrentInstaller === true
        && provider.helperIds.includes('windows-goose-native-installer'),
    ),
    true,
  );
  assert.equal(
    targetManifest.installer.providerSetup.localProviders.some(
      (provider) => provider.id === 'junie'
        && provider.deliveryPhase === 'initial_packaged_path'
        && provider.bundledInCurrentInstaller === true
        && provider.currentHome.includes('Install-Junie'),
    ),
    true,
  );
  assert.equal(
    targetManifest.installer.providerSetup.localProviders.some(
      (provider) => provider.id === 'ollama'
        && provider.pack === 'local_model_pack'
        && provider.deliveryPhase === 'initial_packaged_path'
        && provider.bundledInCurrentInstaller === true
        && provider.currentHome === 'cats-platform/scripts/windows/Install-Ollama.ps1',
    ),
    true,
  );
  assert.equal(
    targetManifest.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-claude-native-installer'
        && helper.packagedRelativePath === 'desktop/setup-assets/windows/Install-ClaudeCode.ps1'
        && helper.supportsForce === true,
    ),
    true,
  );
  assert.equal(
    targetManifest.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-cursor-native-installer'
        && helper.packagedRelativePath === 'desktop/setup-assets/windows/Install-CursorAgent.ps1'
        && helper.supportsUpgrade === true,
    ),
    true,
  );
  assert.equal(
    targetManifest.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-goose-native-installer'
        && helper.packagedRelativePath === 'desktop/setup-assets/windows/Install-Goose.ps1'
        && helper.supportsForce === true,
    ),
    true,
  );
  assert.equal(
    targetManifest.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-junie-native-installer'
        && helper.packagedRelativePath === 'desktop/setup-assets/windows/Install-Junie.ps1'
        && helper.supportsUpgrade === true,
    ),
    true,
  );
  assert.equal(
    targetManifest.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-node-cli-pack'
        && helper.packagedRelativePath === 'desktop/setup-assets/windows/Install-NodeCliPack.ps1'
        && helper.supportsUpgrade === true,
    ),
    true,
  );
  assert.equal(
    targetManifest.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-wsl-environment-installer'
        && helper.packagedRelativePath === 'desktop/setup-assets/windows/Install-WslUbuntuEnvironment.ps1'
        && helper.supportsForce === true,
    ),
    true,
  );
  assert.equal(
    targetManifest.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-kiro-native-installer'
        && helper.packagedRelativePath === 'desktop/setup-assets/windows/Install-KiroCli.ps1'
        && helper.platform === 'windows',
    ),
    true,
  );
  assert.equal(
    targetManifest.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-docker-desktop-installer'
        && helper.packagedRelativePath === 'desktop/setup-assets/windows/Install-DockerDesktop.ps1'
        && helper.requiresElevation === true,
    ),
    true,
  );
  assert.equal(
    targetManifest.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-ollama-local-model-installer'
        && helper.packagedRelativePath === 'desktop/setup-assets/windows/Install-Ollama.ps1'
        && helper.supportsForce === true,
    ),
    true,
  );
  assert.equal(
    targetManifest.installer.providerSetup.prioritizedAssets.some(
      (asset) => asset.id === 'windows-wsl-environment-installer',
    ),
    true,
  );
  assert.equal(
    targetManifest.installer.providerSetup.prioritizedAssets.some(
      (asset) => asset.id === 'windows-goose-native-installer',
    ),
    true,
  );
  assert.equal(
    targetManifest.installer.providerSetup.prioritizedAssets.some(
      (asset) => asset.id === 'windows-junie-native-installer',
    ),
    true,
  );
  assert.equal(
    targetManifest.installer.providerSetup.prioritizedAssets.some(
      (asset) => asset.id === 'windows-docker-local-model-helper',
    ),
    true,
  );
  assert.equal(
    targetManifest.installer.providerSetup.prioritizedAssets.some(
      (asset) => asset.id === 'windows-ollama-local-model-installer',
    ),
    true,
  );
  assert.equal(
    targetManifest.artifacts.some(
      (artifact) => artifact.id === 'app-package-manifest' && artifact.role === 'app_server',
    ),
    true,
  );
  assert.equal(
    targetManifest.artifacts.some(
      (artifact) => artifact.id === 'runtime-package-manifest' && artifact.role === 'runtime_sidecar',
    ),
    true,
  );
  assert.equal(
    targetManifest.artifacts.some(
      (artifact) => artifact.id === 'runtime-setup-ui' && artifact.role === 'runtime_sidecar',
    ),
    true,
  );
  assert.equal(
    targetManifest.artifacts.some(
      (artifact) => artifact.id === 'runtime-skills' && artifact.role === 'runtime_sidecar',
    ),
    true,
  );
  assert.equal(
    targetManifest.artifacts.some(
      (artifact) => artifact.id === 'runtime-dependencies' && artifact.role === 'runtime_sidecar',
    ),
    true,
  );
  assert.equal(
    targetManifest.artifacts.some(
      (artifact) => artifact.id === 'windows-npm-prefix-helper-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    targetManifest.artifacts.some(
      (artifact) => artifact.id === 'windows-node-cli-pack-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    targetManifest.artifacts.some(
      (artifact) => artifact.id === 'windows-claude-native-installer-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    targetManifest.artifacts.some(
      (artifact) => artifact.id === 'windows-cursor-native-installer-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    targetManifest.artifacts.some(
      (artifact) => artifact.id === 'windows-goose-native-installer-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    targetManifest.artifacts.some(
      (artifact) => artifact.id === 'windows-junie-native-installer-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    targetManifest.artifacts.some(
      (artifact) => artifact.id === 'windows-wsl-prerequisite-preflight-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    targetManifest.artifacts.some(
      (artifact) => artifact.id === 'windows-wsl-environment-installer-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    targetManifest.artifacts.some(
      (artifact) => artifact.id === 'windows-kiro-native-installer-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    targetManifest.artifacts.some(
      (artifact) => artifact.id === 'windows-docker-desktop-installer-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    targetManifest.artifacts.some(
      (artifact) => artifact.id === 'windows-ollama-local-model-installer-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    targetManifest.artifacts.some(
      (artifact) => artifact.id === 'windows-setup-assets-manifest' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    targetManifest.artifacts.some(
      (artifact) => artifact.id === 'windows-setup-readiness-audit-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    targetManifest.artifacts.some(
      (artifact) => artifact.id === 'windows-hidden-process-support-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    linuxTargetManifest.installer.providerSetup.localProviders.some(
      (provider) => provider.id === 'opencode'
        && provider.platform === 'linux'
        && provider.helperIds.includes('linux-node-cli-pack'),
    ),
    true,
  );
  assert.equal(
    linuxTargetManifest.installer.providerSetup.localProviders.some(
      (provider) => provider.id === 'kiro'
        && provider.platform === 'linux'
        && provider.helperIds.includes('linux-kiro-native-installer'),
    ),
    true,
  );
  assert.equal(
    linuxTargetManifest.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'linux-install-readiness-audit'
        && helper.packagedRelativePath === 'desktop/setup-assets/linux/check-installation.sh',
    ),
    true,
  );
  assert.equal(
    linuxTargetManifest.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-install-readiness-audit',
    ),
    false,
  );
  assert.equal(
    linuxTargetManifest.artifacts.some(
      (artifact) => artifact.id === 'linux-setup-assets-manifest' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    linuxTargetManifest.artifacts.some(
      (artifact) => artifact.id === 'linux-node-cli-pack-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    linuxTargetManifest.artifacts.some(
      (artifact) => artifact.id === 'linux-provider-cli-common-support-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    linuxTargetManifest.artifacts.some(
      (artifact) => artifact.id === 'linux-node-cli-common-support-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
  assert.equal(
    linuxTargetManifest.artifacts.some(
      (artifact) => artifact.id === 'windows-node-cli-pack-script' && artifact.role === 'setup_asset',
    ),
    false,
  );
});

test('stageDesktopPackagingOutputs honors bundle layout for both app and runtime sidecars', async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-desktop-package-bundle-'));
  const packageRoot = join(workingDir, 'cats');
  const runtimeRoot = join(workingDir, 'cats-runtime');
  const outputRoot = join(workingDir, 'desktop-packaging');

  await seedFile(join(packageRoot, 'build', 'server', 'index.js'), 'export const layout = "split-app";');
  await seedPlatformServerBundle(packageRoot, 'export const layout = "bundle-app";');
  await seedFile(join(packageRoot, 'build', 'renderer', 'index.html'), '<!doctype html>');
  await seedFile(join(packageRoot, 'build', 'desktop', 'main.js'), 'export {};');
  await seedFile(join(packageRoot, 'build', 'desktop', 'preload.cjs'), 'module.exports = {};');
  await seedFile(join(packageRoot, 'package.json'), JSON.stringify({
    name: '@cats-inc/cats-platform',
    version: '0.1.0',
    type: 'module',
  }, null, 2));
  await seedWindowsSetupAssets(packageRoot);
  await seedRuntimeSidecar(runtimeRoot);
  await seedFile(join(runtimeRoot, 'build', 'runtime', 'index.js'), 'export const layout = "split-runtime";');
  await seedRuntimeBundle(runtimeRoot, 'export const layout = "bundle-runtime";');

  const config = resolveDesktopHostConfig({
    env: {
      CATS_DESKTOP_APP_ENTRY: join(packageRoot, 'build', 'server', 'index.js'),
      CATS_DESKTOP_RUNTIME_ENTRY: join(runtimeRoot, 'build', 'runtime', 'index.js'),
      CATS_DESKTOP_RUNTIME_ROOT: runtimeRoot,
      CATS_DESKTOP_PACKAGING_OUTPUT_ROOT: outputRoot,
    },
    userDataDir: join(workingDir, 'user-data'),
    catsHomeDir: join(workingDir, '.cats'),
  });
  const plan = await stageDesktopPackagingOutputs(config, {
    generatedAt: new Date('2026-03-24T12:05:00.000Z'),
    platforms: ['windows'],
    sidecarLayout: 'bundle',
  });

  assert.deepEqual(plan.sidecarLayout, {
    app: 'bundle',
    runtime: 'bundle',
  });
  assert.equal(
    await readFile(join(plan.outputRoot, 'shared', 'build', 'server', 'index.js'), 'utf8'),
    'export const layout = "bundle-app";',
  );
  assert.equal(
    await readFile(join(plan.outputRoot, 'shared', 'cats-runtime', 'build', 'runtime', 'index.js'), 'utf8'),
    'export const layout = "bundle-runtime";',
  );

  const assetMap = JSON.parse(await readFile(
    join(plan.outputRoot, 'shared', 'asset-map.json'),
    'utf8',
  ));
  const targetManifest = JSON.parse(await readFile(
    join(plan.outputRoot, 'targets', 'windows-x64', 'installer-manifest.json'),
    'utf8',
  ));
  assert.deepEqual(targetManifest.sidecarLayout, {
    app: 'bundle',
    runtime: 'bundle',
  });
  assert.deepEqual(assetMap.sidecarLayout, {
    app: 'bundle',
    runtime: 'bundle',
  });
  assert.equal(
    assetMap.assets.some(
      (asset) => asset.target === 'shared/build/server/index.js'
        && asset.source.replace(/\\/g, '/').endsWith('/server-bundle/index.js'),
    ),
    true,
  );
  assert.equal(
    assetMap.assets.some(
      (asset) => asset.target === 'shared/cats-runtime/build/runtime/index.js'
        && asset.source.replace(/\\/g, '/').endsWith('cats-runtime/build/runtime-bundle/index.js'),
    ),
    true,
  );
});

test('stageDesktopPackagingOutputs fails when cats-runtime sidecar build is missing', async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-desktop-package-missing-runtime-'));
  const packageRoot = join(workingDir, 'cats');
  const runtimeRoot = join(workingDir, 'cats-runtime');
  const outputRoot = join(workingDir, 'desktop-packaging');

  await seedFile(join(packageRoot, 'build', 'server', 'index.js'), 'export {};');
  await seedFile(join(packageRoot, 'build', 'renderer', 'index.html'), '<!doctype html>');
  await seedFile(join(packageRoot, 'build', 'desktop', 'main.js'), 'export {};');
  await seedFile(join(packageRoot, 'build', 'desktop', 'preload.cjs'), 'module.exports = {};');
  await seedFile(join(packageRoot, 'package.json'), JSON.stringify({
    name: '@cats-inc/cats-platform',
    version: '0.1.0',
    type: 'module',
  }, null, 2));
  await seedWindowsSetupAssets(packageRoot);
  await mkdir(runtimeRoot, { recursive: true });

  const config = resolveDesktopHostConfig({
    env: {
      CATS_DESKTOP_APP_ENTRY: join(packageRoot, 'build', 'server', 'index.js'),
      CATS_DESKTOP_RUNTIME_ENTRY: join(runtimeRoot, 'build', 'runtime', 'index.js'),
      CATS_DESKTOP_RUNTIME_ROOT: runtimeRoot,
      CATS_DESKTOP_PACKAGING_OUTPUT_ROOT: outputRoot,
    },
    userDataDir: join(workingDir, 'user-data'),
    catsHomeDir: join(workingDir, '.cats'),
  });

  await assert.rejects(
    stageDesktopPackagingOutputs(config, {
      generatedAt: new Date('2026-03-24T12:05:00.000Z'),
      platforms: ['windows'],
    }),
    /requires the requested cats-runtime sidecar layout \(split\)/,
  );
});

test('NSIS installer.nsh provides an uninstaller page for optional user-data removal', async () => {
  const nsh = await readFile(
    join(process.cwd(), 'assets', 'build', 'installer.nsh'),
    'utf8',
  );

  assert.match(nsh, /UninstPage custom un\.UserDataRemovalPage un\.UserDataRemovalPageLeave/);
  assert.match(nsh, /nsDialogs::Create 1018/);
  assert.match(nsh, /NSD_CreateCheckbox/);
  assert.match(nsh, /RemoveUserDataCheckbox/);
  assert.match(nsh, /RemoveUserDataState/);
  assert.match(nsh, /\$PROFILE\\\.cats/);
  assert.match(nsh, /RMDir \/r "\$PROFILE\\\.cats"/);
  assert.match(nsh, /RMDir \/r "\$APPDATA\\Cats"/);
  assert.match(nsh, /customUnInstall/);
});
