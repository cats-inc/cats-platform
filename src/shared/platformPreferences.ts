import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import type {
  GuideCatSidecarMode,
  PlatformLobbyAnimationMode,
  PlatformSurfaceId,
} from './platform-contract.js';
import { resolvePlatformPreferencesPathFromChatState } from './platformPaths.js';

export interface PlatformPreferences {
  lastProductSurface: PlatformSurfaceId | null;
  startAtLogin: boolean;
  openWindowOnStartup: boolean;
  lobbyAnimationMode: PlatformLobbyAnimationMode;
  guideCatSidecarSeen: boolean;
  guideCatSidecarMode: GuideCatSidecarMode;
}

const DEFAULTS: PlatformPreferences = {
  lastProductSurface: null,
  startAtLogin: true,
  openWindowOnStartup: false,
  lobbyAnimationMode: 'reduced',
  guideCatSidecarSeen: false,
  guideCatSidecarMode: 'auto',
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
    lobbyAnimationMode:
      lobbyAnimationMode === 'off'
      || lobbyAnimationMode === 'reduced'
      || lobbyAnimationMode === 'full'
        ? lobbyAnimationMode
        : DEFAULTS.lobbyAnimationMode,
    guideCatSidecarSeen: record.guideCatSidecarSeen === true,
    guideCatSidecarMode:
      record.guideCatSidecarMode === 'auto'
      || record.guideCatSidecarMode === 'drawer'
      || record.guideCatSidecarMode === 'bubble'
        ? record.guideCatSidecarMode
        : DEFAULTS.guideCatSidecarMode,
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
