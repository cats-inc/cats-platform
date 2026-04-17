import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import type {
  GuideCatFloatingAnchor,
  GuideCatPlacement,
  GuideCatSidecarMode,
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
  guideCatSidecarSeen: boolean;
  guideCatSidecarMode: GuideCatSidecarMode;
  guideCatPlacement: GuideCatPlacement;
  guideCatFloatingAnchor: GuideCatFloatingAnchor | null;
}

const DEFAULTS: PlatformPreferences = {
  lastProductSurface: null,
  startAtLogin: true,
  openWindowOnStartup: false,
  systemTrayEnabled: true,
  lobbyAnimationMode: 'reduced',
  guideCatSidecarSeen: false,
  guideCatSidecarMode: 'auto',
  guideCatPlacement: 'floating',
  guideCatFloatingAnchor: null,
};

function normalizeFloatingAnchor(value: unknown): GuideCatFloatingAnchor | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const x = record.x;
  const y = record.y;
  if (typeof x !== 'number' || typeof y !== 'number') {
    return null;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
}

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
    guideCatSidecarSeen: record.guideCatSidecarSeen === true,
    guideCatSidecarMode:
      record.guideCatSidecarMode === 'auto'
      || record.guideCatSidecarMode === 'drawer'
      || record.guideCatSidecarMode === 'bubble'
        ? record.guideCatSidecarMode
        : DEFAULTS.guideCatSidecarMode,
    guideCatPlacement:
      record.guideCatPlacement === 'floating' || record.guideCatPlacement === 'docked'
        ? record.guideCatPlacement
        : DEFAULTS.guideCatPlacement,
    guideCatFloatingAnchor: normalizeFloatingAnchor(record.guideCatFloatingAnchor),
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
