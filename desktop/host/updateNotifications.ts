import type {
  DesktopUpdateErrorCode,
  DesktopUpdateSnapshot,
} from './contracts.js';
// Locale normalization is shared with the tray rather than duplicated. The
// main process has no i18n runtime, so both surfaces resolve their own copy
// from the same two-locale rule.
import {
  normalizeDesktopTrayLocale,
  type DesktopTrayLocale,
} from './trayMenu.js';

/**
 * Native update notifications.
 *
 * SPEC-111 section 5 requires a check started outside Settings to report its
 * result somewhere the user is actually looking. This module owns that policy;
 * `main.ts` only constructs the native notification the policy asks for, so the
 * rules stay testable without Electron.
 */

/** Where the check that produced the result came from. */
export const DESKTOP_UPDATE_NOTIFICATION_ORIGINS = ['tray', 'settings', 'startup'] as const;
export type DesktopUpdateNotificationOrigin =
  typeof DESKTOP_UPDATE_NOTIFICATION_ORIGINS[number];

export const DESKTOP_UPDATE_SETTINGS_PATH = '/settings/desktop';

export interface DesktopUpdateNotification {
  title: string;
  body: string;
  /** Where activating the notification shall land the user. */
  navigatePath: typeof DESKTOP_UPDATE_SETTINGS_PATH;
}

export interface DesktopUpdateAnnouncement {
  notification: DesktopUpdateNotification | null;
  /**
   * Where to open the main window when no notification reaches the user —
   * either because the platform has none or because showing it failed.
   *
   * Null when the result does not justify pulling a window forward. Set
   * independently of `notification` so the caller never has to re-derive the
   * policy after a failed `show()`.
   */
  fallbackNavigatePath: typeof DESKTOP_UPDATE_SETTINGS_PATH | null;
}

/**
 * Error copy for notifications, in the same two locales the tray uses.
 *
 * These strings are duplicated from the renderer i18n catalogs because the
 * main process has no translator. `settings-desktop-update-labels.test.tsx`
 * asserts they stay identical to the catalog entries, so the duplication cannot
 * drift silently.
 */
export const DESKTOP_UPDATE_NOTIFICATION_ERROR_COPY: Record<
  DesktopTrayLocale,
  Record<DesktopUpdateErrorCode, string>
> = {
  en: {
    offline: 'Cats could not reach the update service.',
    timeout: 'The update service did not respond in time.',
    provider_rejected: 'The update service rejected the request.',
    metadata_invalid: 'The update information could not be read.',
    checksum_mismatch: 'The downloaded update failed its integrity check.',
    signature_rejected: 'The downloaded update failed its signature check.',
    unsupported_package: 'This installation cannot update itself.',
    download_cancelled: 'The update download was cancelled.',
    install_handoff_failed: 'Cats could not open the installer.',
    unknown: 'The update could not be completed.',
  },
  'zh-TW': {
    offline: 'Cats 無法連線到更新服務。',
    timeout: '更新服務未在時限內回應。',
    provider_rejected: '更新服務拒絕了這次請求。',
    metadata_invalid: '無法讀取更新資訊。',
    checksum_mismatch: '下載的更新未通過完整性檢查。',
    signature_rejected: '下載的更新未通過簽章檢查。',
    unsupported_package: '這個安裝方式無法自我更新。',
    download_cancelled: '更新下載已取消。',
    install_handoff_failed: 'Cats 無法開啟安裝程式。',
    unknown: '更新無法完成。',
  },
};

interface NotificationCopy {
  upToDateTitle: string;
  upToDateBody: (version: string) => string;
  availableTitle: string;
  availableBody: (version: string) => string;
  failedTitle: string;
  previewSuffix: string;
}

