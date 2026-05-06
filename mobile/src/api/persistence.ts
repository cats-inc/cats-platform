import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

import type { MobileLocaleOverride } from '../../../src/mobile/index.js';

/**
 * Persisted desktop connection. Today the mobile client only knows
 * one thing about the desktop: where to reach it (`baseUrl`). HTTP
 * fetches go straight at `${baseUrl}${path}`. On a QR-launched Expo Go
 * session, the desktop injects the LAN base URL into the manifest so
 * first launch can connect without manual entry. There is no auth, no
 * relay, no tunnel integration, and no persisted pairing token yet.
 */
export interface ConnectionConfig {
  baseUrl: string | null;
}

const STORAGE_KEY = 'cats-mobile.connectionConfig.v2';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : null;
}

function normalizeDesktopBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//iu.test(trimmed)) {
    return null;
  }
  try {
    return new URL(trimmed).href.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function readDesktopBaseUrlFromExtra(extra: unknown): string | null {
  const record = asRecord(extra);
  if (!record) {
    return null;
  }

  const direct = normalizeDesktopBaseUrl(record.catsDesktopBaseUrl);
  if (direct) {
    return direct;
  }

  const expoClient = asRecord(record.expoClient);
  const expoClientExtra = asRecord(expoClient?.extra);
  return normalizeDesktopBaseUrl(expoClientExtra?.catsDesktopBaseUrl);
}

function resolveManifestDesktopBaseUrl(): string | null {
  const constants = Constants as unknown as {
    expoConfig?: { extra?: unknown } | null;
    manifest?: { extra?: unknown } | null;
    manifest2?: { extra?: unknown } | null;
  };
  return (
    readDesktopBaseUrlFromExtra(constants.expoConfig?.extra)
    ?? readDesktopBaseUrlFromExtra(constants.manifest?.extra)
    ?? readDesktopBaseUrlFromExtra(constants.manifest2?.extra)
    ?? null
  );
}

function resolveDefaultConfig(): ConnectionConfig {
  return {
    baseUrl: resolveManifestDesktopBaseUrl(),
  };
}

export async function loadConnectionConfig(): Promise<ConnectionConfig> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return resolveDefaultConfig();
    }
    const parsed = JSON.parse(raw) as Partial<ConnectionConfig>;
    const fallback = resolveDefaultConfig();
    const hasStoredBaseUrl = Object.prototype.hasOwnProperty.call(parsed, 'baseUrl');
    return {
      baseUrl: hasStoredBaseUrl ? parsed.baseUrl ?? null : fallback.baseUrl,
    };
  } catch {
    // Storage corruption or read failure should not crash the app.
    // Fall back to defaults; the next save will overwrite the bad blob.
    return resolveDefaultConfig();
  }
}

export async function saveConnectionConfig(
  config: ConnectionConfig,
): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

/**
 * Returns the URL the "Open web dashboard" entry should link out to,
 * derived from the persisted config. Returns null when the device has
 * no usable host yet — the caller renders the link disabled in that
 * case.
 */
export function resolveWebDashboardUrl(config: ConnectionConfig): string | null {
  if (!config.baseUrl) {
    return null;
  }
  const trimmed = config.baseUrl.trim().replace(/\/+$/, '');
  if (trimmed.length === 0) {
    return null;
  }
  return `${trimmed}/`;
}

/**
 * Persisted notification preferences. The toggles in Settings save
 * locally so they survive restarts; actual push delivery (APNs / FCM
 * device-token registration, server fan-out) is not wired yet.
 */
export interface NotificationPreferences {
  enabled: boolean;
  approvalsOnly: boolean;
}

const NOTIFICATIONS_STORAGE_KEY = 'cats-mobile.notificationPreferences.v1';

const DEFAULT_NOTIFICATIONS: NotificationPreferences = {
  enabled: true,
  approvalsOnly: false,
};

export async function loadNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_NOTIFICATIONS;
    }
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    return {
      enabled: parsed.enabled ?? DEFAULT_NOTIFICATIONS.enabled,
      approvalsOnly:
        parsed.approvalsOnly ?? DEFAULT_NOTIFICATIONS.approvalsOnly,
    };
  } catch {
    return DEFAULT_NOTIFICATIONS;
  }
}

export async function saveNotificationPreferences(
  prefs: NotificationPreferences,
): Promise<void> {
  await AsyncStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(prefs));
}

/**
 * Persisted display-language preference. `'auto'` is the default —
 * `resolveDefaultMobileLocale()` then falls back to the phone's
 * `Intl` locale. Explicit `'en'` / `'zh-TW'` pin the UI regardless of
 * the device locale. Mirrors the desktop Settings → General language
 * card; see `MobileSettingsCopy` for the i18n keys.
 */
const LOCALE_STORAGE_KEY = 'cats-mobile.localePreference.v1';

const DEFAULT_LOCALE_PREFERENCE: MobileLocaleOverride = 'auto';

function normalizeLocalePreference(value: unknown): MobileLocaleOverride {
  if (value === 'en' || value === 'zh-TW' || value === 'auto') {
    return value;
  }
  return DEFAULT_LOCALE_PREFERENCE;
}

export async function loadLocalePreference(): Promise<MobileLocaleOverride> {
  try {
    const raw = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_LOCALE_PREFERENCE;
    }
    return normalizeLocalePreference(JSON.parse(raw));
  } catch {
    return DEFAULT_LOCALE_PREFERENCE;
  }
}

export async function saveLocalePreference(
  preference: MobileLocaleOverride,
): Promise<void> {
  await AsyncStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify(preference));
}
