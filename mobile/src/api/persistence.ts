import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persisted connection configuration. The fields here cover the
 * "direct dev connection" scope the integrator review (review on
 * `9531f0e8`) asked for as the lightweight precursor to Phase 7:
 *
 *   - `mode` — which transport family is active (cloud relay, tunnel,
 *     Tailscale).
 *   - `baseUrl` — the URL the mobile client should fetch product APIs
 *     from. For LAN dev this is e.g. `http://192.168.1.244:8181`. For
 *     Tailscale it is `http://100.x.x.x:8181`. For cloud relay it is
 *     the relay URL once Phase 7 lands.
 *   - `pairingToken` — placeholder slot for the bearer / device token
 *     once the Phase-7 pairing flow exists. Kept here so the
 *     persistence shape is forward-compatible.
 */
export interface ConnectionConfig {
  mode: ConnectionMode;
  baseUrl: string | null;
  pairingToken: string | null;
}

export type ConnectionMode = 'relay' | 'tunnel' | 'tailscale';

const STORAGE_KEY = 'cats-mobile.connectionConfig.v1';

const DEFAULT_CONFIG: ConnectionConfig = {
  mode: 'relay',
  baseUrl: null,
  pairingToken: null,
};

export async function loadConnectionConfig(): Promise<ConnectionConfig> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_CONFIG;
    }
    const parsed = JSON.parse(raw) as Partial<ConnectionConfig>;
    return {
      mode: parsed.mode ?? DEFAULT_CONFIG.mode,
      baseUrl: parsed.baseUrl ?? DEFAULT_CONFIG.baseUrl,
      pairingToken: parsed.pairingToken ?? DEFAULT_CONFIG.pairingToken,
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
 * case (per the 2026-04-29 review on `eba8bfe8`: never hard-code
 * `127.0.0.1`).
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
 * Persisted notification preferences. The toggles in Settings are
 * stored locally so they survive restarts, but actual push delivery
 * (APNs / FCM device-token registration, server-side fan-out) lands
 * with Phase 7. Until then these are best-effort hints for any local
 * notification fallback.
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