const NOTIFICATION_COPY: Record<DesktopTrayLocale, NotificationCopy> = {
  en: {
    upToDateTitle: 'Cats is up to date',
    upToDateBody: (version) => `Cats ${version} is the latest version.`,
    availableTitle: 'Update available',
    availableBody: (version) => `Cats ${version} is available to download.`,
    failedTitle: 'Update check failed',
    previewSuffix: ' (preview)',
  },
  'zh-TW': {
    upToDateTitle: 'Cats 已是最新版本',
    upToDateBody: (version) => `Cats ${version} 已是最新版本。`,
    availableTitle: '有可用更新',
    availableBody: (version) => `Cats ${version} 已可下載。`,
    failedTitle: '更新檢查失敗',
    previewSuffix: '（預覽）',
  },
};

const NOTHING_TO_ANNOUNCE: DesktopUpdateAnnouncement = {
  notification: null,
  fallbackNavigatePath: null,
};

export interface ResolveDesktopUpdateAnnouncementInput {
  origin: DesktopUpdateNotificationOrigin;
  snapshot: DesktopUpdateSnapshot;
  locale?: string | null;
  /** `Notification.isSupported()`, resolved by the caller. */
  notificationsSupported: boolean;
}

/**
 * Decides what a finished check should tell the user, and how.
 *
 * A result is announced only when the user cannot already see it:
 *
 * - `settings` never announces. The section shows the state directly and
 *   routes manual results through the shared toast system, so a native
 *   notification would report the same check twice.
 * - `tray` announces up-to-date, available, and failed. The menu closes on
 *   click, so without this the command looks like it did nothing.
 * - `startup` announces only an available update. The user did not ask for
 *   that check, so an up-to-date or offline result has nothing to say and
 *   would nag on every launch.
 */
export function resolveDesktopUpdateAnnouncement(
  input: ResolveDesktopUpdateAnnouncementInput,
): DesktopUpdateAnnouncement {
  const { origin, snapshot, notificationsSupported } = input;

  if (origin === 'settings') {
    return NOTHING_TO_ANNOUNCE;
  }
  // A build that cannot check cannot have produced a result worth reporting,
  // and must never imply that an update path exists.
  if (!snapshot.capability.canCheck) {
    return NOTHING_TO_ANNOUNCE;
  }

  const locale = normalizeDesktopTrayLocale(input.locale);
  const notification = resolveNotification(origin, snapshot, locale);
  if (notification === null) {
    return NOTHING_TO_ANNOUNCE;
  }

  // SPEC-111 section 5.5: a tray-originated result always becomes visible, so
  // it falls back to opening Settings. A startup check was never requested, so
  // pulling a window forward unasked would be worse than staying quiet.
  const fallbackNavigatePath = origin === 'tray' ? DESKTOP_UPDATE_SETTINGS_PATH : null;

  return {
    notification: notificationsSupported ? notification : null,
    fallbackNavigatePath,
  };
}

function resolveNotification(
  origin: DesktopUpdateNotificationOrigin,
  snapshot: DesktopUpdateSnapshot,
  locale: DesktopTrayLocale,
): DesktopUpdateNotification | null {
  const copy = NOTIFICATION_COPY[locale];
  // A preview self-updates from an unsigned prerelease feed. A tester who
  // cannot tell that apart from a supported release cannot report usefully.
  const suffix = snapshot.capability.distribution === 'preview_packaged'
    ? copy.previewSuffix
    : '';
  const announce = (title: string, body: string): DesktopUpdateNotification => ({
    title: `${title}${suffix}`,
    body,
    navigatePath: DESKTOP_UPDATE_SETTINGS_PATH,
  });

  switch (snapshot.status) {
    case 'up_to_date':
      return origin === 'tray'
        ? announce(copy.upToDateTitle, copy.upToDateBody(snapshot.currentVersion))
        : null;

    case 'update_available':
      // The manager rejects an available update without a version, so this
      // guard is only here to keep a version-less body unreachable.
      return snapshot.availableVersion === null
        ? null
        : announce(copy.availableTitle, copy.availableBody(snapshot.availableVersion));

    case 'failed':
      return origin === 'tray' && snapshot.error !== null
        ? announce(
          copy.failedTitle,
          DESKTOP_UPDATE_NOTIFICATION_ERROR_COPY[locale][snapshot.error.code],
        )
        : null;

    default:
      // Every other status is either in flight or the result of an action the
      // user took in Settings, where the surface already reports it.
      return null;
  }
}
