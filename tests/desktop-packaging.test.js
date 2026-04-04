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

async function seedRuntimeSidecar(runtimeRoot) {
  await seedFile(join(runtimeRoot, 'dist', 'index.js'), 'export {};');
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
  await seedFile(join(runtimeRoot, 'config', 'providers.yaml.example'), 'version: 1\n');
  await seedFile(join(runtimeRoot, 'node_modules', '@hono', 'node-server', 'package.json'), '{"name":"@hono/node-server"}');
  await seedFile(join(runtimeRoot, 'node_modules', 'hono', 'package.json'), '{"name":"hono"}');
  await seedFile(join(runtimeRoot, 'node_modules', 'playwright-core', 'package.json'), '{"name":"playwright-core"}');
  await seedFile(join(runtimeRoot, 'node_modules', 'yaml', 'package.json'), '{"name":"yaml"}');
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
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-KiroWslCli.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-DockerDesktop.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Install-Ollama.ps1'), '# helper');
  await seedFile(join(packageRoot, 'scripts', 'windows', 'Check-WindowsSetupReadiness.ps1'), '# helper');
}

async function seedSharedUnixSetupAssets(packageRoot) {
  await seedFile(join(packageRoot, 'scripts', 'shared', 'unix-provider-cli-common.sh'), '#!/usr/bin/env bash\n');
  await seedFile(join(packageRoot, 'scripts', 'shared', 'unix-node-cli-common.sh'), '#!/usr/bin/env bash\n');
}

async function seedUnixSetupAssets(packageRoot, platform) {
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
        && provider.helperIds.includes('windows-kiro-wsl-installer')
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
      (artifact) => artifact.id === 'unix-provider-cli-common-support-script' && artifact.role === 'setup_asset',
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
      (artifact) => artifact.id === 'unix-node-cli-common-support-script' && artifact.role === 'setup_asset',
    ),
    true,
  );
});

