import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import type {
  GuideCatFloatingAnchor,
  GuideCatPlacement,
  GuideCatSidecarMode,
  PlatformLobbyAnimationMode,
  PlatformLegacyGuideCatUiPrefs,
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

function normalizeGuideCatSidecarMode(value: unknown): GuideCatSidecarMode | null {
  return value === 'auto' || value === 'drawer' || value === 'bubble'
    ? value
    : null;
}

function normalizeGuideCatPlacement(value: unknown): GuideCatPlacement | null {
  return value === 'floating' || value === 'docked'
    ? value
    : null;
}

function normalizeGuideCatFloatingAnchor(value: unknown): GuideCatFloatingAnchor | null {
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

function parsePlatformPreferencesFile(
  raw: string,
): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function readPlatformPreferencesFile(
  chatStatePath: string,
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(resolvePlatformPreferencesPath(chatStatePath), 'utf-8');
    return parsePlatformPreferencesFile(raw);
  } catch {
    return null;
  }
}

function extractLegacyGuideCatUiPrefsRecord(
  record: Record<string, unknown> | null,
): PlatformLegacyGuideCatUiPrefs | null {
  if (!record) {
    return null;
  }

  const hasLegacyFields =
    Object.prototype.hasOwnProperty.call(record, 'guideCatSidecarSeen')
    || Object.prototype.hasOwnProperty.call(record, 'guideCatSidecarMode')
    || Object.prototype.hasOwnProperty.call(record, 'guideCatPlacement')
    || Object.prototype.hasOwnProperty.call(record, 'guideCatFloatingAnchor');
  if (!hasLegacyFields) {
    return null;
  }

  return {
    sidecarSeen: record.guideCatSidecarSeen === true,
    sidecarMode: normalizeGuideCatSidecarMode(record.guideCatSidecarMode),
    placement: normalizeGuideCatPlacement(record.guideCatPlacement),
    floatingAnchor: normalizeGuideCatFloatingAnchor(record.guideCatFloatingAnchor),
  };
}

function pickLegacyGuideCatUiPrefsFields(
  record: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!record) {
    return {};
  }

  const next: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(record, 'guideCatSidecarSeen')) {
    next.guideCatSidecarSeen = record.guideCatSidecarSeen;
  }
  if (Object.prototype.hasOwnProperty.call(record, 'guideCatSidecarMode')) {
    next.guideCatSidecarMode = record.guideCatSidecarMode;
  }
  if (Object.prototype.hasOwnProperty.call(record, 'guideCatPlacement')) {
    next.guideCatPlacement = record.guideCatPlacement;
  }
  if (Object.prototype.hasOwnProperty.call(record, 'guideCatFloatingAnchor')) {
    next.guideCatFloatingAnchor = record.guideCatFloatingAnchor;
  }
  return next;
}

export async function readPlatformPreferences(
  chatStatePath: string,
): Promise<PlatformPreferences> {
  const record = await readPlatformPreferencesFile(chatStatePath);
  return record ? normalizePlatformPreferences(record) : { ...DEFAULTS };
}

export async function readLegacyGuideCatUiPrefs(
  chatStatePath: string,
): Promise<PlatformLegacyGuideCatUiPrefs | null> {
  return extractLegacyGuideCatUiPrefsRecord(
    await readPlatformPreferencesFile(chatStatePath),
  );
}

export async function writePlatformPreferences(
  chatStatePath: string,
  prefs: PlatformPreferences,
): Promise<void> {
  const filePath = resolvePlatformPreferencesPath(chatStatePath);
  // Keep the deprecated renderer-owned guide-cat UI fields around for the
  // migration window so local-storage hydration can retry on later launches.
  const legacyFields = pickLegacyGuideCatUiPrefsFields(
    await readPlatformPreferencesFile(chatStatePath),
  );
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    JSON.stringify({
      ...prefs,
      ...legacyFields,
    }, null, 2) + '\n',
    'utf-8',
  );
}
