import { access, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface DesktopSetupAsset {
  id: string;
  helperId: string;
  label: string;
  kind: 'prerequisite_helper' | 'cli_pack_installer' | 'readiness_helper';
  pack: 'native_cli_pack' | null;
  platform: 'windows';
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
