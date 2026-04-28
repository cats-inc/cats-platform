import path from 'node:path';

export function resolvePlatformStatePath(platformDir: string): string {
  return path.join(platformDir, 'state', 'chat-state.local.json');
}

interface PlatformStorageLayout {
  stateDir: string;
  configDir: string;
}

function resolvePlatformStorageLayout(chatStatePath: string): PlatformStorageLayout {
  const normalizedChatStatePath = path.resolve(chatStatePath);
  const chatStateDir = path.dirname(normalizedChatStatePath);
  if (path.basename(chatStateDir) !== 'state') {
    throw new Error(
      `Platform state path must live under <platform>/state/chat-state.local.json, got '${chatStatePath}'`,
    );
  }

  const platformDir = path.dirname(chatStateDir);
  return {
    stateDir: chatStateDir,
    configDir: path.join(platformDir, 'config'),
  };
}

export function resolvePlatformPreferencesPathFromChatState(
  chatStatePath: string,
): string {
  return path.join(
    resolvePlatformStorageLayout(chatStatePath).configDir,
    'platform-preferences.json',
  );
}

export function resolvePlatformOnboardingHistoryPathFromChatState(
  chatStatePath: string,
): string {
  return path.join(
    resolvePlatformStorageLayout(chatStatePath).stateDir,
    'platform-onboarding-history.json',
  );
}
