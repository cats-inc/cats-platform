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
  /**
   * Settings > Code "Cats may run preview servers" (SPEC-123 CAP-08). Opt-in:
   * off until the user turns it on.
   */
  codePreviewServersEnabled: boolean;
  /**
   * Settings > Runtime "Claude in Chrome" (PLAN-125). Opt-in: Claude Code
   * conversations that can show approval cards load browser tools.
   */
  claudeInChromeEnabled: boolean;
  /**
   * Settings > Runtime "Desktop control" (SPEC-133 DC-02). Opt-in: off until the
   * local owner turns it on; Platform data reset turns it off again.
   */
  desktopControlEnabled: boolean;
  /** Chat channels the owner enabled desktop control for (SPEC-133 DC-03). */
  desktopControlConversations: string[];
}

const DEFAULTS: PlatformPreferences = {
  lastProductSurface: null,
  startAtLogin: true,
  openWindowOnStartup: false,
  systemTrayEnabled: true,
  lobbyAnimationMode: 'reduced',
  assistantResponseLanguage: 'unspecified',
  uiLanguagePreference: 'auto',
  codePreviewServersEnabled: false,
  claudeInChromeEnabled: false,
  desktopControlEnabled: false,
  desktopControlConversations: [],
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
    codePreviewServersEnabled: record.codePreviewServersEnabled === true,
    claudeInChromeEnabled: record.claudeInChromeEnabled === true,
    desktopControlEnabled: record.desktopControlEnabled === true,
    desktopControlConversations: Array.isArray(record.desktopControlConversations)
      ? [...new Set(record.desktopControlConversations.filter((id): id is string =>
        typeof id === 'string' && id.length > 0 && id.length <= 300))].slice(0, 500)
      : [],
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

/**
 * Reset Platform data returns every preference to its default except the
 * Desktop startup and system tray choices, which the host applies to the OS.
 */
export function platformPreferencesAfterDataReset(current: PlatformPreferences): PlatformPreferences {
  return {
    ...DEFAULTS,
    startAtLogin: current.startAtLogin,
    openWindowOnStartup: current.openWindowOnStartup,
    systemTrayEnabled: current.systemTrayEnabled,
  };
}

/** Settings > Code "Cats may run preview servers", read fresh for each check. */
export async function readCodePreviewServersEnabled(chatStatePath: string): Promise<boolean> {
  return (await readPlatformPreferences(chatStatePath)).codePreviewServersEnabled;
}

/** Settings > Runtime "Claude in Chrome", read fresh for each session admission. */
export async function readClaudeInChromeEnabled(chatStatePath: string): Promise<boolean> {
  return (await readPlatformPreferences(chatStatePath)).claudeInChromeEnabled;
}
