import { existsSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export interface PlatformStorageLayout {
  platformDir: string;
  stateDir: string;
  configDir: string;
}

export function resolvePlatformPackageRoot(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const trimmedRoot = env.CATS_PLATFORM_PACKAGE_ROOT?.trim();
  if (trimmedRoot) {
    return path.isAbsolute(trimmedRoot)
      ? trimmedRoot
      : path.resolve(process.cwd(), trimmedRoot);
  }

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    path.resolve(moduleDir, '..', '..', 'package.json'),
    path.resolve(moduleDir, '..', '..', '..', 'package.json'),
    path.resolve(moduleDir, '..', '..', '..', '..', 'package.json'),
  ];
  const packageJsonPath = candidatePaths.find((candidate) => existsSync(candidate));
  return packageJsonPath
    ? path.dirname(packageJsonPath)
    : path.resolve(moduleDir, '..', '..', '..');
}

export function resolveBundledPlatformConfigDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolvePlatformPackageRoot(env), 'config');
}

export function resolveBundledPlatformConfigExamplePath(
  fileName: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveBundledPlatformConfigDir(env), `${fileName}.example`);
}

export function resolveDefaultPlatformDir(
  homeDir: string = homedir(),
): string {
  return path.join(homeDir || homedir(), '.cats', 'platform');
}

export function resolvePlatformStateDir(platformDir: string): string {
  return path.join(platformDir, 'state');
}

export function resolvePlatformConfigDir(platformDir: string): string {
  return path.join(platformDir, 'config');
}

export function resolveDefaultChatStatePath(platformDir: string): string {
  return path.join(resolvePlatformStateDir(platformDir), 'chat-state.local.json');
}

export function resolvePlatformStatePath(platformDir: string): string {
  return resolveDefaultChatStatePath(platformDir);
}

export function resolvePlatformStorageLayout(
  chatStatePath: string,
): PlatformStorageLayout {
  const normalizedChatStatePath = path.resolve(chatStatePath);
  const chatStateDir = path.dirname(normalizedChatStatePath);
  if (path.basename(chatStateDir) !== 'state') {
    throw new Error(
      `Platform state path must live under <platform>/state/chat-state.local.json, got '${chatStatePath}'`,
    );
  }

  const platformDir = path.dirname(chatStateDir);
  return {
    platformDir,
    stateDir: chatStateDir,
    configDir: resolvePlatformConfigDir(platformDir),
  };
}

export function resolvePlatformOnboardingHistoryPathFromChatState(
  chatStatePath: string,
): string {
  const layout = resolvePlatformStorageLayout(chatStatePath);
  return path.join(layout.stateDir, 'platform-onboarding-history.json');
}

export function resolveCompanionActivityPathFromChatState(
  chatStatePath: string,
): string {
  const layout = resolvePlatformStorageLayout(chatStatePath);
  return path.join(layout.stateDir, 'companion-activity.json');
}

export function resolveScheduleStatePathFromChatState(
  chatStatePath: string,
): string {
  const layout = resolvePlatformStorageLayout(chatStatePath);
  return path.join(layout.stateDir, 'scheduler-state.local.json');
}

export function resolvePlatformPreferencesPathFromChatState(
  chatStatePath: string,
): string {
  const layout = resolvePlatformStorageLayout(chatStatePath);
  return path.join(layout.configDir, 'platform-preferences.json');
}

export function resolveGuideCatAssistConfigPathFromChatState(
  chatStatePath: string,
): string {
  const layout = resolvePlatformStorageLayout(chatStatePath);
  return path.join(layout.configDir, 'guide-cat-assist-config.json');
}

export function resolveGuideCatAssistCachePathFromChatState(
  chatStatePath: string,
): string {
  const layout = resolvePlatformStorageLayout(chatStatePath);
  return path.join(layout.stateDir, 'guide-cat-assist-cache.local.json');
}

export function resolveProviderSnapshotPathFromChatState(
  chatStatePath: string,
): string {
  const layout = resolvePlatformStorageLayout(chatStatePath);
  return path.join(layout.stateDir, 'provider-snapshot.local.json');
}
