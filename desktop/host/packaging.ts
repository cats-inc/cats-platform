import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

import type { DesktopHostConfig } from './config.js';
import type {
  DesktopPackagingArtifact,
  DesktopInstallerContract,
  DesktopPackagingPlan,
  DesktopPackagingPlatform,
  DesktopSidecarLayout,
  DesktopSidecarLayoutSelection,
  DesktopPackagingTarget,
  DesktopUpdateChannel,
} from './contracts.js';
import {
  DESKTOP_SETUP_ASSETS,
  DESKTOP_SETUP_SUPPORT_ASSETS,
  stageDesktopSetupAssets,
} from './setupAssets.js';

interface DesktopPackagingPlanOptions {
  generatedAt?: Date;
  outputRoot?: string;
  platforms?: DesktopPackagingPlatform[] | null;
  sidecarLayout?: DesktopSidecarLayout | null;
}

interface RuntimePackageManifest {
  dependencies?: Record<string, string>;
}

interface RuntimeSidecarAsset {
  sourceRelativePath: string;
  targetRelativePath: string;
  directory: boolean;
}

interface DesktopStagedSidecarOutput {
  layout: DesktopSidecarLayout;
  sourceEntryPath: string;
  sourceMapPath: string | null;
  sourceDirectoryPath: string | null;
}

type DesktopHelperCatalogEntry = DesktopInstallerContract['providerSetup']['helperCatalog'][number];
type DesktopLocalProviderEntry = DesktopInstallerContract['providerSetup']['localProviders'][number];
type DesktopPrioritizedAssetEntry =
  DesktopInstallerContract['providerSetup']['prioritizedAssets'][number];

