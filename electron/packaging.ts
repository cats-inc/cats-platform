import { access, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import type { DesktopHostConfig } from './config.js';
import type {
  DesktopInstallerContract,
  DesktopPackagingPlan,
  DesktopPackagingPlatform,
  DesktopPackagingTarget,
  DesktopUpdateChannel,
} from './contracts.js';

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
    remediationActions: [
      {
        kind: 'retry',
        label: 'Retry startup or prerequisite scan',
        resumable: true,
        requiresRestart: false,
        docsPath: 'cats/docs/deployment.md',
      },
      {
        kind: 'open_runtime_diagnostics',
        label: 'Open runtime diagnostics',
        resumable: true,
        requiresRestart: false,
        docsPath: 'cats/docs/deployment.md',
      },
      {
        kind: 'open_setup',
        label: 'Open setup for provider remediation',
        resumable: true,
        requiresRestart: false,
        docsPath: 'cats/docs/setup-guide.md',
      },
      {
        kind: 'reinstall_host',
        label: `Re-run the ${channel} desktop installer`,
        resumable: false,
        requiresRestart: true,
        docsPath: 'cats/docs/deployment.md',
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
  const sharedAssets = [
    { id: 'electron-main', relativePath: 'shared/dist-electron/main.js', role: 'electron_host' as const },
    { id: 'electron-preload', relativePath: 'shared/dist-electron/preload.cjs', role: 'electron_host' as const },
    { id: 'app-server', relativePath: 'shared/dist-server/index.js', role: 'app_server' as const },
    { id: 'app-renderer', relativePath: 'shared/dist/index.html', role: 'app_renderer' as const },
    { id: 'runtime-sidecar', relativePath: 'shared/cats-runtime/dist/index.js', role: 'runtime_sidecar' as const },
    { id: 'installer-manifest', relativePath: `targets/${target.id}/installer-manifest.json`, role: 'manifest' as const },
  ];

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
    ],
  }, null, 2));

  for (const target of plan.targets) {
    await writeInstallerManifest(plan, target);
  }

  return plan;
}
