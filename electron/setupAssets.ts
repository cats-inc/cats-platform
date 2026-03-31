import { access, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface DesktopSetupAsset {
  id: string;
  helperId: string;
  label: string;
  kind: 'prerequisite_helper' | 'cli_pack_installer' | 'provider_installer' | 'readiness_helper';
  pack: 'native_cli_pack' | 'local_model_pack' | 'wsl_power_user_pack' | null;
  platform: 'windows' | 'windows_wsl';
  sourceRelativePath: string;
  stageRelativePath: string;
  packagedRelativePath: string;
  targetPlatforms: Array<'windows'>;
  supportsCheckOnly: boolean;
  supportsApply: boolean;
  supportsUpgrade: boolean;
  supportsForce: boolean;
  requiresElevation: boolean;
  resumable: boolean;
  notes: string[];
}

export const DESKTOP_SETUP_ASSETS: DesktopSetupAsset[] = [
  {
    id: 'windows-npm-prefix-helper-script',
    helperId: 'windows-npm-prefix-helper',
    label: 'Windows npm prefix and PATH prerequisite helper',
    kind: 'prerequisite_helper',
    pack: 'native_cli_pack',
    platform: 'windows',
    sourceRelativePath: 'scripts/windows/Setup-NodeGlobalPrefix.ps1',
    stageRelativePath: 'shared/setup-assets/windows/Setup-NodeGlobalPrefix.ps1',
    packagedRelativePath: 'desktop-host/setup-assets/windows/Setup-NodeGlobalPrefix.ps1',
    targetPlatforms: ['windows'],
    supportsCheckOnly: true,
    supportsApply: true,
    supportsUpgrade: false,
    supportsForce: false,
    requiresElevation: false,
    resumable: true,
    notes: [
      'Prepares a user-scoped npm prefix and PATH entry for native CLI installs.',
    ],
  },
  {
    id: 'windows-node-cli-pack-script',
    helperId: 'windows-node-cli-pack',
    label: 'Windows npm-global AI CLI pack installer',
    kind: 'cli_pack_installer',
    pack: 'native_cli_pack',
    platform: 'windows',
    sourceRelativePath: 'scripts/windows/Install-NodeCliPack.ps1',
    stageRelativePath: 'shared/setup-assets/windows/Install-NodeCliPack.ps1',
    packagedRelativePath: 'desktop-host/setup-assets/windows/Install-NodeCliPack.ps1',
    targetPlatforms: ['windows'],
    supportsCheckOnly: true,
    supportsApply: true,
    supportsUpgrade: true,
    supportsForce: true,
    requiresElevation: false,
    resumable: true,
    notes: [
      'Installs or upgrades the native Node-based CLI provider pack after npm prefix preparation.',
    ],
  },
  {
    id: 'windows-claude-native-installer-script',
    helperId: 'windows-claude-native-installer',
    label: 'Windows native Claude Code installer',
    kind: 'provider_installer',
    pack: 'native_cli_pack',
    platform: 'windows',
    sourceRelativePath: 'scripts/windows/Install-ClaudeCode.ps1',
    stageRelativePath: 'shared/setup-assets/windows/Install-ClaudeCode.ps1',
    packagedRelativePath: 'desktop-host/setup-assets/windows/Install-ClaudeCode.ps1',
    targetPlatforms: ['windows'],
    supportsCheckOnly: true,
    supportsApply: true,
    supportsUpgrade: true,
    supportsForce: true,
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
    packagedRelativePath: 'desktop-host/setup-assets/windows/Install-CursorAgent.ps1',
    targetPlatforms: ['windows'],
    supportsCheckOnly: true,
    supportsApply: true,
    supportsUpgrade: true,
    supportsForce: true,
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
    packagedRelativePath: 'desktop-host/setup-assets/windows/Install-Goose.ps1',
    targetPlatforms: ['windows'],
    supportsCheckOnly: true,
    supportsApply: true,
    supportsUpgrade: true,
    supportsForce: true,
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
    packagedRelativePath: 'desktop-host/setup-assets/windows/Install-Junie.ps1',
    targetPlatforms: ['windows'],
    supportsCheckOnly: true,
    supportsApply: true,
    supportsUpgrade: true,
    supportsForce: true,
    requiresElevation: false,
    resumable: true,
    notes: [
      'Installs or upgrades the native Windows Junie CLI and keeps the JetBrains sign-in follow-through host-owned.',
    ],
  },
  {
    id: 'windows-wsl-prerequisite-preflight-script',
    helperId: 'windows-wsl-prerequisite-preflight',
    label: 'Windows WSL prerequisite preflight',
    kind: 'prerequisite_helper',
    pack: 'native_cli_pack',
    platform: 'windows',
    sourceRelativePath: 'scripts/windows/Check-WslPrerequisites.ps1',
    stageRelativePath: 'shared/setup-assets/windows/Check-WslPrerequisites.ps1',
    packagedRelativePath: 'desktop-host/setup-assets/windows/Check-WslPrerequisites.ps1',
    targetPlatforms: ['windows'],
    supportsCheckOnly: true,
    supportsApply: false,
    supportsUpgrade: false,
    supportsForce: false,
    requiresElevation: true,
    resumable: true,
    notes: [
      'Checks Windows build, WSL availability, and distro readiness before mutation flows.',
    ],
  },
  {
    id: 'windows-wsl-environment-installer-script',
    helperId: 'windows-wsl-environment-installer',
    label: 'Windows WSL substrate and Ubuntu installer',
    kind: 'prerequisite_helper',
    pack: 'native_cli_pack',
    platform: 'windows',
    sourceRelativePath: 'scripts/windows/Install-WslUbuntuEnvironment.ps1',
    stageRelativePath: 'shared/setup-assets/windows/Install-WslUbuntuEnvironment.ps1',
    packagedRelativePath: 'desktop-host/setup-assets/windows/Install-WslUbuntuEnvironment.ps1',
    targetPlatforms: ['windows'],
    supportsCheckOnly: true,
    supportsApply: true,
    supportsUpgrade: true,
    supportsForce: true,
    requiresElevation: true,
    resumable: true,
    notes: [
      'Enables the WSL substrate, sets WSL2 as default, and registers Ubuntu without treating environment-bootstrap as a shipped dependency.',
    ],
  },
  {
    id: 'windows-kiro-wsl-installer-script',
    helperId: 'windows-kiro-wsl-installer',
    label: 'Windows WSL Kiro installer',
    kind: 'provider_installer',
    pack: 'native_cli_pack',
    platform: 'windows_wsl',
    sourceRelativePath: 'scripts/windows/Install-KiroWslCli.ps1',
    stageRelativePath: 'shared/setup-assets/windows/Install-KiroWslCli.ps1',
    packagedRelativePath: 'desktop-host/setup-assets/windows/Install-KiroWslCli.ps1',
    targetPlatforms: ['windows'],
    supportsCheckOnly: true,
    supportsApply: true,
    supportsUpgrade: true,
    supportsForce: true,
    requiresElevation: false,
    resumable: true,
    notes: [
      'Installs Kiro CLI inside the repo-owned WSL substrate, repairs ~/.bashrc, and preserves the post-install sign-in follow-through.',
    ],
  },
  {
    id: 'windows-docker-desktop-installer-script',
    helperId: 'windows-docker-desktop-installer',
    label: 'Windows Docker Desktop installer',
    kind: 'prerequisite_helper',
    pack: 'local_model_pack',
    platform: 'windows',
    sourceRelativePath: 'scripts/windows/Install-DockerDesktop.ps1',
    stageRelativePath: 'shared/setup-assets/windows/Install-DockerDesktop.ps1',
    packagedRelativePath: 'desktop-host/setup-assets/windows/Install-DockerDesktop.ps1',
    targetPlatforms: ['windows'],
    supportsCheckOnly: true,
    supportsApply: true,
    supportsUpgrade: true,
    supportsForce: true,
    requiresElevation: true,
    resumable: true,
    notes: [
      'Installs or upgrades Docker Desktop and keeps engine warm-up as an explicit packaged setup recovery step.',
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
    packagedRelativePath: 'desktop-host/setup-assets/windows/Install-Ollama.ps1',
    targetPlatforms: ['windows'],
    supportsCheckOnly: true,
    supportsApply: true,
    supportsUpgrade: true,
    supportsForce: true,
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
    packagedRelativePath: 'desktop-host/setup-assets/windows/Check-WindowsSetupReadiness.ps1',
    targetPlatforms: ['windows'],
    supportsCheckOnly: true,
    supportsApply: false,
    supportsUpgrade: false,
    supportsForce: false,
    requiresElevation: false,
    resumable: true,
    notes: [
      'Composes the repo-owned packaged setup helpers into one host-side readiness audit.',
    ],
  },
];

export async function stageDesktopSetupAssets(
  packageRoot: string,
  outputRoot: string,
  generatedAt: Date,
): Promise<DesktopSetupAsset[]> {
  const sharedUtilSource = join(packageRoot, 'scripts', 'windows', '_HiddenProcess.ps1');
  const sharedUtilTarget = join(outputRoot, 'shared', 'setup-assets', 'windows', '_HiddenProcess.ps1');
  await access(sharedUtilSource);
  await mkdir(dirname(sharedUtilTarget), { recursive: true });
  await copyFile(sharedUtilSource, sharedUtilTarget);

  for (const asset of DESKTOP_SETUP_ASSETS) {
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
      assets: DESKTOP_SETUP_ASSETS,
    }, null, 2),
  );

  return DESKTOP_SETUP_ASSETS;
}
