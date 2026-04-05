import path from 'node:path';

export function resolvePlatformStatePath(
  platformDir: string,
  overridePath: string | undefined,
): string {
  const trimmed = overridePath?.trim();
  if (!trimmed) {
    return path.join(platformDir, 'state', 'chat-state.local.json');
  }

  return path.isAbsolute(trimmed)
    ? trimmed
    : path.join(platformDir, trimmed);
}

interface PlatformStorageLayout {
  stateDir: string;
  configDir: string;
}

function resolvePlatformStorageLayout(chatStatePath: string): PlatformStorageLayout {
  const normalizedChatStatePath = path.resolve(chatStatePath);
  const chatStateDir = path.dirname(normalizedChatStatePath);
  const sectionName = path.basename(chatStateDir);

  if (sectionName === 'state') {
    const platformDir = path.dirname(chatStateDir);
    return {
      stateDir: chatStateDir,
      configDir: path.join(platformDir, 'config'),
    };
  }

  if (sectionName === 'config') {
    const platformDir = path.dirname(chatStateDir);
    return {
      stateDir: path.join(platformDir, 'state'),
      configDir: chatStateDir,
    };
  }

  return {
    stateDir: chatStateDir,
    configDir: chatStateDir,
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
