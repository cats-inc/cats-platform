import { access, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { DesktopPackagingPlatform } from './contracts.js';

export interface DesktopSetupAsset {
  id: string;
  helperId: string;
  label: string;
  kind: 'prerequisite_helper' | 'cli_pack_installer' | 'provider_installer' | 'readiness_helper';
  pack: 'native_cli_pack' | 'local_model_pack' | 'wsl_power_user_pack' | null;
  platform: 'windows' | 'windows_wsl' | 'macos' | 'linux';
  sourceRelativePath: string;
  stageRelativePath: string;
  packagedRelativePath: string;
  targetPlatforms: DesktopPackagingPlatform[];
  supportsCheckOnly: boolean;
  supportsApply: boolean;
  supportsUpgrade: boolean;
  supportsForce: boolean;
  supportsUninstall: boolean;
  requiresElevation: boolean;
  resumable: boolean;
  notes: string[];
}

export interface DesktopSetupSupportAsset {
  id: string;
  label: string;
  sourceRelativePath: string;
  stageRelativePath: string;
  packagedRelativePath: string;
  targetPlatforms: DesktopPackagingPlatform[];
  notes: string[];
}

type UnixAssetPlatform = 'linux' | 'macos';

function createUnixSetupAssets(platform: UnixAssetPlatform): DesktopSetupAsset[] {
  const platformLabel = platform === 'linux' ? 'Linux' : 'macOS';
  const sourceRoot = `scripts/${platform}`;
  const stageRoot = `shared/setup-assets/${platform}`;
  const packagedRoot = `desktop/setup-assets/${platform}`;

  return [
    {
      id: `${platform}-node-host-installer-script`,
      helperId: `${platform}-node-host-installer`,
      label: `${platformLabel} Node.js LTS host installer`,
      kind: 'prerequisite_helper',
      pack: 'native_cli_pack',
      platform,
      sourceRelativePath: `${sourceRoot}/install-node.sh`,
      stageRelativePath: `${stageRoot}/install-node.sh`,
      packagedRelativePath: `${packagedRoot}/install-node.sh`,
      targetPlatforms: [platform],
      supportsCheckOnly: true,
      supportsApply: true,
      supportsUpgrade: true,
      supportsForce: true,
      supportsUninstall: false,
      requiresElevation: false,
      resumable: true,
      notes: [
        `Installs or upgrades Node.js LTS via nvm in the user's home directory so the packaged ${platformLabel} host can run npm-global CLI installers without sudo.`,
        'Uninstall is intentionally omitted: removing Node would break the bundled cats-runtime sidecar and every npm-global CLI helper.',
      ],
    },
    {
      id: `${platform}-github-cli-installer-script`,
      helperId: `${platform}-github-cli-installer`,
      label: `${platformLabel} GitHub CLI host installer`,
      kind: 'prerequisite_helper',
      pack: 'native_cli_pack',
      platform,
      sourceRelativePath: `${sourceRoot}/install-github-cli.sh`,
      stageRelativePath: `${stageRoot}/install-github-cli.sh`,
      packagedRelativePath: `${packagedRoot}/install-github-cli.sh`,
      targetPlatforms: [platform],
      supportsCheckOnly: true,
      supportsApply: true,
      supportsUpgrade: true,
      supportsForce: true,
      supportsUninstall: false,
      requiresElevation: false,
      resumable: true,
      notes: [
        `Installs or upgrades GitHub CLI (gh) using Homebrew when present and a user-local tarball install otherwise, so the packaged ${platformLabel} host can drive the Copilot CLI flow without sudo.`,
        'Uninstall is intentionally omitted to keep the surface symmetric with the Node host installer.',
      ],
    },
    {
      id: `${platform}-npm-prefix-helper-script`,
      helperId: `${platform}-npm-prefix-helper`,
      label: `${platformLabel} npm prefix and PATH prerequisite helper`,
      kind: 'prerequisite_helper',
      pack: 'native_cli_pack',
      platform,
      sourceRelativePath: `${sourceRoot}/setup-node-global-prefix.sh`,
      stageRelativePath: `${stageRoot}/setup-node-global-prefix.sh`,
      packagedRelativePath: `${packagedRoot}/setup-node-global-prefix.sh`,
      targetPlatforms: [platform],
      supportsCheckOnly: true,
      supportsApply: true,
      supportsUpgrade: true,
      supportsForce: true,
      supportsUninstall: false,
      requiresElevation: false,
      resumable: true,
      notes: [
        `Prepares a user-scoped npm prefix and PATH entry for packaged ${platformLabel} CLI installs.`,
      ],
    },
    ...([
      ['claude', 'claude-code.sh', 'Claude Code'],
      ['cursor', 'cursor-agent.sh', 'Cursor Agent'],
      ['goose', 'goose.sh', 'Goose'],
      ['junie', 'junie.sh', 'Junie'],
      ['kiro', 'kiro-cli.sh', 'Kiro CLI'],
      ['codex', 'codex.sh', 'OpenAI Codex CLI'],
      ['gemini', 'gemini.sh', 'Gemini CLI'],
      ['copilot', 'copilot.sh', 'GitHub Copilot CLI'],
      ['opencode', 'opencode.sh', 'OpenCode'],
      ['kilo', 'kilo.sh', 'Kilo Code CLI'],
      ['auggie', 'auggie.sh', 'Auggie CLI'],
      ['pi', 'pi.sh', 'Pi Coding Agent'],
    ] as const).map(([providerId, scriptSuffix, providerLabel]) => ({
      id: `${platform}-${providerId}-native-installer-script`,
      helperId: `${platform}-${providerId}-native-installer`,
      label: `${platformLabel} ${providerLabel} installer`,
      kind: 'provider_installer' as const,
      pack: 'native_cli_pack' as const,
      platform,
      sourceRelativePath: `${sourceRoot}/install-${scriptSuffix}`,
      stageRelativePath: `${stageRoot}/install-${scriptSuffix}`,
      packagedRelativePath: `${packagedRoot}/install-${scriptSuffix}`,
      targetPlatforms: [platform],
      supportsCheckOnly: true,
      supportsApply: true,
      supportsUpgrade: true,
      supportsForce: true,
      supportsUninstall: true,
      requiresElevation: false,
      resumable: true,
      notes: [
        `Installs or upgrades ${providerLabel} on packaged ${platformLabel} hosts with the repo-owned Unix helper contract.`,
      ],
    })),
    {
      id: `${platform}-setup-readiness-audit-script`,
      helperId: `${platform}-install-readiness-audit`,
      label: `${platformLabel} setup readiness audit`,
      kind: 'readiness_helper',
      pack: 'native_cli_pack',
      platform,
      sourceRelativePath: `${sourceRoot}/check-installation.sh`,
      stageRelativePath: `${stageRoot}/check-installation.sh`,
      packagedRelativePath: `${packagedRoot}/check-installation.sh`,
      targetPlatforms: [platform],
      supportsCheckOnly: true,
      supportsApply: false,
      supportsUpgrade: false,
      supportsForce: false,
      supportsUninstall: false,
      requiresElevation: false,
      resumable: true,
      notes: [
        `Composes the packaged ${platformLabel} helper baseline into one host-side readiness audit.`,
      ],
    },
  ];
}

function createUnixSetupSupportAssets(platform: UnixAssetPlatform): DesktopSetupSupportAsset[] {
  const platformLabel = platform === 'linux' ? 'Linux' : 'macOS';
  const sourceRoot = `scripts/${platform}`;
  const stageRoot = `shared/setup-assets/${platform}`;
  const packagedRoot = `desktop/setup-assets/${platform}`;

  return [
    {
      id: `${platform}-provider-cli-common-support-script`,
      label: `${platformLabel} packaged setup provider helper library`,
      sourceRelativePath: `${sourceRoot}/provider-cli-common.sh`,
      stageRelativePath: `${stageRoot}/provider-cli-common.sh`,
      packagedRelativePath: `${packagedRoot}/provider-cli-common.sh`,
      targetPlatforms: [platform],
      notes: [
        `Platform-local ${platformLabel} provider installer library that packaged helpers source at runtime.`,
      ],
    },
    {
      id: `${platform}-node-cli-common-support-script`,
      label: `${platformLabel} packaged setup npm helper library`,
      sourceRelativePath: `${sourceRoot}/node-cli-common.sh`,
      stageRelativePath: `${stageRoot}/node-cli-common.sh`,
      packagedRelativePath: `${packagedRoot}/node-cli-common.sh`,
      targetPlatforms: [platform],
      notes: [
        `Platform-local ${platformLabel} npm/install audit library that packaged helpers source at runtime.`,
      ],
    },
  ];
}

export const DESKTOP_SETUP_ASSETS: DesktopSetupAsset[] = [
  {
    id: 'windows-node-host-installer-script',
    helperId: 'windows-node-host-installer',
    label: 'Windows Node.js LTS host installer',
    kind: 'prerequisite_helper',
    pack: 'native_cli_pack',
    platform: 'windows',
    sourceRelativePath: 'scripts/windows/Install-Node.ps1',
    stageRelativePath: 'shared/setup-assets/windows/Install-Node.ps1',
    packagedRelativePath: 'desktop/setup-assets/windows/Install-Node.ps1',
    targetPlatforms: ['windows'],
    supportsCheckOnly: true,
    supportsApply: true,
    supportsUpgrade: true,
    supportsForce: true,
    supportsUninstall: false,
    requiresElevation: true,
    resumable: true,
    notes: [
      'Installs or upgrades Node.js LTS via winget (with an MSI fallback) so packaged Cats hosts can run npm-global CLI installers.',
      'Self-elevates through UAC for the actual install; -CheckOnly stays user-scoped for the Settings>Runtime probe.',
      'Uninstall is intentionally omitted: removing Node would break the bundled cats-runtime sidecar and every npm-global CLI helper.',
    ],
  },
  {
    id: 'windows-github-cli-installer-script',
    helperId: 'windows-github-cli-installer',
    label: 'Windows GitHub CLI host installer',
    kind: 'prerequisite_helper',
    pack: 'native_cli_pack',
    platform: 'windows',
    sourceRelativePath: 'scripts/windows/Install-GitHubCli.ps1',
    stageRelativePath: 'shared/setup-assets/windows/Install-GitHubCli.ps1',
    packagedRelativePath: 'desktop/setup-assets/windows/Install-GitHubCli.ps1',
    targetPlatforms: ['windows'],
    supportsCheckOnly: true,
    supportsApply: true,
    supportsUpgrade: true,
    supportsForce: true,
    supportsUninstall: false,
    requiresElevation: true,
    resumable: true,
    notes: [
      'Installs or upgrades GitHub CLI (gh) via winget (with an MSI fallback) for packaged Cats hosts that drive the Copilot CLI flow.',
      'Self-elevates through UAC for the actual install; -CheckOnly stays user-scoped for the Settings>Runtime probe.',
      'Uninstall is intentionally omitted to keep the surface symmetric with the Node host installer.',
    ],
  },
  {
    id: 'windows-npm-prefix-helper-script',
    helperId: 'windows-npm-prefix-helper',
    label: 'Windows npm prefix and PATH prerequisite helper',
    kind: 'prerequisite_helper',
    pack: 'native_cli_pack',
    platform: 'windows',
    sourceRelativePath: 'scripts/windows/Setup-NodeGlobalPrefix.ps1',
    stageRelativePath: 'shared/setup-assets/windows/Setup-NodeGlobalPrefix.ps1',
    packagedRelativePath: 'desktop/setup-assets/windows/Setup-NodeGlobalPrefix.ps1',
    targetPlatforms: ['windows'],
    supportsCheckOnly: true,
    supportsApply: true,
    supportsUpgrade: false,
    supportsForce: false,
    supportsUninstall: false,
    requiresElevation: false,
    resumable: true,
    notes: [
      'Prepares a user-scoped npm prefix and PATH entry for native CLI installs.',
    ],
  },
  ...([
    ['codex', 'Install-Codex.ps1', 'OpenAI Codex CLI'],
    ['gemini', 'Install-Gemini.ps1', 'Gemini CLI'],
    ['copilot', 'Install-Copilot.ps1', 'GitHub Copilot CLI'],
    ['opencode', 'Install-OpenCode.ps1', 'OpenCode'],
    ['kilo', 'Install-KiloCli.ps1', 'Kilo Code CLI'],
    ['auggie', 'Install-Auggie.ps1', 'Auggie CLI'],
    ['pi', 'Install-Pi.ps1', 'Pi Coding Agent'],
  ] as const).map(([providerId, scriptName, providerLabel]) => ({
    id: `windows-${providerId}-native-installer-script`,
    helperId: `windows-${providerId}-native-installer`,
    label: `Windows ${providerLabel} installer`,
    kind: 'provider_installer' as const,
    pack: 'native_cli_pack' as const,
    platform: 'windows' as const,
    sourceRelativePath: `scripts/windows/${scriptName}`,
    stageRelativePath: `shared/setup-assets/windows/${scriptName}`,
    packagedRelativePath: `desktop/setup-assets/windows/${scriptName}`,
    targetPlatforms: ['windows' as const],
    supportsCheckOnly: true,
    supportsApply: true,
    supportsUpgrade: true,
    supportsForce: true,
    supportsUninstall: true,
    requiresElevation: false,
    resumable: true,
    notes: [
      `Installs or upgrades ${providerLabel} via npm-global on packaged Windows hosts.`,
    ],
  })),
  {
    id: 'windows-claude-native-installer-script',
    helperId: 'windows-claude-native-installer',
    label: 'Windows native Claude Code installer',
    kind: 'provider_installer',
    pack: 'native_cli_pack',
    platform: 'windows',
    sourceRelativePath: 'scripts/windows/Install-ClaudeCode.ps1',
    stageRelativePath: 'shared/setup-assets/windows/Install-ClaudeCode.ps1',
    packagedRelativePath: 'desktop/setup-assets/windows/Install-ClaudeCode.ps1',
    targetPlatforms: ['windows'],
    supportsCheckOnly: true,
    supportsApply: true,
    supportsUpgrade: true,
    supportsForce: true,
    supportsUninstall: true,
    requiresElevation: false,
    resumable: true,
    notes: [
      'Installs or upgrades the native Windows Claude Code CLI and removes legacy npm-installed Claude shims that can shadow the native binary.',
    ],
  },
  {
    id: 'windows-cursor-native-installer-script',
    helperId: 'windows-cursor-native-installer',
    label: 'Windows native Cursor Agent installer',
    kind: 'provider_installer',
    pack: 'native_cli_pack',
    platform: 'windows',
    sourceRelativePath: 'scripts/windows/Install-CursorAgent.ps1',
    stageRelativePath: 'shared/setup-assets/windows/Install-CursorAgent.ps1',
    packagedRelativePath: 'desktop/setup-assets/windows/Install-CursorAgent.ps1',
    targetPlatforms: ['windows'],
    supportsCheckOnly: true,
    supportsApply: true,
    supportsUpgrade: true,
    supportsForce: true,
    supportsUninstall: true,
    requiresElevation: false,
    resumable: true,
    notes: [
      'Installs or upgrades the native Windows Cursor Agent CLI after the packaged host confirms prerequisite readiness.',
    ],
  },
  {
    id: 'windows-goose-native-installer-script',
    helperId: 'windows-goose-native-installer',
    label: 'Windows native Goose installer',
    kind: 'provider_installer',
    pack: 'native_cli_pack',
    platform: 'windows',
    sourceRelativePath: 'scripts/windows/Install-Goose.ps1',
    stageRelativePath: 'shared/setup-assets/windows/Install-Goose.ps1',
    packagedRelativePath: 'desktop/setup-assets/windows/Install-Goose.ps1',
    targetPlatforms: ['windows'],
    supportsCheckOnly: true,
    supportsApply: true,
    supportsUpgrade: true,
    supportsForce: true,
    supportsUninstall: true,
    requiresElevation: false,
    resumable: true,
    notes: [
      'Installs or upgrades the native Windows Goose CLI and preserves the post-install auth follow-through in the packaged setup contract.',
    ],
  },
  {
    id: 'windows-junie-native-installer-script',
    helperId: 'windows-junie-native-installer',
    label: 'Windows native Junie installer',
    kind: 'provider_installer',
    pack: 'native_cli_pack',
    platform: 'windows',
    sourceRelativePath: 'scripts/windows/Install-Junie.ps1',
    stageRelativePath: 'shared/setup-assets/windows/Install-Junie.ps1',
    packagedRelativePath: 'desktop/setup-assets/windows/Install-Junie.ps1',
    targetPlatforms: ['windows'],
    supportsCheckOnly: true,
    supportsApply: true,
    supportsUpgrade: true,
    supportsForce: true,
    supportsUninstall: true,
    requiresElevation: false,
    resumable: true,
    notes: [
      'Installs or upgrades the native Windows Junie CLI and keeps the JetBrains sign-in follow-through host-owned.',
    ],
  },
  {
    id: 'windows-kiro-native-installer-script',
    helperId: 'windows-kiro-native-installer',
    label: 'Windows native Kiro installer',
    kind: 'provider_installer',
    pack: 'native_cli_pack',
    platform: 'windows',
    sourceRelativePath: 'scripts/windows/Install-KiroCli.ps1',
    stageRelativePath: 'shared/setup-assets/windows/Install-KiroCli.ps1',
    packagedRelativePath: 'desktop/setup-assets/windows/Install-KiroCli.ps1',
    targetPlatforms: ['windows'],
    supportsCheckOnly: true,
    supportsApply: true,
    supportsUpgrade: true,
    supportsForce: true,
    supportsUninstall: false,
    requiresElevation: true,
    resumable: true,
    notes: [
      'Installs Kiro CLI natively on Windows via the official MSI installer from cli.kiro.dev.',
    ],
  },
  {
    id: 'windows-ollama-local-model-installer-script',
    helperId: 'windows-ollama-local-model-installer',
    label: 'Windows Ollama local-model installer',
    kind: 'provider_installer',
    pack: 'local_model_pack',
    platform: 'windows',
    sourceRelativePath: 'scripts/windows/Install-Ollama.ps1',
    stageRelativePath: 'shared/setup-assets/windows/Install-Ollama.ps1',
    packagedRelativePath: 'desktop/setup-assets/windows/Install-Ollama.ps1',
    targetPlatforms: ['windows'],
    supportsCheckOnly: true,
    supportsApply: true,
    supportsUpgrade: true,
    supportsForce: true,
    supportsUninstall: true,
    requiresElevation: false,
    resumable: true,
    notes: [
      'Installs or upgrades the user-scoped Ollama runtime and keeps API warm-state follow-through inside the packaged host contract.',
    ],
  },
  {
    id: 'windows-setup-readiness-audit-script',
    helperId: 'windows-install-readiness-audit',
    label: 'Windows setup readiness audit',
    kind: 'readiness_helper',
    pack: 'native_cli_pack',
    platform: 'windows',
    sourceRelativePath: 'scripts/windows/Check-WindowsSetupReadiness.ps1',
    stageRelativePath: 'shared/setup-assets/windows/Check-WindowsSetupReadiness.ps1',
    packagedRelativePath: 'desktop/setup-assets/windows/Check-WindowsSetupReadiness.ps1',
    targetPlatforms: ['windows'],
    supportsCheckOnly: true,
    supportsApply: false,
    supportsUpgrade: false,
    supportsForce: false,
    supportsUninstall: false,
    requiresElevation: false,
    resumable: true,
    notes: [
      'Composes the repo-owned packaged setup helpers into one host-side readiness audit.',
    ],
  },
  ...createUnixSetupAssets('linux'),
  ...createUnixSetupAssets('macos'),
];

export const DESKTOP_SETUP_SUPPORT_ASSETS: DesktopSetupSupportAsset[] = [
  {
    id: 'windows-hidden-process-support-script',
    label: 'Windows packaged setup background process helper',
    sourceRelativePath: 'scripts/windows/_HiddenProcess.ps1',
    stageRelativePath: 'shared/setup-assets/windows/_HiddenProcess.ps1',
    packagedRelativePath: 'desktop/setup-assets/windows/_HiddenProcess.ps1',
    targetPlatforms: ['windows'],
    notes: [
      'Shared PowerShell helper used by Windows packaged setup flows that need a hidden background process wrapper.',
    ],
  },
  {
    id: 'windows-packaged-uninstall-support-script',
    label: 'Windows packaged provider uninstall helper',
    sourceRelativePath: 'scripts/windows/_PackagedUninstall.ps1',
    stageRelativePath: 'shared/setup-assets/windows/_PackagedUninstall.ps1',
    packagedRelativePath: 'desktop/setup-assets/windows/_PackagedUninstall.ps1',
    targetPlatforms: ['windows'],
    notes: [
      'Shared PowerShell helper that emits the structured Uninstall result contract for native provider helpers.',
    ],
  },
  {
    id: 'windows-npm-cli-installer-support-script',
    label: 'Windows packaged npm-global CLI installer helper',
    sourceRelativePath: 'scripts/windows/_NpmCliInstaller.ps1',
    stageRelativePath: 'shared/setup-assets/windows/_NpmCliInstaller.ps1',
    packagedRelativePath: 'desktop/setup-assets/windows/_NpmCliInstaller.ps1',
    targetPlatforms: ['windows'],
    notes: [
      'Shared PowerShell helper that runs the per-CLI npm-global install/upgrade/uninstall flow for Codex / Gemini / Copilot / OpenCode / Kilo / Auggie / Pi.',
    ],
  },
  ...createUnixSetupSupportAssets('linux'),
  ...createUnixSetupSupportAssets('macos'),
];

export async function stageDesktopSetupAssets(
  packageRoot: string,
  outputRoot: string,
  generatedAt: Date,
  targetPlatforms: DesktopPackagingPlatform[] | null = null,
): Promise<DesktopSetupAsset[]> {
  const allowedPlatforms = targetPlatforms && targetPlatforms.length > 0
    ? new Set(targetPlatforms)
    : null;
  const stagedAssets = DESKTOP_SETUP_ASSETS.filter((asset) =>
    allowedPlatforms === null
    || asset.targetPlatforms.some((platform) => allowedPlatforms.has(platform)));
  const stagedSupportAssets = DESKTOP_SETUP_SUPPORT_ASSETS.filter((asset) =>
    allowedPlatforms === null
    || asset.targetPlatforms.some((platform) => allowedPlatforms.has(platform)));

  for (const asset of stagedAssets) {
    const sourcePath = join(packageRoot, asset.sourceRelativePath);
    const targetPath = join(outputRoot, asset.stageRelativePath);
    await access(sourcePath);
    await mkdir(dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
  }

  for (const asset of stagedSupportAssets) {
    const sourcePath = join(packageRoot, asset.sourceRelativePath);
    const targetPath = join(outputRoot, asset.stageRelativePath);
    await access(sourcePath);
    await mkdir(dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
  }

  await writeFile(
    join(outputRoot, 'shared', 'setup-assets', 'manifest.json'),
    JSON.stringify({
      generatedAt: generatedAt.toISOString(),
      assets: stagedAssets,
      supportAssets: stagedSupportAssets,
    }, null, 2),
  );

  return stagedAssets;
}
