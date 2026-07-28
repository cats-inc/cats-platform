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
 * The Windows package is an assisted NSIS installer, so restart/install hands
 * off to a visible wizard. The section warns before the app exits rather than
 * implying a silent replacement.
 */
export function shouldWarnAboutVisibleInstaller(
  snapshot: DesktopUpdateSnapshot,
  platform: string,
): boolean {
  return snapshot.status === 'downloaded' && platform.toLowerCase().startsWith('win');
}
