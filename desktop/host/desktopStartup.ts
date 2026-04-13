import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { resolvePlatformPreferencesPathFromChatState } from './platformPaths.js';

export interface DesktopStartupPreferences {
  startAtLogin: boolean;
  openWindowOnStartup: boolean;
  systemTrayEnabled: boolean;
}

export interface DesktopStartupLaunchContext {
  launchedAtLogin: boolean;
  showWindowOnStartup: boolean;
}

export interface DesktopStartupAppLike {
  isPackaged: boolean;
  getPath(name: string): string;
  setLoginItemSettings?(settings: {
    openAtLogin: boolean;
    path?: string;
    args?: string[];
  }): void;
  getLoginItemSettings?(settings?: {
    path?: string;
    args?: string[];
  }): {
    wasOpenedAtLogin?: boolean;
  };
}

const DEFAULT_DESKTOP_STARTUP_PREFERENCES: DesktopStartupPreferences = {
  startAtLogin: true,
  openWindowOnStartup: false,
  systemTrayEnabled: true,
};

export const DESKTOP_LAUNCH_AT_LOGIN_ARG = '--launch-at-login';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeDesktopStartupPreferences(value: unknown): DesktopStartupPreferences {
  if (!isObjectRecord(value)) {
    return { ...DEFAULT_DESKTOP_STARTUP_PREFERENCES };
  }

  return {
    startAtLogin: value.startAtLogin !== false,
    openWindowOnStartup: value.openWindowOnStartup === true,
    systemTrayEnabled: value.systemTrayEnabled !== false,
  };
}

export function resolveDesktopPlatformPreferencesPath(appStatePath: string): string {
  return resolvePlatformPreferencesPathFromChatState(appStatePath);
}

export async function readDesktopStartupPreferences(
  appStatePath: string,
): Promise<DesktopStartupPreferences> {
  try {
    const raw = await readFile(resolveDesktopPlatformPreferencesPath(appStatePath), 'utf8');
    return normalizeDesktopStartupPreferences(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_DESKTOP_STARTUP_PREFERENCES };
  }
}

export async function updateDesktopStartupPreferences(
  appStatePath: string,
  updates: Partial<DesktopStartupPreferences>,
): Promise<DesktopStartupPreferences> {
  const filePath = resolveDesktopPlatformPreferencesPath(appStatePath);
  let currentRecord: Record<string, unknown> = {};
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (isObjectRecord(parsed)) {
      currentRecord = parsed;
    }
  } catch {
    currentRecord = {};
  }

  const currentPrefs = normalizeDesktopStartupPreferences(currentRecord);
  const nextPrefs: DesktopStartupPreferences = {
    startAtLogin: updates.startAtLogin ?? currentPrefs.startAtLogin,
    openWindowOnStartup: updates.openWindowOnStartup ?? currentPrefs.openWindowOnStartup,
    systemTrayEnabled: updates.systemTrayEnabled ?? currentPrefs.systemTrayEnabled,
  };

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify({
    ...currentRecord,
    startAtLogin: nextPrefs.startAtLogin,
    openWindowOnStartup: nextPrefs.openWindowOnStartup,
    systemTrayEnabled: nextPrefs.systemTrayEnabled,
  }, null, 2) + '\n', 'utf8');

  return nextPrefs;
}

function escapeLinuxDesktopExecArg(value: string): string {
  return `"${value.replace(/(["\\$`])/gu, '\\$1')}"`;
}

export function buildLinuxAutostartEntry(
  executablePath: string,
  launchArg: string = DESKTOP_LAUNCH_AT_LOGIN_ARG,
): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    'Name=Cats',
    'Comment=Start Cats Desktop in the background at login',
    `Exec=${escapeLinuxDesktopExecArg(executablePath)} ${launchArg}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
}

export function resolveLinuxAutostartEntryPath(homeDir: string): string {
  return path.join(homeDir, '.config', 'autostart', 'cats.desktop');
}

export function resolveDesktopStartupLaunchContext(options: {
  platform?: NodeJS.Platform;
  argv?: string[];
  wasOpenedAtLogin?: boolean;
  preferences: DesktopStartupPreferences;
  background: {
    trayEnabled: boolean;
    keepServicesRunning: boolean;
    closeBehavior: 'quit' | 'minimize_to_tray';
  };
}): DesktopStartupLaunchContext {
  const platform = options.platform ?? process.platform;
  const argv = options.argv ?? process.argv;
  const launchedAtLogin = argv.includes(DESKTOP_LAUNCH_AT_LOGIN_ARG)
    || (platform === 'darwin' && options.wasOpenedAtLogin === true);
  const backgroundLaunchAvailable = options.preferences.systemTrayEnabled
    && options.background.trayEnabled
    && options.background.keepServicesRunning
    && options.background.closeBehavior === 'minimize_to_tray';

  const showWindowOnStartup = options.preferences.openWindowOnStartup
    || !backgroundLaunchAvailable;

  return {
    launchedAtLogin,
    showWindowOnStartup,
  };
}

export async function syncDesktopStartupPreferences(
  appLike: DesktopStartupAppLike,
  preferences: DesktopStartupPreferences,
  options: {
    platform?: NodeJS.Platform;
    executablePath?: string;
    homeDir?: string;
  } = {},
): Promise<void> {
  if (!appLike.isPackaged) {
    return;
  }

  const platform = options.platform ?? process.platform;
  const executablePath = options.executablePath ?? process.execPath;

  if (platform === 'win32') {
    appLike.setLoginItemSettings?.({
      openAtLogin: preferences.startAtLogin,
      path: executablePath,
      args: [DESKTOP_LAUNCH_AT_LOGIN_ARG],
    });
    return;
  }

  if (platform === 'darwin') {
    appLike.setLoginItemSettings?.({
      openAtLogin: preferences.startAtLogin,
    });
    return;
  }

  if (platform === 'linux') {
    const homeDir = options.homeDir ?? appLike.getPath('home');
    const desktopEntryPath = resolveLinuxAutostartEntryPath(homeDir);
    if (!preferences.startAtLogin) {
      await rm(desktopEntryPath, { force: true });
      return;
    }

    await mkdir(path.dirname(desktopEntryPath), { recursive: true });
    await writeFile(desktopEntryPath, buildLinuxAutostartEntry(executablePath), 'utf8');
  }
}
