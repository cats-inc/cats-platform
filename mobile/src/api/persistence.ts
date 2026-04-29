import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persisted desktop connection. Today the mobile client only knows
 * one thing about the desktop: where to reach it (`baseUrl`). HTTP
 * fetches go straight at `${baseUrl}${path}`. There is no auth, no
 * relay, no tunnel integration. Earlier drafts of this module
 * speculated about cloud-relay / Cloudflare Tunnel / Tailscale modes
 * and a `pairingToken`; none of those exist yet, so they are not
 * persisted either.
 */
export interface ConnectionConfig {
  baseUrl: string | null;
}

const STORAGE_KEY = 'cats-mobile.connectionConfig.v2';

const DEFAULT_CONFIG: ConnectionConfig = {
  baseUrl: null,
};

export async function loadConnectionConfig(): Promise<ConnectionConfig> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_CONFIG;
    }
    const parsed = JSON.parse(raw) as Partial<ConnectionConfig>;
    return {
      baseUrl: parsed.baseUrl ?? DEFAULT_CONFIG.baseUrl,
    };
  } catch {
    // Storage corruption or read failure should not crash the app.
    // Fall back to defaults; the next save will overwrite the bad blob.
    return DEFAULT_CONFIG;
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
