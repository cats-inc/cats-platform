import path from 'node:path';
import { homedir } from 'node:os';

export interface PlatformStorageLayout {
  platformDir: string;
  stateDir: string;
  configDir: string;
  legacyRootLayout: boolean;
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

export function resolvePlatformStatePath(
  platformDir: string,
  overridePath: string | undefined,
): string {
  const trimmed = overridePath?.trim();
  if (!trimmed) {
    return resolveDefaultChatStatePath(platformDir);
  }

  return path.isAbsolute(trimmed)
    ? trimmed
    : path.join(platformDir, trimmed);
}

export function resolvePlatformStorageLayout(
  chatStatePath: string,
): PlatformStorageLayout {
  const normalizedChatStatePath = path.resolve(chatStatePath);
  const chatStateDir = path.dirname(normalizedChatStatePath);
  const sectionName = path.basename(chatStateDir);

  if (sectionName === 'state') {
    const platformDir = path.dirname(chatStateDir);
    return {
      platformDir,
      stateDir: chatStateDir,
      configDir: resolvePlatformConfigDir(platformDir),
      legacyRootLayout: false,
    };
  }

  if (sectionName === 'config') {
    const platformDir = path.dirname(chatStateDir);
    return {
      platformDir,
      stateDir: resolvePlatformStateDir(platformDir),
      configDir: chatStateDir,
      legacyRootLayout: false,
    };
  }

  return {
    platformDir: chatStateDir,
    stateDir: chatStateDir,
    configDir: chatStateDir,
    legacyRootLayout: true,
  };
}

export function resolvePlatformOnboardingHistoryPathFromChatState(
  chatStatePath: string,
): string {
  const layout = resolvePlatformStorageLayout(chatStatePath);
  return path.join(layout.stateDir, 'platform-onboarding-history.json');
}

export function resolvePlatformPreferencesPathFromChatState(
  chatStatePath: string,
): string {
  const layout = resolvePlatformStorageLayout(chatStatePath);
  return path.join(layout.configDir, 'platform-preferences.json');
}
