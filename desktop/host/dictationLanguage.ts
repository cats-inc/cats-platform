import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  DESKTOP_DICTATION_LANGUAGE_OPTIONS_CHANNEL,
  DESKTOP_DICTATION_LANGUAGE_SET_CHANNEL,
  type DesktopDictationLanguageOptions,
} from './contracts.js';
import { resolveDesktopPlatformPreferencesPath } from './desktopStartup.js';
import { isMainWindowMainFrameIpcSender, type DesktopIpcMainWindow } from './ipcSecurity.js';

// SPEC-146: one dictation language setting for Desktop voice input.

export const DICTATION_LANGUAGE_AUTO = 'auto';
/** FR-3: a listing that runs longer is killed and counts as no list. */
export const DICTATION_LANGUAGE_LIST_TIMEOUT_MS = 5_000;
const MAX_LISTED_LANGUAGES = 512;
const MAX_LIST_OUTPUT_BYTES = 64 * 1024;
// Shape only: a language, then up to four subtags (`zh`, `zh-TW`, `zh-Hant-TW`).
// It matches src/shared/platformPreferences.ts, which the server writes with.
const TAG_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8}){0,4}$/u;
const MAX_TAG_LENGTH = 35;

export function isDictationLanguageTag(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_TAG_LENGTH && TAG_PATTERN.test(value);
}

/** FR-1: a missing or invalid stored value means Automatic. */
export function normalizeDictationLanguage(value: unknown): string {
  return isDictationLanguageTag(value) ? value : DICTATION_LANGUAGE_AUTO;
}

/**
 * The `--locale` for a session starting now (FR-5, SPEC-145 FR-C5), or none.
 * Automatic passes none. On Linux, a subtag the active pack does not list runs
 * as Automatic, which still detects from speech; `packLanguages` is null only
 * for a developer helper override, which gets the saved value as is.
 */
export function resolveDictationSessionLocale(
  saved: string,
  platform: NodeJS.Platform,
  packLanguages: readonly string[] | null,
): string | undefined {
  const value = normalizeDictationLanguage(saved);
  if (value === DICTATION_LANGUAGE_AUTO) {
    return undefined;
  }
  if (platform === 'linux' && packLanguages && !packLanguages.includes(value)) {
    return undefined;
  }
  return value;
}

export async function readDesktopDictationLanguage(appStatePath: string): Promise<string> {
  try {
    const raw = await readFile(resolveDesktopPlatformPreferencesPath(appStatePath), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null
      ? normalizeDictationLanguage((parsed as Record<string, unknown>).dictationLanguage)
      : DICTATION_LANGUAGE_AUTO;
  } catch {
    return DICTATION_LANGUAGE_AUTO;
  }
}

/** Writes `dictationLanguage` into the Desktop preferences file, keeping every other field. */
export async function updateDesktopDictationLanguage(
  appStatePath: string,
  value: string,
): Promise<void> {
  if (value !== DICTATION_LANGUAGE_AUTO && !isDictationLanguageTag(value)) {
    throw new Error('Invalid dictation language.');
  }
  const filePath = resolveDesktopPlatformPreferencesPath(appStatePath);
  let record: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      record = parsed as Record<string, unknown>;
    }
  } catch {
    record = {};
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    `${JSON.stringify({ ...record, dictationLanguage: value }, null, 2)}\n`,
    'utf8',
  );
}

export interface HelperLanguageList {
  /** The language Automatic uses, if the helper can tell. */
  system: string | null;
  languages: string[];
}

/**
 * FR-3's listing line. Anything else, including a second line or a wrong type,
 * is malformed and means no list. A single tag in a shape the host does not
 * pass to a helper is dropped rather than costing the whole list.
 */
export function parseHelperLanguageList(stdout: string): HelperLanguageList | null {
  const lines = stdout.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  if (lines.length !== 1) {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(lines[0]);
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (record.type !== 'languages' || !Array.isArray(record.languages)) {
    return null;
  }
  if (record.system !== null && record.system !== undefined && typeof record.system !== 'string') {
    return null;
  }
  if (record.languages.length > MAX_LISTED_LANGUAGES || !record.languages.every((tag) => typeof tag === 'string')) {
    return null;
  }
  return {
    system: isDictationLanguageTag(record.system) ? record.system : null,
    languages: [...new Set((record.languages as string[]).filter(isDictationLanguageTag))],
  };
}

type ListSpawn = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

/**
 * Runs `<helper> --list-languages` (FR-3). A timeout, a spawn failure, a
 * non-zero exit, oversized output or a malformed line all resolve to null.
 */
export function listHelperLanguages(
  helperPath: string,
  options: { spawnProcess?: ListSpawn; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<HelperLanguageList | null> {
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = (options.spawnProcess ?? spawn)(helperPath, ['--list-languages'], {
        cwd: path.dirname(helperPath),
        env: options.env ?? process.env,
        shell: false,
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      });
    } catch {
      resolve(null);
      return;
    }
    let settled = false;
    let bytes = 0;
    const chunks: Buffer[] = [];
    const finish = (result: HelperLanguageList | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
      }
      resolve(result);
    };
    const timer = setTimeout(() => {
      finish(null);
    }, options.timeoutMs ?? DICTATION_LANGUAGE_LIST_TIMEOUT_MS);
    child.stdout?.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_LIST_OUTPUT_BYTES) {
        finish(null);
        return;
      }
      chunks.push(chunk);
    });
    child.once('error', () => {
      finish(null);
    });
    child.once('close', (code) => {
      finish(code === 0 ? parseHelperLanguageList(Buffer.concat(chunks).toString('utf8')) : null);
    });
  });
}

