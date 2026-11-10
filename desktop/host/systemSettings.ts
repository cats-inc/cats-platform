import { execFile } from 'node:child_process';

import {
  DESKTOP_SYSTEM_SETTINGS_PANES,
  type DesktopSystemSettingsPane,
} from './contracts.js';

export {
  DESKTOP_LOGIN_ITEM_APPROVAL_CHANNEL,
  DESKTOP_SYSTEM_SETTINGS_OPEN_CHANNEL,
} from './contracts.js';

const PANE_SET = new Set<string>(DESKTOP_SYSTEM_SETTINGS_PANES);

export function isDesktopSystemSettingsPane(value: unknown): value is DesktopSystemSettingsPane {
  return typeof value === 'string' && PANE_SET.has(value);
}

/**
 * ADR-147: the macOS System Settings panes the owner is sent to when a
 * permission is missing. The renderer names a pane; these constant URLs are
 * the only ones the host opens, through its own handler rather than the
 * general external-open path. Checked on macOS 27.2.
 */
const MACOS_PRIVACY = 'x-apple.systempreferences:com.apple.preference.security';

export const MACOS_SYSTEM_SETTINGS_URLS: Readonly<Record<DesktopSystemSettingsPane, string>> = {
  microphone: `${MACOS_PRIVACY}?Privacy_Microphone`,
  speech_recognition: `${MACOS_PRIVACY}?Privacy_SpeechRecognition`,
  screen_recording: `${MACOS_PRIVACY}?Privacy_ScreenCapture`,
  login_items: 'x-apple.systempreferences:com.apple.LoginItems-Settings.extension',
};

export function resolveMacosSystemSettingsUrl(pane: unknown): string {
  if (!isDesktopSystemSettingsPane(pane)) {
    throw new Error('Unknown System Settings pane.');
  }
  return MACOS_SYSTEM_SETTINGS_URLS[pane];
}

export interface LoginItemStatusSource {
  isPackaged: boolean;
  getLoginItemSettings(): { status?: string };
}

/**
 * macOS 13+ registers the login item through SMAppService; `requires-approval`
 * means it is registered but the owner has to allow it in Login Items.
 */
export function loginItemNeedsApproval(
  app: LoginItemStatusSource,
  options: { platform?: NodeJS.Platform; candidate?: boolean } = {},
): boolean {
  if ((options.platform ?? process.platform) !== 'darwin' || !app.isPackaged || options.candidate) {
    return false;
  }
  try {
    return app.getLoginItemSettings().status === 'requires-approval';
  } catch {
    return false;
  }
}

/**
 * Whether a capture refused for Screen Recording should ask macOS first: on any
 * status but `granted`. Electron reports an app macOS has never asked as
 * `denied` (CGPreflightScreenCaptureAccess is yes or no), so waiting for
 * `not-determined` would never ask. Checked with Electron 41.2.0 on macOS 27.2.
 */
export function shouldRequestScreenCaptureAccess(mediaAccessStatus: string | null): boolean {
  return mediaAccessStatus !== null && mediaAccessStatus !== 'granted';
}

export type ScreenCaptureRequestRunner = (
  helperPath: string,
  args: readonly string[],
) => Promise<string>;

const SCREEN_CAPTURE_REQUEST_TIMEOUT_MS = 5_000;

/** The helper prints one line, `{"type":"screen_capture","granted":true|false}`. */
export function parseScreenCaptureRequestOutput(output: string): boolean | undefined {
  try {
    const parsed = JSON.parse(output.trim()) as { type?: unknown; granted?: unknown };
    return parsed.type === 'screen_capture' && typeof parsed.granted === 'boolean' ? parsed.granted : undefined;
  } catch {
    return undefined;
  }
}

const runHelper: ScreenCaptureRequestRunner = (helperPath, args) => new Promise((resolve, reject) => {
  execFile(helperPath, [...args], { timeout: SCREEN_CAPTURE_REQUEST_TIMEOUT_MS }, (error, stdout) => {
    if (error) {
      reject(error);
      return;
    }
    resolve(String(stdout));
  });
});

/**
 * ADR-147: asks macOS for Screen Recording access once per run while it is not
 * granted (a never-asked app reads as `denied` in Electron), through the
 * macOS speech helper the app already ships (`--request-screen-capture`, which
 * calls `CGRequestScreenCaptureAccess`). The request lists the app in Screen &
 * System Audio Recording and may show the system prompt; it never grants
 * access by itself, so the caller still reports the permission as missing.
 * Returns whether a request was made.
 */
export function createScreenCaptureAccessRequester(options: {
  resolveHelperPath: () => string | null;
  run?: ScreenCaptureRequestRunner;
  log?: (fields: { granted?: boolean; error?: string }) => void;
}): () => Promise<boolean> {
  let requested = false;
  const run = options.run ?? runHelper;
  return async () => {
    if (requested) {
      return false;
    }
    const helperPath = options.resolveHelperPath();
    if (!helperPath) {
      return false;
    }
    requested = true;
    try {
      const output = await run(helperPath, ['--request-screen-capture']);
      options.log?.({ granted: parseScreenCaptureRequestOutput(output) });
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      options.log?.({ error: typeof code === 'string' ? code : 'failed' });
    }
    return true;
  };
}
