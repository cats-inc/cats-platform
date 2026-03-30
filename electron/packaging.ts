import { access, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import type { DesktopHostConfig } from './config.js';
import type {
  DesktopPackagingArtifact,
  DesktopInstallerContract,
  DesktopPackagingPlan,
  DesktopPackagingPlatform,
  DesktopPackagingTarget,
  DesktopUpdateChannel,
} from './contracts.js';
import { DESKTOP_SETUP_ASSETS, stageDesktopSetupAssets } from './setupAssets.js';

interface DesktopPackagingPlanOptions {
  generatedAt?: Date;
  outputRoot?: string;
  platforms?: DesktopPackagingPlatform[] | null;
}

const PACKAGING_TARGETS: Array<{
  id: string;
  platform: DesktopPackagingTarget['platform'];
  arch: DesktopPackagingTarget['arch'];
  installerFormats: DesktopPackagingTarget['installerFormats'];
}> = [
  {
    id: 'windows-x64',
    platform: 'windows',
    arch: 'x64',
    installerFormats: ['nsis', 'msi', 'zip'],
  },
  {
    id: 'windows-arm64',
    platform: 'windows',
    arch: 'arm64',
    installerFormats: ['nsis', 'msi', 'zip'],
  },
  {
    id: 'macos-universal',
    platform: 'macos',
    arch: 'universal',
    installerFormats: ['dmg', 'pkg', 'zip'],
  },
  {
    id: 'linux-x64',
    platform: 'linux',
    arch: 'x64',
    installerFormats: ['appimage', 'deb', 'tar.gz'],
  },
  {
    id: 'linux-arm64',
    platform: 'linux',
    arch: 'arm64',
    installerFormats: ['appimage', 'deb', 'tar.gz'],
  },
];

function defaultOutputRoot(config: DesktopHostConfig): string {
  return resolve(join(config.packageRoot, 'build', 'desktop-packaging'));
}

function buildInstallerContract(channel: DesktopUpdateChannel): DesktopInstallerContract {
  return {
    prerequisiteChecks: [
      {
        id: 'bundled_app_assets',
        label: 'Verify bundled Electron, server, and renderer assets',
        hostOwned: true,
        resumable: false,
      },
      {
        id: 'bundled_runtime_sidecar',
        label: 'Verify bundled cats-runtime sidecar availability',
        hostOwned: true,
        resumable: false,
      },
      {
        id: 'first_run_provider_scan',
        label: 'Run host-managed provider scan before first chat entry',
        hostOwned: true,
        resumable: true,
      },
    ],
    providerSetup: {
      baselineMode: 'api_baseline',
      modes: [
        {
          id: 'api_baseline',
          label: 'API Baseline (Recommended)',
          description: 'Fastest packaged path with no local CLI install required before first chat.',
          requiresLocalInstall: false,
        },
        {
          id: 'api_plus_local_cli',
          label: 'API + Local CLI',
          description: 'Start from the API baseline, then add local CLI capability packs.',
          requiresLocalInstall: true,
        },
        {
          id: 'local_cli_only',
          label: 'Local CLI Only',
          description: 'Use only local CLI providers once prerequisite and auth flows succeed.',
          requiresLocalInstall: true,
        },
      ],
      capabilityPacks: [
        {
          id: 'api_baseline',
          label: 'API Baseline (Recommended)',
          recommended: true,
          requiresLocalInstall: false,
          notes: [
            'No local provider install required for first use.',
            'Keeps packaged setup usable even when no CLI tool is installed yet.',
          ],
        },
        {
          id: 'native_cli_pack',
          label: 'Native CLI Pack',
          recommended: false,
          requiresLocalInstall: true,
          notes: [
            'Windows-first knowledge-porting target from environment-bootstrap.',
            'Combines npm-global node CLI tools, native Windows installers, and the current first WSL-backed Kiro path.',
          ],
        },
        {
          id: 'local_model_pack',
          label: 'Local Model Pack',
          recommended: false,
          requiresLocalInstall: true,
          notes: [
            'Current packaged helper coverage includes Docker Desktop installation plus engine warm-state recovery.',
            'Broader Ollama and heavier local runtime follow-through still remains a later slice.',
          ],
        },
        {
          id: 'wsl_power_user_pack',
          label: 'WSL / Power User Pack',
          recommended: false,
          requiresLocalInstall: true,
          notes: [
            'Reserved for future WSL-first or expert-only setup flows beyond the current native CLI baseline.',
          ],
        },
      ],
      localProviders: [
        {
          id: 'claude_code',
          label: 'Claude Code',
          pack: 'native_cli_pack',
          platform: 'windows',
          deliveryPhase: 'initial_packaged_path',
          bundledInCurrentInstaller: true,
          helperIds: ['windows-claude-native-installer'],
          currentHome: 'cats-platform/scripts/windows/Install-ClaudeCode.ps1',
          targetHome: 'cats-platform packaged-host provider assets',
          notes: [
            'Repo-owned native Windows installer helper is already bundled into the current desktop packaging flow.',
          ],
        },
        {
          id: 'cursor_agent',
          label: 'Cursor Agent',
          pack: 'native_cli_pack',
          platform: 'windows',
          deliveryPhase: 'initial_packaged_path',
          bundledInCurrentInstaller: true,
          helperIds: ['windows-cursor-native-installer'],
          currentHome: 'cats-platform/scripts/windows/Install-CursorAgent.ps1',
          targetHome: 'cats-platform packaged-host provider assets',
          notes: [
            'Repo-owned native Windows installer helper keeps Cursor on the first packaged path.',
          ],
        },
        {
          id: 'kiro',
          label: 'Kiro CLI',
          pack: 'native_cli_pack',
          platform: 'windows_wsl',
          deliveryPhase: 'initial_packaged_path',
          bundledInCurrentInstaller: true,
          helperIds: ['windows-kiro-wsl-installer'],
          currentHome: 'cats-platform/scripts/windows/Install-KiroWslCli.ps1',
          targetHome: 'cats-platform packaged-host provider assets',
          notes: [
            'The current packaged path includes one repo-owned WSL-backed provider installer, and that installer is Kiro.',
          ],
        },
        {
          id: 'goose',
          label: 'Goose CLI',
          pack: 'native_cli_pack',
          platform: 'windows',
          deliveryPhase: 'initial_packaged_path',
          bundledInCurrentInstaller: true,
          helperIds: ['windows-goose-native-installer'],
          currentHome: 'cats-platform/scripts/windows/Install-Goose.ps1',
          targetHome: 'cats-platform packaged-host provider assets',
          notes: [
            'Repo-owned native Windows installer helper now keeps Goose on the current packaged setup path.',
            'Uses the Windows-native installer and leaves only post-install auth as explicit host-owned follow-through.',
          ],
        },
        {
          id: 'junie',
          label: 'Junie CLI',
          pack: 'native_cli_pack',
          platform: 'windows',
          deliveryPhase: 'initial_packaged_path',
          bundledInCurrentInstaller: true,
          helperIds: ['windows-junie-native-installer'],
          currentHome: 'cats-platform/scripts/windows/Install-Junie.ps1',
          targetHome: 'cats-platform packaged-host provider assets',
          notes: [
            'Repo-owned native Windows installer helper now keeps Junie on the current packaged setup path.',
            'Preserves the post-install JetBrains sign-in follow-through as an explicit packaged setup interruption.',
          ],
        },
      ],
      knowledgeSources: [
        {
          id: 'cats-runtime',
          role: 'provider_metadata',
          productDependency: true,
          notes: [
            'Keeps provider family topology and install/check metadata runtime-owned.',
            'Packaged host should consume this metadata instead of duplicating it.',
          ],
        },
        {
          id: 'environment-bootstrap',
          role: 'install_execution',
          productDependency: false,
          notes: [
            'Source knowledge repo for install/check execution helpers and platform edge cases.',
            'Must be ported into product-owned assets before repo split; do not ship as a direct dependency.',
          ],
        },
        {
          id: 'project-bootstrap',
          role: 'a2a_pilot',
          productDependency: false,
          notes: [
            'Sourced the sibling A2A/bootstrap pilot already mirrored into cats docs and skills.',
            'Referenced for collaboration consistency, not as a packaged setup dependency.',
          ],
        },
      ],
      executionDefaults: {
        hostOwned: true,
        rendererShellAccess: false,
        nonInteractiveDefault: true,
        structuredResultsRequired: true,
      },
      helperCatalog: DESKTOP_SETUP_ASSETS.map((asset) => ({
        id: asset.helperId,
        assetId: asset.id,
        label: asset.label,
        kind: asset.kind,
        pack: asset.pack,
        platform: asset.platform,
        packagedRelativePath: asset.packagedRelativePath,
        supportsCheckOnly: asset.supportsCheckOnly,
        supportsApply: asset.supportsApply,
        supportsUpgrade: asset.supportsUpgrade,
        supportsForce: asset.supportsForce,
        requiresElevation: asset.requiresElevation,
        resumable: asset.resumable,
        notes: asset.notes,
      })),
      prioritizedAssets: [
        {
          id: 'runtime-provider-metadata',
          label: 'Runtime provider metadata consumption',
          kind: 'provider_metadata',
          status: 'ported',
          pack: null,
          platform: 'cross_platform',
          currentHome: 'cats-runtime/src/core/provider-install',
          targetHome: 'cats-platform packaged host runtime bridge',
          notes: [
            'Consume runtime-owned provider install/check metadata rather than duplicating it in cats-platform.',
          ],
        },
        {
          id: 'windows-npm-prefix-helper',
          label: 'Windows npm prefix and PATH prerequisite helper',
          kind: 'prerequisite_helper',
          status: 'ported',
          pack: 'native_cli_pack',
          platform: 'windows',
          currentHome: 'cats-platform/scripts/windows/Setup-NodeGlobalPrefix.ps1',
          targetHome: 'cats-platform packaged-host setup assets',
          notes: [
            'Repo-owned rewrite of the user-scoped npm prefix and PATH prerequisite helper.',
            'Required before npm-global CLI installs are reliable for the packaged host.',
          ],
        },
        {
          id: 'windows-node-cli-pack',
          label: 'Windows npm-global AI CLI pack installer',
          kind: 'cli_pack_installer',
          status: 'ported',
          pack: 'native_cli_pack',
          platform: 'windows',
          currentHome: 'cats-platform/scripts/windows/Install-NodeCliPack.ps1',
          targetHome: 'cats-platform packaged-host setup assets',
          notes: [
            'Repo-owned rewrite of the Windows npm-global AI CLI pack installer.',
            'Covers Codex, Gemini, Copilot, OpenCode, Auggie, and Pi in one Windows-first slice.',
          ],
        },
        {
          id: 'windows-claude-native-installer',
          label: 'Windows native Claude Code installer',
          kind: 'provider_installer',
          status: 'ported',
          pack: 'native_cli_pack',
          platform: 'windows',
          currentHome: 'cats-platform/scripts/windows/Install-ClaudeCode.ps1',
          targetHome: 'cats-platform packaged-host provider assets',
          notes: [
            'Repo-owned rewrite of the native Windows Claude Code installer flow.',
            'Removes legacy npm-installed Claude shims so the native installer remains the packaged setup baseline.',
          ],
        },
        {
          id: 'windows-cursor-native-installer',
          label: 'Windows native Cursor Agent installer',
          kind: 'provider_installer',
          status: 'ported',
          pack: 'native_cli_pack',
          platform: 'windows',
          currentHome: 'cats-platform/scripts/windows/Install-CursorAgent.ps1',
          targetHome: 'cats-platform packaged-host provider assets',
          notes: [
            'Repo-owned rewrite of the native Windows Cursor Agent installer flow.',
            'Keeps Cursor on the Windows-native install path instead of routing first through WSL.',
          ],
        },
        {
          id: 'windows-goose-native-installer',
          label: 'Windows native Goose installer',
          kind: 'provider_installer',
          status: 'ported',
          pack: 'native_cli_pack',
          platform: 'windows',
          currentHome: 'cats-platform/scripts/windows/Install-Goose.ps1',
          targetHome: 'cats-platform packaged-host provider assets',
          notes: [
            'Repo-owned rewrite of the native Windows Goose installer flow.',
            'Keeps Goose on the current packaged setup path without depending on environment-bootstrap or a separate WSL variant.',
          ],
        },
        {
          id: 'windows-junie-native-installer',
          label: 'Windows native Junie installer',
          kind: 'provider_installer',
          status: 'ported',
          pack: 'native_cli_pack',
          platform: 'windows',
          currentHome: 'cats-platform/scripts/windows/Install-Junie.ps1',
          targetHome: 'cats-platform packaged-host provider assets',
          notes: [
            'Repo-owned rewrite of the native Windows Junie installer flow.',
            'Keeps JetBrains sign-in follow-through explicit while removing deferred-provider ambiguity from the packaged path.',
          ],
        },
        {
          id: 'windows-wsl-prerequisite-preflight',
          label: 'Windows WSL prerequisite preflight',
          kind: 'prerequisite_helper',
          status: 'ported',
          pack: 'native_cli_pack',
          platform: 'windows',
          currentHome: 'cats-platform/scripts/windows/Check-WslPrerequisites.ps1',
          targetHome: 'cats-platform packaged-host prerequisite assets',
          notes: [
            'Repo-owned structured preflight slice for WSL readiness before feature enablement and distro installation.',
          ],
        },
        {
          id: 'windows-wsl-environment-installer',
          label: 'Windows WSL substrate and Ubuntu installer',
          kind: 'prerequisite_helper',
          status: 'ported',
          pack: 'native_cli_pack',
          platform: 'windows',
          currentHome: 'cats-platform/scripts/windows/Install-WslUbuntuEnvironment.ps1',
          targetHome: 'cats-platform packaged-host prerequisite assets',
          notes: [
            'Repo-owned rewrite of the WSL substrate enablement and Ubuntu distro registration flow.',
            'Returns restart-required after substrate mutation so the packaged host can resume distro install cleanly after reboot.',
            'Keeps in-distro Ubuntu package upgrades as a later manual follow-through rather than pretending that part is production-automated already.',
          ],
        },
        {
          id: 'windows-kiro-wsl-installer',
          label: 'Windows WSL Kiro installer',
          kind: 'provider_installer',
          status: 'ported',
          pack: 'native_cli_pack',
          platform: 'windows_wsl',
          currentHome: 'cats-platform/scripts/windows/Install-KiroWslCli.ps1',
          targetHome: 'cats-platform packaged-host provider assets',
          notes: [
            'Repo-owned rewrite of the Kiro WSL installer flow, including PATH cleanup, kc alias repair, and post-install sign-in guidance.',
          ],
        },
        {
          id: 'windows-install-readiness-audit',
          label: 'Windows host prerequisite and auth-state audit helper',
          kind: 'readiness_helper',
          status: 'ported',
          pack: 'native_cli_pack',
          platform: 'windows',
          currentHome: 'cats-platform/scripts/windows/Check-WindowsSetupReadiness.ps1',
          targetHome: 'cats-platform packaged-host diagnostics helpers',
          notes: [
            'Repo-owned structured audit that composes the Windows prefix, native CLI pack, and WSL preflight helpers.',
            'Complements runtime diagnostics for host-only prerequisite and warm-state checks.',
          ],
        },
        {
          id: 'windows-docker-local-model-helper',
          label: 'Windows Docker/local-model prerequisite helper',
          kind: 'prerequisite_helper',
          status: 'ported',
          pack: 'local_model_pack',
          platform: 'windows',
          currentHome: 'cats-platform/scripts/windows/Install-DockerDesktop.ps1',
          targetHome: 'cats-platform packaged-host capability pack assets',
          notes: [
            'Repo-owned rewrite of the Windows Docker Desktop install and warm-state helper.',
            'Keeps Docker install mutation and engine warm-up on a structured host-owned contract instead of leaving them in source knowledge only.',
          ],
        },
      ],
    },
    remediationActions: [
      {
        kind: 'retry',
        label: 'Retry startup or prerequisite scan',
        resumable: true,
        requiresRestart: false,
        docsPath: 'cats-platform/docs/deployment.md',
      },
      {
        kind: 'open_runtime_diagnostics',
        label: 'Open runtime diagnostics',
        resumable: true,
        requiresRestart: false,
        docsPath: 'cats-platform/docs/deployment.md',
      },
      {
        kind: 'open_setup',
        label: 'Open setup for provider remediation',
        resumable: true,
        requiresRestart: false,
        docsPath: 'cats-platform/docs/setup-guide.md',
      },
      {
        kind: 'reinstall_host',
        label: `Re-run the ${channel} desktop installer`,
        resumable: false,
        requiresRestart: true,
        docsPath: 'cats-platform/docs/deployment.md',
      },
    ],
    requiresBundledRuntimeSidecar: true,
  };
}

function buildPackagingTarget(
  config: DesktopHostConfig,
  outputRoot: string,
  target: (typeof PACKAGING_TARGETS)[number],
): DesktopPackagingTarget {
  const stageDirectory = join(outputRoot, 'targets', target.id);
  const sharedAssets: Array<Omit<DesktopPackagingArtifact, 'required'>> = [
    { id: 'electron-main', relativePath: 'shared/dist-electron/main.js', role: 'electron_host' as const },
    { id: 'electron-preload', relativePath: 'shared/dist-electron/preload.cjs', role: 'electron_host' as const },
    { id: 'app-server', relativePath: 'shared/dist-server/index.js', role: 'app_server' as const },
    { id: 'app-renderer', relativePath: 'shared/dist/index.html', role: 'app_renderer' as const },
    { id: 'runtime-sidecar', relativePath: 'shared/cats-runtime/dist/index.js', role: 'runtime_sidecar' as const },
    { id: 'installer-manifest', relativePath: `targets/${target.id}/installer-manifest.json`, role: 'manifest' as const },
  ];
  if (target.platform === 'windows') {
    sharedAssets.push({
      id: 'windows-setup-assets-manifest',
      relativePath: 'shared/setup-assets/manifest.json',
      role: 'setup_asset' as const,
    });
    for (const asset of DESKTOP_SETUP_ASSETS) {
      sharedAssets.push({
        id: asset.id,
        relativePath: asset.stageRelativePath,
        role: 'setup_asset' as const,
      });
    }
  }

  return {
    id: target.id,
    platform: target.platform,
    arch: target.arch,
    installerFormats: target.installerFormats,
    artifactBaseName: `cats-${target.id}`,
    stageDirectory,
    artifacts: sharedAssets.map((artifact) => ({
      ...artifact,
      required: true,
    })),
  };
}

export function createDesktopPackagingPlan(
  config: DesktopHostConfig,
  options: DesktopPackagingPlanOptions = {},
): DesktopPackagingPlan {
  const generatedAt = options.generatedAt ?? new Date();
  const outputRoot = resolve(options.outputRoot ?? defaultOutputRoot(config));
  const allowedPlatforms = options.platforms && options.platforms.length > 0
    ? new Set(options.platforms)
    : null;

  return {
    strategy: 'electron-sidecar-bundle',
    generatedAt: generatedAt.toISOString(),
    outputRoot,
    selfHostedNpmCompatible: true,
    targets: PACKAGING_TARGETS
      .filter((target) => allowedPlatforms === null || allowedPlatforms.has(target.platform))
      .map((target) => buildPackagingTarget(config, outputRoot, target)),
    installer: buildInstallerContract(config.update.channel),
    updates: {
      channel: config.update.channel,
      autoCheckOnStartup: config.update.checkOnStartup,
      autoDownload: config.update.autoDownload,
      manifestUrl: config.update.manifestUrl,
    },
  };
}

async function ensureRequiredFile(path: string): Promise<void> {
  await access(path);
}

async function ensureBuiltAssets(config: DesktopHostConfig): Promise<void> {
  await ensureRequiredFile(config.paths.appEntryScript);
  await ensureRequiredFile(join(config.packageRoot, 'dist', 'index.html'));
  await ensureRequiredFile(join(config.packageRoot, 'dist-electron', 'main.js'));
  await ensureRequiredFile(config.paths.preloadScript);
}

async function copyDirectory(source: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true });
  await cp(source, target, {
    recursive: true,
    force: true,
  });
}