test('package.json wires Windows, macOS, and Linux installer targets through electron-builder', async () => {
  const packageJson = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8'));

  assert.equal(packageJson.main, 'dist-electron/main.js');
  assert.equal(Object.hasOwn(packageJson, 'types'), false);
  assert.equal(packageJson.scripts['desktop:package:linux'], 'node scripts/build-desktop-installer.mjs --target linux');
  assert.equal(packageJson.scripts['desktop:package:macos'], 'node scripts/build-desktop-installer.mjs --target macos');
  assert.equal(packageJson.scripts['desktop:package:windows'], 'node scripts/build-desktop-installer.mjs --target windows');
  assert.equal(packageJson.scripts['desktop:smoke:linux'], 'bash ./scripts/linux/test-linux-package-smoke.sh');
  assert.equal(packageJson.scripts['desktop:smoke:macos'], 'bash ./scripts/macos/test-macos-package-smoke.sh');
  assert.equal(packageJson.scripts['start:server'], 'node dist-server/index.js');
  assert.equal(packageJson.build.extraMetadata?.name, 'cats');
  assert.equal(packageJson.build.win.target[0].target, 'nsis');
  assert.equal(packageJson.build.mac.target.some((entry) => entry.target === 'dmg'), true);
  assert.equal(packageJson.build.mac.target.some((entry) => entry.target === 'pkg'), true);
  assert.equal(packageJson.build.mac.target.some((entry) => entry.target === 'zip'), true);
  assert.equal(packageJson.build.linux.target.some((entry) => entry.target === 'AppImage'), true);
  assert.equal(packageJson.build.linux.target.some((entry) => entry.target === 'deb'), true);
  assert.equal(packageJson.build.linux.target.some((entry) => entry.target === 'tar.gz'), true);
  assert.equal(packageJson.build.nsis.oneClick, false);
  assert.equal(packageJson.build.extraResources.some(
    (entry) => entry.to === 'desktop-host/setup-assets',
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

test('Windows installer smoke-check script validates bundled sidecars and host state', async () => {
  const script = await readFile(
    join(process.cwd(), 'scripts', 'windows', 'Test-WindowsInstallerSmoke.ps1'),
    'utf8',
  );

  assert.match(script, /app-sidecar\\dist-server\\index\.js/);
  assert.match(script, /app-sidecar\\dist\\index\.html/);
  assert.match(script, /app-sidecar\\package\.json/);
  assert.match(script, /cats-runtime\\dist\\index\.js/);
  assert.match(script, /cats-runtime\\package\.json/);
  assert.match(script, /cats-runtime\\public\\provider-setup\.html/);
  assert.match(script, /cats-runtime\\skills\\README\.md/);
  assert.match(script, /cats-runtime\\config\\providers\.yaml\.example/);
  assert.match(script, /cats-runtime\\node_modules\\yaml\\package\.json/);
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
  assert.match(script, /desktop-host\\setup-assets\\windows\\Install-Ollama\.ps1/);
  assert.match(script, /desktop-host\\setup-assets\\windows\\Check-WindowsSetupReadiness\.ps1/);
  assert.match(script, /providerSetup\.localProviders/);
  assert.match(script, /id -eq 'opencode'/);
  assert.match(script, /id -eq 'kilo'/);
  assert.match(script, /windows-ollama-local-model-installer/);
  assert.match(script, /windows-docker-desktop-installer/);
  assert.match(script, /desktop-host\\setup-assets\\manifest\.json/);
  assert.match(script, /desktop-host\\state\.json/);
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
  assert.match(linuxScript, /desktop-host\/setup-assets\/linux\/setup-node-global-prefix\.sh/);
  assert.match(linuxScript, /desktop-host\/setup-assets\/shared\/unix-provider-cli-common\.sh/);
  assert.match(linuxScript, /linux-node-cli-pack-script/);
  assert.match(linuxScript, /linux-install-readiness-audit/);
  assert.match(macosScript, /release\/mac-universal\/Cats\.app/);
  assert.match(macosScript, /desktop-host\/setup-assets\/macos\/setup-node-global-prefix\.sh/);
  assert.match(macosScript, /desktop-host\/setup-assets\/shared\/unix-node-cli-common\.sh/);
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
  assert.match(script, /case 'darwin':/);
  assert.match(script, /case 'linux':/);
  assert.match(script, /--mac/);
  assert.match(script, /--linux/);
  assert.match(script, /npm-cli\.js/);
  assert.match(script, /npx-cli\.js/);
  assert.match(script, /process\.execPath/);
  assert.match(script, /shell: false/);
  assert.match(linuxWrapper, /build-desktop-installer\.mjs --target linux/);
  assert.match(macosWrapper, /build-desktop-installer\.mjs --target macos/);
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
  await seedFile(join(packageRoot, 'package.json'), JSON.stringify({
    name: '@cats-inc/cats-platform',
    version: '0.1.0',
    type: 'module',
  }, null, 2));
  await seedWindowsSetupAssets(packageRoot);
  await seedSharedUnixSetupAssets(packageRoot);
  await seedUnixSetupAssets(packageRoot, 'linux');
  await seedRuntimeSidecar(runtimeRoot);

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
  await access(join(plan.outputRoot, 'shared', 'app-sidecar', 'package.json'));
  await access(join(plan.outputRoot, 'shared', 'dist-electron', 'main.js'));
  await access(join(plan.outputRoot, 'shared', 'dist-electron', 'preload.cjs'));
  await access(join(plan.outputRoot, 'shared', 'cats-runtime', 'dist', 'index.js'));
  await access(join(plan.outputRoot, 'shared', 'cats-runtime', 'package.json'));
  await access(join(plan.outputRoot, 'shared', 'cats-runtime', 'public', 'provider-setup.html'));
  await access(join(plan.outputRoot, 'shared', 'cats-runtime', 'skills', 'README.md'));
  await access(join(plan.outputRoot, 'shared', 'cats-runtime', 'config', 'providers.yaml.example'));
  await access(join(plan.outputRoot, 'shared', 'cats-runtime', 'node_modules', 'yaml', 'package.json'));
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
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'shared', 'unix-provider-cli-common.sh'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'shared', 'unix-node-cli-common.sh'));
  await access(join(plan.outputRoot, 'shared', 'setup-assets', 'manifest.json'));
  await access(join(plan.outputRoot, 'targets', 'windows-x64', 'installer-manifest.json'));
  await access(join(plan.outputRoot, 'targets', 'linux-x64', 'installer-manifest.json'));

  const targetManifest = JSON.parse(await readFile(
    join(plan.outputRoot, 'targets', 'windows-x64', 'installer-manifest.json'),
    'utf8',
  ));
  const linuxTargetManifest = JSON.parse(await readFile(
    join(plan.outputRoot, 'targets', 'linux-x64', 'installer-manifest.json'),
    'utf8',
  ));
  assert.equal(targetManifest.target.platform, 'windows');
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
    targetManifest.installer.providerSetup.helperCatalog.some(
      (helper) => helper.id === 'windows-ollama-local-model-installer'
        && helper.packagedRelativePath === 'desktop-host/setup-assets/windows/Install-Ollama.ps1'
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
        && helper.packagedRelativePath === 'desktop-host/setup-assets/linux/check-installation.sh',
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
      (artifact) => artifact.id === 'unix-provider-cli-common-support-script' && artifact.role === 'setup_asset',
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

test('stageDesktopPackagingOutputs fails when cats-runtime sidecar build is missing', async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-desktop-package-missing-runtime-'));
  const packageRoot = join(workingDir, 'cats');
  const runtimeRoot = join(workingDir, 'cats-runtime');
  const outputRoot = join(workingDir, 'desktop-packaging');

  await seedFile(join(packageRoot, 'dist-server', 'index.js'), 'export {};');
  await seedFile(join(packageRoot, 'dist', 'index.html'), '<!doctype html>');
  await seedFile(join(packageRoot, 'dist-electron', 'main.js'), 'export {};');
  await seedFile(join(packageRoot, 'dist-electron', 'preload.cjs'), 'module.exports = {};');
  await seedFile(join(packageRoot, 'package.json'), JSON.stringify({
    name: '@cats-inc/cats-platform',
    version: '0.1.0',
    type: 'module',
  }, null, 2));
  await seedWindowsSetupAssets(packageRoot);
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
    /requires the full bundled cats-runtime sidecar/,
  );
});
