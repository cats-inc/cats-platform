import path from 'node:path';
import { homedir } from 'node:os';

export interface PlatformStorageLayout {
  platformDir: string;
  stateDir: string;
  configDir: string;
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

/**
 * PLAN-077 host-owned feature flag persistence (`feature-flags.json`).
 * Lives next to the durable product data root (i.e., the platform state
 * directory) so the desktop main process and the standalone server resolve
 * the same path when given the same `chatStatePath`.
 */
export function resolvePlatformFeatureFlagsPathFromChatState(
  chatStatePath: string,
): string {
  const layout = resolvePlatformStorageLayout(chatStatePath);
  return path.join(layout.stateDir, 'feature-flags.json');
}
