import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import type {
  AssistantResponseLanguage,
  PlatformLobbyAnimationMode,
  PlatformSurfaceId,
  PlatformUiLanguagePreference,
} from './platform-contract.js';
import { parseAssistantResponseLanguage } from './assistantResponseLanguage.js';
import { resolvePlatformPreferencesPathFromChatState } from './platformPaths.js';
import { normalizePlatformSurface } from './platformSurfaces.js';

export interface PlatformPreferences {
  lastProductSurface: PlatformSurfaceId | null;
  startAtLogin: boolean;
  openWindowOnStartup: boolean;
  systemTrayEnabled: boolean;
  lobbyAnimationMode: PlatformLobbyAnimationMode;
  assistantResponseLanguage: AssistantResponseLanguage;
  uiLanguagePreference: PlatformUiLanguagePreference;
}

const DEFAULTS: PlatformPreferences = {
  lastProductSurface: null,
  startAtLogin: true,
  openWindowOnStartup: false,
  systemTrayEnabled: true,
  lobbyAnimationMode: 'reduced',
  assistantResponseLanguage: 'unspecified',
  uiLanguagePreference: 'auto',
};

export function parsePlatformLobbyAnimationMode(
  value: unknown,
): PlatformLobbyAnimationMode | undefined {
  return value === 'off' || value === 'reduced' || value === 'full'
    ? value
    : undefined;
}

export function normalizePlatformLobbyAnimationMode(
  value: unknown,
  fallback: PlatformLobbyAnimationMode = DEFAULTS.lobbyAnimationMode,
): PlatformLobbyAnimationMode {
  return parsePlatformLobbyAnimationMode(value) ?? fallback;
}

export function parsePlatformUiLanguagePreference(
  value: unknown,
): PlatformUiLanguagePreference | undefined {
  return value === 'auto' || value === 'en' || value === 'zh-TW'
    ? value
    : undefined;
}

export function normalizePlatformUiLanguagePreference(
  value: unknown,
  fallback: PlatformUiLanguagePreference = DEFAULTS.uiLanguagePreference,
): PlatformUiLanguagePreference {
  return parsePlatformUiLanguagePreference(value) ?? fallback;
}

export function resolvePlatformPreferencesPath(chatStatePath: string): string {
  return resolvePlatformPreferencesPathFromChatState(chatStatePath);
}

function normalizePlatformPreferences(value: unknown): PlatformPreferences {
  if (typeof value !== 'object' || value === null) {
    return { ...DEFAULTS };
  }

  const record = value as Record<string, unknown>;
  return {
    lastProductSurface: normalizePlatformSurface(record.lastProductSurface),
    startAtLogin: record.startAtLogin !== false,
    openWindowOnStartup: record.openWindowOnStartup === true,
    systemTrayEnabled: record.systemTrayEnabled !== false,
    lobbyAnimationMode: normalizePlatformLobbyAnimationMode(record.lobbyAnimationMode),
    assistantResponseLanguage:
      parseAssistantResponseLanguage(record.assistantResponseLanguage)
      ?? DEFAULTS.assistantResponseLanguage,
    uiLanguagePreference: normalizePlatformUiLanguagePreference(record.uiLanguagePreference),
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

export async function readPlatformPreferences(
  chatStatePath: string,
): Promise<PlatformPreferences> {
  try {
    const raw = await readFile(resolvePlatformPreferencesPath(chatStatePath), 'utf-8');
    const record = parsePlatformPreferencesFile(raw);
    return record ? normalizePlatformPreferences(record) : { ...DEFAULTS };
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
