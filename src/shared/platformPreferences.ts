import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import type {
  PlatformLobbyAnimationMode,
  PlatformSurfaceId,
} from './platform-contract.js';
import { resolvePlatformPreferencesPathFromChatState } from './platformPaths.js';

export interface PlatformPreferences {
  lastProductSurface: PlatformSurfaceId | null;
  startAtLogin: boolean;
  openWindowOnStartup: boolean;
  systemTrayEnabled: boolean;
  lobbyAnimationMode: PlatformLobbyAnimationMode;
}

const DEFAULTS: PlatformPreferences = {
  lastProductSurface: null,
  startAtLogin: true,
  openWindowOnStartup: false,
  systemTrayEnabled: true,
  lobbyAnimationMode: 'reduced',
};

export function resolvePlatformPreferencesPath(chatStatePath: string): string {
  return resolvePlatformPreferencesPathFromChatState(chatStatePath);
}

function normalizePlatformPreferences(value: unknown): PlatformPreferences {
  if (typeof value !== 'object' || value === null) {
    return { ...DEFAULTS };
  }

  const record = value as Record<string, unknown>;
  const surface = record.lastProductSurface;
  const lobbyAnimationMode = record.lobbyAnimationMode;
  return {
    lastProductSurface:
      surface === 'chat' || surface === 'work' || surface === 'code'
        ? surface
        : null,
    startAtLogin: record.startAtLogin !== false,
    openWindowOnStartup: record.openWindowOnStartup === true,
    systemTrayEnabled: record.systemTrayEnabled !== false,
    lobbyAnimationMode:
      lobbyAnimationMode === 'off'
      || lobbyAnimationMode === 'reduced'
      || lobbyAnimationMode === 'full'
        ? lobbyAnimationMode
        : DEFAULTS.lobbyAnimationMode,
  };
}

export async function readPlatformPreferences(
  chatStatePath: string,
): Promise<PlatformPreferences> {
  try {
    const raw = await readFile(resolvePlatformPreferencesPath(chatStatePath), 'utf-8');
    return normalizePlatformPreferences(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULTS };
  }
}

export async function writePlatformPreferences(
  chatStatePath: string,
  prefs: PlatformPreferences,
): Promise<void> {
  const filePath = resolvePlatformPreferencesPath(chatStatePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(prefs, null, 2) + '\n', 'utf-8');
}
