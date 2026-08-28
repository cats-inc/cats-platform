import type {
  DesktopUpdateErrorCode,
  DesktopUpdateNextAction,
  DesktopUpdateSnapshot,
  DesktopUpdateStatus,
} from '../../../shared/desktopRecoveryBridge.js';
import { type MessageKey } from '../../../shared/i18n/index.js';
// Imported from the tone module rather than the settings barrel: the barrel is
// a .tsx file, and the server tsconfig compiles src/** without JSX enabled.
import type {
  SettingsStatusChipTone,
} from '../../../design/components/settings/SettingsStatusChipTone.js';

/**
 * Presentation mapping for the `App updates` settings section.
 *
 * The host sends a stable status and a stable error code; every user-visible
 * string is resolved here from the shared catalogs. Provider messages never
 * reach the UI, so a raw error string cannot leak into the renderer.
 */

const STATUS_MESSAGE_KEYS: Record<DesktopUpdateStatus, MessageKey> = {
  unavailable: 'settingsDesktopUpdatesStatusUnavailable',
  idle: 'settingsDesktopUpdatesStatusIdle',
  checking: 'settingsDesktopUpdatesStatusChecking',
  up_to_date: 'settingsDesktopUpdatesStatusUpToDate',
  update_available: 'settingsDesktopUpdatesStatusAvailable',
  downloading: 'settingsDesktopUpdatesStatusDownloading',
  downloaded: 'settingsDesktopUpdatesStatusDownloaded',
  installing: 'settingsDesktopUpdatesStatusInstalling',
  failed: 'settingsDesktopUpdatesStatusFailed',
};

const STATUS_TONES: Record<DesktopUpdateStatus, SettingsStatusChipTone> = {
  unavailable: 'muted',
  idle: 'muted',
  checking: 'muted',
  up_to_date: 'ready',
  update_available: 'warm',
  downloading: 'muted',
  downloaded: 'ready',
  installing: 'muted',
  failed: 'warm',
};

const ERROR_MESSAGE_KEYS: Record<DesktopUpdateErrorCode, MessageKey> = {
  offline: 'settingsDesktopUpdatesErrorOffline',
  timeout: 'settingsDesktopUpdatesErrorTimeout',
  provider_rejected: 'settingsDesktopUpdatesErrorProviderRejected',
  metadata_invalid: 'settingsDesktopUpdatesErrorMetadataInvalid',
  checksum_mismatch: 'settingsDesktopUpdatesErrorChecksumMismatch',
  signature_rejected: 'settingsDesktopUpdatesErrorSignatureRejected',
  unsupported_package: 'settingsDesktopUpdatesErrorUnsupportedPackage',
  download_cancelled: 'settingsDesktopUpdatesErrorDownloadCancelled',
  install_handoff_failed: 'settingsDesktopUpdatesErrorInstallHandoffFailed',
  unknown: 'settingsDesktopUpdatesErrorUnknown',
};

const ACTION_MESSAGE_KEYS: Record<DesktopUpdateNextAction, MessageKey | null> = {
  none: null,
  check: 'settingsDesktopUpdatesActionCheck',
  download: 'settingsDesktopUpdatesActionDownload',
  restart_install: 'settingsDesktopUpdatesActionRestartInstall',
};

const BUSY_ACTION_MESSAGE_KEYS: Partial<Record<DesktopUpdateStatus, MessageKey>> = {
  checking: 'settingsDesktopUpdatesActionChecking',
  downloading: 'settingsDesktopUpdatesActionDownloading',
  installing: 'settingsDesktopUpdatesActionInstalling',
};

export function resolveDesktopUpdateStatusMessageKey(status: DesktopUpdateStatus): MessageKey {
  return STATUS_MESSAGE_KEYS[status] ?? STATUS_MESSAGE_KEYS.unavailable;
}

export function resolveDesktopUpdateStatusTone(
  status: DesktopUpdateStatus,
): SettingsStatusChipTone {
  return STATUS_TONES[status] ?? 'muted';
}

export function resolveDesktopUpdateErrorMessageKey(code: DesktopUpdateErrorCode): MessageKey {
  return ERROR_MESSAGE_KEYS[code] ?? ERROR_MESSAGE_KEYS.unknown;
}

export interface DesktopUpdatePrimaryAction {
  messageKey: MessageKey;
  action: DesktopUpdateNextAction;
  disabled: boolean;
}

/**
 * Exactly one primary button is offered at a time. While an operation is in
 * flight the button stays visible but disabled with a truthful busy label, so
 * the surface never implies a second request is possible.
 */
export function resolveDesktopUpdatePrimaryAction(
  snapshot: DesktopUpdateSnapshot,
): DesktopUpdatePrimaryAction | null {
  const busyKey = BUSY_ACTION_MESSAGE_KEYS[snapshot.status];
  if (busyKey) {
    return { messageKey: busyKey, action: 'none', disabled: true };
  }

  const messageKey = ACTION_MESSAGE_KEYS[snapshot.nextAction];
  if (!messageKey) {
    return null;
  }

  return { messageKey, action: snapshot.nextAction, disabled: false };
}

export function formatDesktopUpdateProgressPercent(
  snapshot: DesktopUpdateSnapshot,
): number | null {
  if (snapshot.status !== 'downloading' || snapshot.progress === null) {
    return null;
  }
  const percent = Math.round(snapshot.progress.percent);
  return Math.min(100, Math.max(0, percent));
}

/**
 * What installing will actually do, for the platforms where it is not a silent
 * replacement.
 *
 * Windows hands off to an assisted NSIS installer, so a wizard appears. Linux
 * installs the .deb through dpkg, which asks for a password -- SPEC-111
 * section 8 is explicit that the "no elevation prompt" guarantee covers the
 * per-user Windows installer only and does not extend there. macOS replaces
 * the app in place with no prompt of its own, so it has nothing to warn about.
 *
 * Returns the message alias to render, or null when there is nothing to say.
 */
export function resolveDesktopUpdateInstallNoticeKey(
  snapshot: DesktopUpdateSnapshot,
  platform: string,
): 'settingsDesktopUpdatesWindowsInstallerNotice'
  | 'settingsDesktopUpdatesLinuxInstallerNotice'
  | null {
  if (snapshot.status !== 'downloaded') {
    return null;
  }

  const normalized = platform.toLowerCase();
  if (normalized.startsWith('win')) {
    return 'settingsDesktopUpdatesWindowsInstallerNotice';
  }
  // navigator.platform reports "Linux x86_64"; process.platform reports
  // "linux". Both have to resolve here because the section is rendered from
  // the renderer but the value is injectable for tests.
  if (normalized.startsWith('linux')) {
    return 'settingsDesktopUpdatesLinuxInstallerNotice';
  }
  return null;
}

/**
 * A preview build self-updates so the upgrade path can be exercised before
 * signing exists. It must say so, or a tester cannot tell it apart from a
 * supported release.
 */
export function isDesktopPreviewBuild(snapshot: DesktopUpdateSnapshot): boolean {
  return snapshot.capability.distribution === 'preview_packaged';
}
