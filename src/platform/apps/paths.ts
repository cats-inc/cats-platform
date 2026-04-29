import path from 'node:path';

import { resolvePlatformStorageLayout } from '../../shared/platformPaths.js';

export interface CatsAppStoragePaths {
  appsDir: string;
  packagesDir: string;
  dataDir: string;
  registryPath: string;
}

export function resolveCatsAppStoragePaths(platformDir: string): CatsAppStoragePaths {
  const appsDir = path.join(platformDir, 'apps');
  return {
    appsDir,
    packagesDir: path.join(appsDir, 'packages'),
    dataDir: path.join(appsDir, 'data'),
    registryPath: path.join(appsDir, 'registry.json'),
  };
}

export function resolveCatsAppStoragePathsFromChatState(chatStatePath: string): CatsAppStoragePaths {
  return resolveCatsAppStoragePaths(resolvePlatformStorageLayout(chatStatePath).platformDir);
}

export function resolveCatsAppPackageInstallDir(
  paths: CatsAppStoragePaths,
  appId: string,
  version: string,
): string {
  return path.join(paths.packagesDir, appId, version);
}

export function resolveCatsAppDataDir(
  paths: CatsAppStoragePaths,
  appId: string,
): string {
  return path.join(paths.dataDir, appId);
}