export interface DesktopDictationLanguageServiceOptions {
  platform: NodeJS.Platform;
  read: () => Promise<string>;
  write: (value: string) => Promise<void>;
  /** macOS and Windows: the native helper's list (FR-3). */
  listLanguages?: () => Promise<HelperLanguageList | null>;
  /** Linux: the languages of a usable active pack, or none (SPEC-145 FR-C5). */
  packLanguages?: () => Promise<readonly string[]>;
}

/**
 * The host side of the Voice input section (FR-4, FR-7). One listing runs at a
 * time; each request for options lists again, and the latest result is what a
 * new value is checked against.
 */
export class DesktopDictationLanguage {
  private readonly options: DesktopDictationLanguageServiceOptions;
  private listing: Promise<HelperLanguageList | null> | null = null;
  private listed: { result: HelperLanguageList | null } | null = null;

  constructor(options: DesktopDictationLanguageServiceOptions) {
    this.options = options;
  }

  private get linux(): boolean {
    return this.options.platform === 'linux';
  }

  /** The saved value, for a session start (FR-5). */
  saved(): Promise<string> {
    return this.options.read();
  }

  async getOptions(): Promise<DesktopDictationLanguageOptions> {
    if (this.linux) {
      const [value, languages] = await Promise.all([this.options.read(), this.packLanguages()]);
      return { automatic: 'detect', options: [...languages], value };
    }
    const [value, list] = await Promise.all([this.options.read(), this.list()]);
    return {
      automatic: 'system',
      ...(list?.system ? { system: list.system } : {}),
      options: list ? [...list.languages] : [],
      value,
    };
  }

  /** FR-1: a new value must be one of the platform's current options. */
  async setValue(value: unknown): Promise<void> {
    if (typeof value !== 'string') {
      throw new Error('Invalid dictation language.');
    }
    if (value !== DICTATION_LANGUAGE_AUTO) {
      const languages = this.linux
        ? await this.packLanguages()
        : (this.listed ? this.listed.result : await this.list())?.languages ?? [];
      if (!languages.includes(value)) {
        throw new Error('This dictation language is not available.');
      }
    }
    await this.options.write(value);
  }

  private async packLanguages(): Promise<readonly string[]> {
    try {
      return (await this.options.packLanguages?.()) ?? [];
    } catch {
      return [];
    }
  }

  private list(): Promise<HelperLanguageList | null> {
    if (!this.listing) {
      const listing = (async () => {
        let result: HelperLanguageList | null = null;
        try {
          result = (await this.options.listLanguages?.()) ?? null;
        } catch {
          result = null;
        }
        this.listed = { result };
        return result;
      })();
      this.listing = listing;
      void listing.finally(() => {
        if (this.listing === listing) {
          this.listing = null;
        }
      });
    }
    return this.listing;
  }
}

export interface DictationLanguageIpcMain {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
}

/** FR-7: both channels accept only the main window's main frame. */
export function registerDictationLanguageIpc(options: {
  ipcMain: DictationLanguageIpcMain;
  service: DesktopDictationLanguage;
  mainWindow: () => DesktopIpcMainWindow | null;
}): void {
  const guard = (event: unknown): void => {
    if (!isMainWindowMainFrameIpcSender(event, options.mainWindow())) {
      throw new Error('Voice input settings are only available to the main Cats window.');
    }
  };
  options.ipcMain.handle(DESKTOP_DICTATION_LANGUAGE_OPTIONS_CHANNEL, async (event) => {
    guard(event);
    return options.service.getOptions();
  });
  options.ipcMain.handle(DESKTOP_DICTATION_LANGUAGE_SET_CHANNEL, async (event, value) => {
    guard(event);
    await options.service.setValue(value);
  });
}
