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
      CATS_DESKTOP_APP_ENTRY: 'C:/repo/cats-platform/dist-server/index.js',
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
      (provider) => provider.id === 'kiro'
        && provider.pack === 'native_cli_pack'
        && provider.platform === 'windows_wsl'
        && provider.deliveryPhase === 'initial_packaged_path'
        && provider.bundledInCurrentInstaller === true
        && provider.helperIds.includes('windows-kiro-wsl-installer'),
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
      (helper) => helper.id === 'windows-kiro-wsl-installer'
        && helper.assetId === 'windows-kiro-wsl-installer-script'
        && helper.platform === 'windows_wsl'
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
      (asset) => asset.id === 'windows-kiro-wsl-installer' && asset.status === 'ported',
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
  const windowsTarget = plan.targets.find((target) => target.id === 'windows-x64');
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
      (artifact) => artifact.id === 'windows-kiro-wsl-installer-script' && artifact.role === 'setup_asset',
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
      (artifact) => artifact.id === 'windows-setup-readiness-audit-script' && artifact.role === 'setup_asset',
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
  assert.equal(packageJson.build.extraResources.some(
    (entry) => entry.to === 'desktop-host/setup-assets',
  ), true);
});

test('Windows installer smoke-check script validates bundled sidecars and host state', async () => {
  const script = await readFile(
    join(process.cwd(), 'scripts', 'windows', 'Test-WindowsInstallerSmoke.ps1'),
    'utf8',
  );

  assert.match(script, /app-sidecar\\dist-server\\index\.js/);
  assert.match(script, /app-sidecar\\dist\\index\.html/);
  assert.match(script, /cats-runtime\\dist\\index\.js/);
  assert.match(script, /desktop-host\\setup-assets\\windows\\Setup-NodeGlobalPrefix\.ps1/);
  assert.match(script, /desktop-host\\setup-assets\\windows\\Install-NodeCliPack\.ps1/);
  assert.match(script, /desktop-host\\setup-assets\\windows\\Install-ClaudeCode\.ps1/);
  assert.match(script, /desktop-host\\setup-assets\\windows\\Install-CursorAgent\.ps1/);
  assert.match(script, /desktop-host\\setup-assets\\windows\\Install-Goose\.ps1/);
  assert.match(script, /desktop-host\\setup-assets\\windows\\Install-Junie\.ps1/);
  assert.match(script, /desktop-host\\setup-assets\\windows\\Check-WslPrerequisites\.ps1/);
  assert.match(script, /desktop-host\\setup-assets\\windows\\Install-WslUbuntuEnvironment\.ps1/);
  assert.match(script, /desktop-host\\setup-assets\\windows\\Install-KiroWslCli\.ps1/);
  assert.match(script, /desktop-host\\setup-assets\\windows\\Install-DockerDesktop\.ps1/);
  assert.match(script, /desktop-host\\setup-assets\\windows\\Check-WindowsSetupReadiness\.ps1/);
  assert.match(script, /desktop-host\\setup-assets\\manifest\.json/);
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
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Setup-NodeGlobalPrefix.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-NodeCliPack.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-ClaudeCode.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-CursorAgent.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-Goose.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-Junie.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Check-WslPrerequisites.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-WslUbuntuEnvironment.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-KiroWslCli.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-DockerDesktop.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Check-WindowsSetupReadiness.ps1'), '# helper');
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
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'windows', 'Setup-NodeGlobalPrefix.ps1'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'windows', 'Install-NodeCliPack.ps1'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'windows', 'Install-ClaudeCode.ps1'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'windows', 'Install-CursorAgent.ps1'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'windows', 'Install-Goose.ps1'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'windows', 'Install-Junie.ps1'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'windows', 'Check-WslPrerequisites.ps1'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'windows', 'Install-WslUbuntuEnvironment.ps1'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'windows', 'Install-KiroWslCli.ps1'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'windows', 'Install-DockerDesktop.ps1'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'windows', 'Check-WindowsSetupReadiness.ps1'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'manifest.json'));
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
        && provider.currentHome === 'cats-platform/scripts/windows/Install-Junie.ps1',
    ),
    true,
  );
  assert.equal(
    targetManifest.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-claude-native-installer'
        && helper.packagedRelativePath === 'desktop-host/setup-assets/windows/Install-ClaudeCode.ps1'
        && helper.supportsForce === true,
    ),
    true,
  );
  assert.equal(
    targetManifest.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-cursor-native-installer'
        && helper.packagedRelativePath === 'desktop-host/setup-assets/windows/Install-CursorAgent.ps1'
        && helper.supportsUpgrade === true,
    ),
    true,
  );
  assert.equal(
    targetManifest.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-goose-native-installer'
        && helper.packagedRelativePath === 'desktop-host/setup-assets/windows/Install-Goose.ps1'
        && helper.supportsForce === true,
    ),
    true,
  );
  assert.equal(
    targetManifest.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-junie-native-installer'
        && helper.packagedRelativePath === 'desktop-host/setup-assets/windows/Install-Junie.ps1'
        && helper.supportsUpgrade === true,
    ),
    true,
  );
  assert.equal(
    targetManifest.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-node-cli-pack'
        && helper.packagedRelativePath === 'desktop-host/setup-assets/windows/Install-NodeCliPack.ps1'
        && helper.supportsUpgrade === true,
    ),
    true,
  );
  assert.equal(
    targetManifest.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-wsl-environment-installer'
        && helper.packagedRelativePath === 'desktop-host/setup-assets/windows/Install-WslUbuntuEnvironment.ps1'
        && helper.supportsForce === true,
    ),
    true,
  );
  assert.equal(
    targetManifest.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-kiro-wsl-installer'
        && helper.packagedRelativePath === 'desktop-host/setup-assets/windows/Install-KiroWslCli.ps1'
        && helper.platform === 'windows_wsl',
    ),
    true,
  );
  assert.equal(
    targetManifest.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-docker-desktop-installer'
        && helper.packagedRelativePath === 'desktop-host/setup-assets/windows/Install-DockerDesktop.ps1'
        && helper.requiresElevation === true,
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
      (artifact) => artifact.id === 'windows-kiro-wsl-installer-script' && artifact.role === 'setup_asset',
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
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Setup-NodeGlobalPrefix.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-NodeCliPack.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-ClaudeCode.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-CursorAgent.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-Goose.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-Junie.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Check-WslPrerequisites.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-WslUbuntuEnvironment.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-KiroWslCli.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-DockerDesktop.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Check-WindowsSetupReadiness.ps1'), '# helper');
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