async function writeInstallerManifest(
  plan: DesktopPackagingPlan,
  target: DesktopPackagingTarget,
): Promise<void> {
  const manifestPath = join(target.stageDirectory, 'installer-manifest.json');
  await mkdir(target.stageDirectory, { recursive: true });
  await writeFile(manifestPath, JSON.stringify({
    target: {
      id: target.id,
      platform: target.platform,
      arch: target.arch,
      installerFormats: target.installerFormats,
      artifactBaseName: target.artifactBaseName,
    },
    strategy: plan.strategy,
    installer: plan.installer,
    updates: plan.updates,
    artifacts: target.artifacts,
  }, null, 2));
}

export async function stageDesktopPackagingOutputs(
  config: DesktopHostConfig,
  options: DesktopPackagingPlanOptions = {},
): Promise<DesktopPackagingPlan> {
  const generatedAt = options.generatedAt ?? new Date();
  const outputRoot = resolve(options.outputRoot ?? defaultOutputRoot(config));
  const plan = createDesktopPackagingPlan(config, {
    generatedAt,
    outputRoot,
    platforms: options.platforms,
  });

  await ensureBuiltAssets(config);
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(join(outputRoot, 'shared'), { recursive: true });

  await copyDirectory(join(config.packageRoot, 'dist-server'), join(outputRoot, 'shared', 'dist-server'));
  await copyDirectory(join(config.packageRoot, 'dist'), join(outputRoot, 'shared', 'dist'));
  await copyDirectory(join(config.packageRoot, 'dist-electron'), join(outputRoot, 'shared', 'dist-electron'));
  const setupAssets = await stageDesktopSetupAssets(config.packageRoot, outputRoot, generatedAt);

  const runtimeDistRoot = join(config.runtimePackageRoot, 'dist');
  try {
    await ensureRequiredFile(join(runtimeDistRoot, 'index.js'));
    await copyDirectory(runtimeDistRoot, join(outputRoot, 'shared', 'cats-runtime', 'dist'));
  } catch (error) {
    throw new Error(
      `Desktop packaging requires a bundled cats-runtime sidecar at ${join(runtimeDistRoot, 'index.js')}. `
      + `Build cats-runtime first before staging or packaging the desktop host.`,
      { cause: error },
    );
  }

  await writeFile(join(outputRoot, 'desktop-package-plan.json'), JSON.stringify(plan, null, 2));
  await writeFile(join(outputRoot, 'shared', 'asset-map.json'), JSON.stringify({
    copiedAt: generatedAt.toISOString(),
    roots: {
      app: '.',
      runtime: '../cats-runtime',
    },
    assets: [
      {
        source: relative(outputRoot, config.paths.appEntryScript),
        target: 'shared/dist-server/index.js',
      },
      {
        source: relative(outputRoot, join(config.packageRoot, 'dist', 'index.html')),
        target: 'shared/dist/index.html',
      },
      {
        source: relative(outputRoot, join(config.packageRoot, 'dist-electron', 'main.js')),
        target: 'shared/dist-electron/main.js',
      },
      {
        source: relative(outputRoot, config.paths.preloadScript),
        target: 'shared/dist-electron/preload.cjs',
      },
      {
        source: relative(outputRoot, join(runtimeDistRoot, 'index.js')),
        target: 'shared/cats-runtime/dist/index.js',
      },
      ...setupAssets.map((asset) => ({
        source: relative(outputRoot, join(config.packageRoot, asset.sourceRelativePath)),
        target: asset.stageRelativePath,
      })),
      {
        source: relative(outputRoot, join(outputRoot, 'shared', 'setup-assets', 'manifest.json')),
        target: 'shared/setup-assets/manifest.json',
      },
    ],
  }, null, 2));

  for (const target of plan.targets) {
    await writeInstallerManifest(plan, target);
  }

  return plan;
}
