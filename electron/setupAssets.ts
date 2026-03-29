import { access, copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface DesktopSetupAsset {
  id: string;
  sourceRelativePath: string;
  stageRelativePath: string;
  packagedRelativePath: string;
  targetPlatforms: Array<'windows'>;
}

export const DESKTOP_SETUP_ASSETS: DesktopSetupAsset[] = [
  {
    id: 'windows-npm-prefix-helper-script',
    sourceRelativePath: 'scripts/windows/Setup-NodeGlobalPrefix.ps1',
    stageRelativePath: 'shared/setup-assets/windows/Setup-NodeGlobalPrefix.ps1',
    packagedRelativePath: 'desktop-host/setup-assets/windows/Setup-NodeGlobalPrefix.ps1',
    targetPlatforms: ['windows'],
  },
  {
    id: 'windows-node-cli-pack-script',
    sourceRelativePath: 'scripts/windows/Install-NodeCliPack.ps1',
    stageRelativePath: 'shared/setup-assets/windows/Install-NodeCliPack.ps1',
    packagedRelativePath: 'desktop-host/setup-assets/windows/Install-NodeCliPack.ps1',
    targetPlatforms: ['windows'],
  },
  {
    id: 'windows-wsl-prerequisite-preflight-script',
    sourceRelativePath: 'scripts/windows/Check-WslPrerequisites.ps1',
    stageRelativePath: 'shared/setup-assets/windows/Check-WslPrerequisites.ps1',
    packagedRelativePath: 'desktop-host/setup-assets/windows/Check-WslPrerequisites.ps1',
    targetPlatforms: ['windows'],
  },
  {
    id: 'windows-setup-readiness-audit-script',
    sourceRelativePath: 'scripts/windows/Check-WindowsSetupReadiness.ps1',
    stageRelativePath: 'shared/setup-assets/windows/Check-WindowsSetupReadiness.ps1',
    packagedRelativePath: 'desktop-host/setup-assets/windows/Check-WindowsSetupReadiness.ps1',
    targetPlatforms: ['windows'],
  },
];

export async function stageDesktopSetupAssets(
  packageRoot: string,
  outputRoot: string,
): Promise<DesktopSetupAsset[]> {
  for (const asset of DESKTOP_SETUP_ASSETS) {
    const sourcePath = join(packageRoot, asset.sourceRelativePath);
    const targetPath = join(outputRoot, asset.stageRelativePath);
    await access(sourcePath);
    await mkdir(dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
  }

  return DESKTOP_SETUP_ASSETS;
}