interface DesktopLocalProviderBaseline {
  id: DesktopLocalProviderEntry['id'];
  label: DesktopLocalProviderEntry['label'];
  pack: DesktopLocalProviderEntry['pack'];
  helperIds: string[];
  currentHome: string;
  targetHome: string;
  notes: string[];
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

const RUNTIME_PUBLIC_FILES = [
  'index.html',
  'playground.html',
  'provider-setup.html',
] as const;

interface PlatformSidecarAsset {
  sourceRelativePath: string;
  targetRelativePath: string;
  directory: boolean;
}

const PLATFORM_OPTIONAL_ASSETS: PlatformSidecarAsset[] = [
  {
    sourceRelativePath: join('config', 'provider-capability-bootstrap.yaml.example'),
    targetRelativePath: join('shared', 'cats-platform', 'config', 'provider-capability-bootstrap.yaml.example'),
    directory: false,
  },
];

const RUNTIME_OPTIONAL_ASSETS: RuntimeSidecarAsset[] = [
  {
    sourceRelativePath: 'public',
    targetRelativePath: join('shared', 'cats-runtime', 'public'),
    directory: true,
  },
  {
    sourceRelativePath: 'skills',
    targetRelativePath: join('shared', 'cats-runtime', 'skills'),
    directory: true,
  },
  {
    sourceRelativePath: 'node_modules',
    targetRelativePath: join('shared', 'cats-runtime', 'node_modules'),
    directory: true,
  },
  {
    sourceRelativePath: 'package.json',
    targetRelativePath: join('shared', 'cats-runtime', 'package.json'),
    directory: false,
  },
  {
    sourceRelativePath: join('config', 'management.yaml.example'),
    targetRelativePath: join('shared', 'cats-runtime', 'config', 'management.yaml.example'),
    directory: false,
  },
  {
    sourceRelativePath: join('config', 'providers.yaml.example'),
    targetRelativePath: join('shared', 'cats-runtime', 'config', 'providers.yaml.example'),
    directory: false,
  },
  {
    sourceRelativePath: join('config', 'curated-model-catalogs.yaml.example'),
    targetRelativePath: join('shared', 'cats-runtime', 'config', 'curated-model-catalogs.yaml.example'),
    directory: false,
  },
];

function defaultOutputRoot(config: DesktopHostConfig): string {
  return resolve(join(config.packageRoot, 'build', 'desktop-packaging'));
}

function resolveRequestedSidecarLayout(
  value: DesktopPackagingPlanOptions['sidecarLayout'] | string | undefined,
): DesktopSidecarLayout {
  if (value === undefined || value === null || value === '') {
    return 'split';
  }
  if (value === 'split' || value === 'bundle') {
    return value;
  }
  throw new Error(`Unsupported desktop sidecar layout: ${value}`);
}

function resolveSidecarLayoutSelection(
  value: DesktopPackagingPlanOptions['sidecarLayout'] | string | undefined,
): DesktopSidecarLayoutSelection {
  const layout = resolveRequestedSidecarLayout(value);
  return {
    app: layout,
    runtime: layout,
  };
}

function runtimeDependencyPackagePath(packageName: string): string {
  return join('node_modules', ...packageName.split('/'), 'package.json');
}

async function readRuntimePackageManifest(runtimePackageRoot: string): Promise<RuntimePackageManifest> {
  const raw = await readFile(join(runtimePackageRoot, 'package.json'), 'utf8');
  return JSON.parse(raw) as RuntimePackageManifest;
}

async function ensureBundledRuntimeAssets(runtimePackageRoot: string): Promise<string[]> {
  const manifest = await readRuntimePackageManifest(runtimePackageRoot);
  const dependencyPackagePaths = Object.keys(manifest.dependencies ?? {}).map((dependency) =>
    runtimeDependencyPackagePath(dependency)
  );
  const requiredPaths = [
    join(runtimePackageRoot, 'build', 'runtime', 'index.js'),
    join(runtimePackageRoot, 'package.json'),
    ...RUNTIME_PUBLIC_FILES.map((fileName) => join(runtimePackageRoot, 'public', fileName)),
    join(runtimePackageRoot, 'skills'),
    join(runtimePackageRoot, 'config', 'management.yaml.example'),
    join(runtimePackageRoot, 'config', 'providers.yaml.example'),
    join(runtimePackageRoot, 'config', 'curated-model-catalogs.yaml.example'),
    join(runtimePackageRoot, 'node_modules'),
    ...dependencyPackagePaths.map((dependencyPath) => join(runtimePackageRoot, dependencyPath)),
  ];

  await Promise.all(requiredPaths.map((path) => ensureRequiredFile(path)));
  return dependencyPackagePaths;
}

async function resolveAppServerStageSource(
  config: DesktopHostConfig,
  layout: DesktopSidecarLayout,
): Promise<DesktopStagedSidecarOutput> {
  if (layout === 'bundle') {
    const sourceEntryPath = join(config.packageRoot, 'build', 'server-bundle', 'index.js');
    const sourceMapPath = join(config.packageRoot, 'build', 'server-bundle', 'index.js.map');
    await ensureRequiredFile(sourceEntryPath);
    await ensureRequiredFile(sourceMapPath);
    return {
      layout,
      sourceEntryPath,
      sourceMapPath,
      sourceDirectoryPath: null,
    };
  }

  const sourceDirectoryPath = join(config.packageRoot, 'build', 'server');
  const sourceEntryPath = join(sourceDirectoryPath, 'index.js');
  await ensureRequiredFile(sourceEntryPath);
  return {
    layout,
    sourceEntryPath,
    sourceMapPath: null,
    sourceDirectoryPath,
  };
}

async function resolveRuntimeStageSource(
  runtimePackageRoot: string,
  layout: DesktopSidecarLayout,
): Promise<DesktopStagedSidecarOutput> {
  if (layout === 'bundle') {
    const sourceEntryPath = join(runtimePackageRoot, 'build', 'runtime-bundle', 'index.js');
    const sourceMapPath = join(runtimePackageRoot, 'build', 'runtime-bundle', 'index.js.map');
    await ensureRequiredFile(sourceEntryPath);
    await ensureRequiredFile(sourceMapPath);
    return {
      layout,
      sourceEntryPath,
      sourceMapPath,
      sourceDirectoryPath: null,
    };
  }

  const sourceDirectoryPath = join(runtimePackageRoot, 'build', 'runtime');
  const sourceEntryPath = join(sourceDirectoryPath, 'index.js');
  await ensureRequiredFile(sourceEntryPath);
  return {
    layout,
    sourceEntryPath,
    sourceMapPath: null,
    sourceDirectoryPath,
  };
}

async function stageSidecarOutput(
  output: DesktopStagedSidecarOutput,
  targetDirectory: string,
): Promise<void> {
  if (output.layout === 'split' && output.sourceDirectoryPath) {
    await copyDirectory(output.sourceDirectoryPath, targetDirectory);
    return;
  }

  await mkdir(targetDirectory, { recursive: true });
  await copyFile(output.sourceEntryPath, join(targetDirectory, 'index.js'));
  if (output.sourceMapPath) {
    await copyFile(output.sourceMapPath, join(targetDirectory, 'index.js.map'));
  }
}

function filterSetupAssetsForPlatforms<T extends { targetPlatforms: DesktopPackagingPlatform[] }>(
  assets: T[],
  allowedPlatforms: Set<DesktopPackagingPlatform> | null,
): T[] {
  if (allowedPlatforms === null) {
    return assets;
  }

  return assets.filter((asset) =>
    asset.targetPlatforms.some((platform) => allowedPlatforms.has(platform)));
}

function collapseProviderPlatform(
  helperCatalog: DesktopHelperCatalogEntry[],
  helperIds: string[],
): DesktopLocalProviderEntry['platform'] {
  const platforms = new Set(
    helperIds.flatMap((helperId) => {
      const helper = helperCatalog.find((candidate) => candidate.id === helperId);
      return helper ? [helper.platform] : [];
    }),
  );

  if (platforms.size === 1) {
    return [...platforms][0] ?? 'cross_platform';
  }

  return 'cross_platform';
}

function prioritizedTargetHome(
  helper: DesktopHelperCatalogEntry,
): DesktopPrioritizedAssetEntry['targetHome'] {
  switch (helper.kind) {
    case 'prerequisite_helper':
      return helper.pack === 'local_model_pack'
        ? 'cats-platform packaged-host capability pack assets'
        : 'cats-platform packaged-host prerequisite assets';
    case 'cli_pack_installer':
      return 'cats-platform packaged-host setup assets';
    case 'provider_installer':
      return helper.pack === 'local_model_pack'
        ? 'cats-platform packaged-host capability pack assets'
        : 'cats-platform packaged-host provider assets';
    case 'readiness_helper':
      return 'cats-platform packaged-host diagnostics helpers';
    case 'provider_metadata':
      return 'cats-platform packaged host runtime bridge';
  }
}

function prioritizedAssetId(helper: DesktopHelperCatalogEntry): string {
  if (helper.id === 'windows-docker-desktop-installer') {
    return 'windows-docker-local-model-helper';
  }
  return helper.id;
}

function buildHelperCatalog(
  allowedPlatforms: Set<DesktopPackagingPlatform> | null,
): DesktopHelperCatalogEntry[] {
  return filterSetupAssetsForPlatforms(DESKTOP_SETUP_ASSETS, allowedPlatforms).map((asset) => ({
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
    supportsUninstall: asset.supportsUninstall,
    requiresElevation: asset.requiresElevation,
    resumable: asset.resumable,
    notes: asset.notes,
  }));
}

const LOCAL_PROVIDER_BASELINES: DesktopLocalProviderBaseline[] = [
  {
    id: 'claude_code',
    label: 'Claude Code',
    pack: 'native_cli_pack',
    helperIds: [
      'windows-claude-native-installer',
      'linux-claude-native-installer',
      'macos-claude-native-installer',
    ],
    currentHome: 'cats-platform/scripts/{windows,linux,macos}/Install-ClaudeCode.{ps1,sh}',
    targetHome: 'cats-platform packaged-host provider assets',
    notes: [
      'Repo-owned packaged helper coverage now spans Windows, macOS, and Linux hosts.',
    ],
  },
  {
    id: 'cursor_agent',
    label: 'Cursor Agent',
    pack: 'native_cli_pack',
    helperIds: [
      'windows-cursor-native-installer',
      'linux-cursor-native-installer',
      'macos-cursor-native-installer',
    ],
    currentHome: 'cats-platform/scripts/{windows,linux,macos}/Install-CursorAgent.{ps1,sh}',
    targetHome: 'cats-platform packaged-host provider assets',
    notes: [
      'Repo-owned packaged helper coverage now spans Windows, macOS, and Linux hosts.',
    ],
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    pack: 'native_cli_pack',
    helperIds: [
      'windows-node-cli-pack',
      'linux-node-cli-pack',
      'macos-node-cli-pack',
    ],
    currentHome: 'cats-platform/scripts/{windows,linux,macos}/Install-NodeCliPack.{ps1,sh}',
    targetHome: 'cats-platform packaged-host setup assets',
    notes: [
      'Bundled through the repo-owned packaged npm-global CLI pack helper on each supported host platform.',
    ],
  },
  {
    id: 'kilo',
    label: 'Kilo',
    pack: 'native_cli_pack',
    helperIds: [
      'windows-node-cli-pack',
      'linux-node-cli-pack',
      'macos-node-cli-pack',
    ],
    currentHome: 'cats-platform/scripts/{windows,linux,macos}/Install-NodeCliPack.{ps1,sh}',
    targetHome: 'cats-platform packaged-host setup assets',
    notes: [
      'Bundled through the repo-owned packaged npm-global CLI pack helper on each supported host platform.',
      'Keeps Kilo immediately after OpenCode in the packaged local-provider rollout.',
    ],
  },
  {
    id: 'kiro',
    label: 'Kiro CLI',
    pack: 'native_cli_pack',
    helperIds: [
      'windows-kiro-native-installer',
      'linux-kiro-native-installer',
      'macos-kiro-native-installer',
    ],
    currentHome: 'cats-platform/scripts/{windows,linux,macos}/Install-Kiro{Cli.ps1,-Cli.sh}',
    targetHome: 'cats-platform packaged-host provider assets',
    notes: [
      'Repo-owned packaged helper coverage now spans Windows, macOS, and Linux hosts.',
    ],
  },
  {
    id: 'goose',
    label: 'Goose CLI',
    pack: 'native_cli_pack',
    helperIds: [
      'windows-goose-native-installer',
      'linux-goose-native-installer',
      'macos-goose-native-installer',
    ],
    currentHome: 'cats-platform/scripts/{windows,linux,macos}/Install-Goose.{ps1,sh}',
    targetHome: 'cats-platform packaged-host provider assets',
    notes: [
      'Repo-owned packaged helper coverage now spans Windows, macOS, and Linux hosts.',
    ],
  },
  {
    id: 'junie',
    label: 'Junie CLI',
    pack: 'native_cli_pack',
    helperIds: [
      'windows-junie-native-installer',
      'linux-junie-native-installer',
      'macos-junie-native-installer',
    ],
    currentHome: 'cats-platform/scripts/{windows,linux,macos}/Install-Junie.{ps1,sh}',
    targetHome: 'cats-platform packaged-host provider assets',
    notes: [
      'Repo-owned packaged helper coverage now spans Windows, macOS, and Linux hosts.',
    ],
  },
  {
    id: 'ollama',
    label: 'Ollama',
    pack: 'local_model_pack',
    helperIds: ['windows-ollama-local-model-installer'],
    currentHome: 'cats-platform/scripts/windows/Install-Ollama.ps1',
    targetHome: 'cats-platform packaged-host capability pack assets',
    notes: [
      'The first packaged local-model runtime remains Windows-only until the Unix local-model helper slice lands.',
    ],
  },
];

function buildLocalProviders(helperCatalog: DesktopHelperCatalogEntry[]): DesktopLocalProviderEntry[] {
  const helperIds = new Set(helperCatalog.map((helper) => helper.id));

  return LOCAL_PROVIDER_BASELINES.flatMap((provider) => {
    const bundledHelperIds = provider.helperIds.filter((helperId) => helperIds.has(helperId));
    if (bundledHelperIds.length === 0) {
      return [];
    }

    return [{
      ...provider,
      platform: collapseProviderPlatform(helperCatalog, bundledHelperIds),
      deliveryPhase: 'initial_packaged_path' as const,
      bundledInCurrentInstaller: true,
      helperIds: bundledHelperIds,
    }];
  });
}

function buildPrioritizedAssets(helperCatalog: DesktopHelperCatalogEntry[]): DesktopPrioritizedAssetEntry[] {
  return [
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
    ...helperCatalog.map((helper) => ({
      id: prioritizedAssetId(helper),
      label: helper.label,
      kind: helper.kind,
      status: 'ported' as const,
      pack: helper.pack,
      platform: helper.platform,
      currentHome: `cats-platform/${DESKTOP_SETUP_ASSETS.find((asset) => asset.helperId === helper.id)?.sourceRelativePath ?? ''}`,
      targetHome: prioritizedTargetHome(helper),
      notes: helper.notes,
    })),
  ];
}

function buildInstallerContract(
  channel: DesktopUpdateChannel,
  allowedPlatforms: Set<DesktopPackagingPlatform> | null,
): DesktopInstallerContract {
  const helperCatalog = buildHelperCatalog(allowedPlatforms);

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
            'Repo-owned packaged helper coverage now spans Windows, macOS, and Linux hosts.',
            'Combines npm-global Node CLI tools with native Unix and native Windows installers, including Kiro on the same host-native path.',
          ],
        },
        {
          id: 'local_model_pack',
          label: 'Local Model Pack',
          recommended: false,
          requiresLocalInstall: true,
          notes: [
            'Current packaged helper coverage includes Docker Desktop installation, engine warm-state recovery, and a repo-owned Ollama runtime helper.',
            'Heavier expert-only local runtime follow-through still remains a later slice.',
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
      localProviders: buildLocalProviders(helperCatalog),
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
      helperCatalog,
      prioritizedAssets: buildPrioritizedAssets(helperCatalog),
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
  const setupAssets = DESKTOP_SETUP_ASSETS.filter((asset) => asset.targetPlatforms.includes(target.platform));
  const setupSupportAssets = DESKTOP_SETUP_SUPPORT_ASSETS.filter((asset) =>
    asset.targetPlatforms.includes(target.platform));
  const sharedAssets: Array<Omit<DesktopPackagingArtifact, 'required'>> = [
    { id: 'electron-main', relativePath: 'shared/build/desktop/main.js', role: 'electron_host' as const },
    { id: 'electron-preload', relativePath: 'shared/build/desktop/preload.cjs', role: 'electron_host' as const },
    { id: 'app-server', relativePath: 'shared/build/server/index.js', role: 'app_server' as const },
    { id: 'app-renderer', relativePath: 'shared/build/renderer/index.html', role: 'app_renderer' as const },
    { id: 'app-package-manifest', relativePath: 'shared/app-sidecar/package.json', role: 'app_server' as const },
    {
      id: 'platform-config-bootstrap-example',
      relativePath: 'shared/cats-platform/config/provider-capability-bootstrap.yaml.example',
      role: 'app_server' as const,
    },
    { id: 'runtime-sidecar', relativePath: 'shared/cats-runtime/build/runtime/index.js', role: 'runtime_sidecar' as const },
    { id: 'runtime-package-manifest', relativePath: 'shared/cats-runtime/package.json', role: 'runtime_sidecar' as const },
    { id: 'runtime-setup-ui', relativePath: 'shared/cats-runtime/public/provider-setup.html', role: 'runtime_sidecar' as const },
    { id: 'runtime-skills', relativePath: 'shared/cats-runtime/skills/README.md', role: 'runtime_sidecar' as const },
    { id: 'runtime-dependencies', relativePath: 'shared/cats-runtime/node_modules/yaml/package.json', role: 'runtime_sidecar' as const },
    { id: 'installer-manifest', relativePath: `targets/${target.id}/installer-manifest.json`, role: 'manifest' as const },
  ];
  if (setupAssets.length > 0 || setupSupportAssets.length > 0) {
    sharedAssets.push({
      id: `${target.platform}-setup-assets-manifest`,
      relativePath: 'shared/setup-assets/manifest.json',
      role: 'setup_asset' as const,
    });
    for (const asset of setupAssets) {
      sharedAssets.push({
        id: asset.id,
        relativePath: asset.stageRelativePath,
        role: 'setup_asset' as const,
      });
    }
    for (const asset of setupSupportAssets) {
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
  const sidecarLayout = resolveSidecarLayoutSelection(options.sidecarLayout);
  const allowedPlatforms = options.platforms && options.platforms.length > 0
    ? new Set(options.platforms)
    : null;

  return {
    strategy: 'electron-sidecar-bundle',
    generatedAt: generatedAt.toISOString(),
    outputRoot,
    sidecarLayout,
    selfHostedNpmCompatible: true,
    targets: PACKAGING_TARGETS
      .filter((target) => allowedPlatforms === null || allowedPlatforms.has(target.platform))
      .map((target) => buildPackagingTarget(config, outputRoot, target)),
    installer: buildInstallerContract(config.update.channel, allowedPlatforms),
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
  await ensureRequiredFile(join(config.packageRoot, 'build', 'renderer', 'index.html'));
  await ensureRequiredFile(join(config.packageRoot, 'build', 'desktop', 'main.js'));
  await ensureRequiredFile(config.paths.preloadScript);
  await ensureRequiredFile(join(config.packageRoot, 'package.json'));
}

async function ensureBundledPlatformAssets(packageRoot: string): Promise<void> {
  await Promise.all(
    PLATFORM_OPTIONAL_ASSETS.map((asset) =>
      ensureRequiredFile(join(packageRoot, asset.sourceRelativePath))),
  );
}

async function copyDirectory(source: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true });
  await cp(source, target, {
    recursive: true,
    force: true,
  });
}

async function copyFile(source: string, target: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, {
    force: true,
  });
}

async function writeInstallerManifest(
  plan: DesktopPackagingPlan,
  target: DesktopPackagingTarget,
): Promise<void> {
  const manifestPath = join(target.stageDirectory, 'installer-manifest.json');
  const installer = buildInstallerContract(plan.updates.channel, new Set([target.platform]));
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
    sidecarLayout: plan.sidecarLayout,
    installer,
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
  const sidecarLayout = resolveSidecarLayoutSelection(options.sidecarLayout);
  const plan = createDesktopPackagingPlan(config, {
    generatedAt,
    outputRoot,
    platforms: options.platforms,
    sidecarLayout: sidecarLayout.app,
  });
  const allowedPlatforms = new Set(plan.targets.map((target) => target.platform));

  await ensureBuiltAssets(config);
  await ensureBundledPlatformAssets(config.packageRoot);
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(join(outputRoot, 'shared'), { recursive: true });

  const appServerStageSource = await resolveAppServerStageSource(config, sidecarLayout.app);
  await stageSidecarOutput(
    appServerStageSource,
    join(outputRoot, 'shared', 'build', 'server'),
  );
  await copyDirectory(join(config.packageRoot, 'build', 'renderer'), join(outputRoot, 'shared', 'build', 'renderer'));
  await copyDirectory(join(config.packageRoot, 'build', 'desktop'), join(outputRoot, 'shared', 'build', 'desktop'));
  await copyFile(join(config.packageRoot, 'package.json'), join(outputRoot, 'shared', 'app-sidecar', 'package.json'));
  for (const asset of PLATFORM_OPTIONAL_ASSETS) {
    const sourcePath = join(config.packageRoot, asset.sourceRelativePath);
    const targetPath = join(outputRoot, asset.targetRelativePath);
    if (asset.directory) {
      await copyDirectory(sourcePath, targetPath);
    } else {
      await copyFile(sourcePath, targetPath);
    }
  }
  const setupAssets = await stageDesktopSetupAssets(
    config.packageRoot,
    outputRoot,
    generatedAt,
    [...allowedPlatforms],
  );
  const setupSupportAssets = filterSetupAssetsForPlatforms(
    DESKTOP_SETUP_SUPPORT_ASSETS,
    allowedPlatforms,
  );

  let runtimeDependencyPackagePaths: string[] = [];
  let runtimeStageSource: DesktopStagedSidecarOutput | null = null;
  try {
    runtimeDependencyPackagePaths = await ensureBundledRuntimeAssets(config.runtimePackageRoot);
    runtimeStageSource = await resolveRuntimeStageSource(
      config.runtimePackageRoot,
      sidecarLayout.runtime,
    );
    await stageSidecarOutput(
      runtimeStageSource,
      join(outputRoot, 'shared', 'cats-runtime', 'build', 'runtime'),
    );
    for (const asset of RUNTIME_OPTIONAL_ASSETS) {
      const sourcePath = join(config.runtimePackageRoot, asset.sourceRelativePath);
      const targetPath = join(outputRoot, asset.targetRelativePath);
      if (asset.directory) {
        await copyDirectory(sourcePath, targetPath);
      } else {
        await copyFile(sourcePath, targetPath);
      }
    }
  } catch (error) {
    throw new Error(
      `Desktop packaging requires the requested cats-runtime sidecar layout `
      + `(${sidecarLayout.runtime}) under ${config.runtimePackageRoot}. `
      + `Build cats-runtime with the same sidecar layout and install its runtime dependencies `
      + `before staging or packaging the desktop host. `
      + `Root cause: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  await writeFile(join(outputRoot, 'desktop-package-plan.json'), JSON.stringify(plan, null, 2));
  await writeFile(join(outputRoot, 'shared', 'asset-map.json'), JSON.stringify({
    copiedAt: generatedAt.toISOString(),
    sidecarLayout,
    roots: {
      app: '.',
      runtime: '../cats-runtime',
    },
    assets: [
      {
        source: relative(outputRoot, appServerStageSource.sourceEntryPath),
        target: 'shared/build/server/index.js',
      },
      {
        source: relative(outputRoot, join(config.packageRoot, 'build', 'renderer', 'index.html')),
        target: 'shared/build/renderer/index.html',
      },
      {
        source: relative(outputRoot, join(config.packageRoot, 'package.json')),
        target: 'shared/app-sidecar/package.json',
      },
      ...PLATFORM_OPTIONAL_ASSETS.map((asset) => ({
        source: relative(outputRoot, join(config.packageRoot, asset.sourceRelativePath)),
        target: asset.targetRelativePath,
      })),
      {
        source: relative(outputRoot, join(config.packageRoot, 'build', 'desktop', 'main.js')),
        target: 'shared/build/desktop/main.js',
      },
      {
        source: relative(outputRoot, config.paths.preloadScript),
        target: 'shared/build/desktop/preload.cjs',
      },
      {
        source: relative(outputRoot, runtimeStageSource?.sourceEntryPath ?? join(config.runtimePackageRoot, 'build', 'runtime', 'index.js')),
        target: 'shared/cats-runtime/build/runtime/index.js',
      },
      {
        source: relative(outputRoot, join(config.runtimePackageRoot, 'package.json')),
        target: 'shared/cats-runtime/package.json',
      },
      {
        source: relative(outputRoot, join(config.runtimePackageRoot, 'public', 'provider-setup.html')),
        target: 'shared/cats-runtime/public/provider-setup.html',
      },
      {
        source: relative(outputRoot, join(config.runtimePackageRoot, 'skills')),
        target: 'shared/cats-runtime/skills',
      },
      {
        source: relative(outputRoot, join(config.runtimePackageRoot, 'config', 'providers.yaml.example')),
        target: 'shared/cats-runtime/config/providers.yaml.example',
      },
      ...runtimeDependencyPackagePaths.map((dependencyPath) => ({
        source: relative(outputRoot, join(config.runtimePackageRoot, dependencyPath)),
        target: join('shared', 'cats-runtime', dependencyPath),
      })),
      ...setupAssets.map((asset) => ({
        source: relative(outputRoot, join(config.packageRoot, asset.sourceRelativePath)),
        target: asset.stageRelativePath,
      })),
      ...setupSupportAssets.map((asset) => ({
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
