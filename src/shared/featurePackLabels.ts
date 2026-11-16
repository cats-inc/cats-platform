// What the composer toast and Settings say about a feature pack (SPEC-145
// FR-C1-FR-C3). Raw failure messages are internal English; the owner only
// ever sees these catalog strings.

import type { FeaturePackFailure, FeaturePackSnapshot } from './featurePackBridge.js';
import { messageKeys, type MessageInterpolationValues, type MessageKey } from './i18n/index.js';

type Translate = (key: MessageKey, values?: MessageInterpolationValues) => string;

export const LINUX_STT_PACK_ID = 'linux-stt';
export const OPTIONAL_DOWNLOADS_SECTION_ID = 'optional-downloads';
export const OPTIONAL_DOWNLOADS_SETTINGS_PATH =
  `/settings/desktop#${OPTIONAL_DOWNLOADS_SECTION_ID}`;

/** Sizes for people, in decimal megabytes: "about 148 MB". */
export function formatFeaturePackSize(bytes: number): string {
  return bytes <= 0 ? '0 MB' : `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;
}

export function featurePackPercent(snapshot: FeaturePackSnapshot): number {
  if (snapshot.downloadSize <= 0) {
    return 0;
  }
  const received = snapshot.status === 'verifying'
    ? snapshot.downloadSize
    : snapshot.receivedBytes ?? 0;
  return Math.min(100, Math.floor((received / snapshot.downloadSize) * 100));
}

export interface FeaturePackRequiredMessage {
  text: string;
  /** Whether the toast offers Open Settings; an unsupported system has nothing to do there. */
  openSettings: boolean;
}

/**
 * The composer toast for `pack_required` (FR-C1). A snapshot the host could not
 * provide, and a pack that became usable in the meantime, have no row in
 * FR-C1's table; they get the plain message and the "try again" message.
 */
export function resolveFeaturePackRequiredMessage(
  snapshot: FeaturePackSnapshot | null,
  t: Translate,
): FeaturePackRequiredMessage {
  if (!snapshot) {
    return { text: t(messageKeys.sharedVoiceInputPackRequired), openSettings: true };
  }
  const size = formatFeaturePackSize(snapshot.downloadSize);
  const percent = featurePackPercent(snapshot);
  const withSettings = (text: string) => ({ text, openSettings: true });
  switch (snapshot.status) {
    case 'not_installed':
      return withSettings(t(messageKeys.sharedVoiceInputPackNotInstalled, { size }));
    case 'update_required':
      return withSettings(t(messageKeys.sharedVoiceInputPackUpdateRequired, { size }));
    case 'damaged':
      return withSettings(t(messageKeys.sharedVoiceInputPackDamaged));
    case 'downloading':
    case 'verifying':
      return withSettings(t(messageKeys.sharedVoiceInputPackDownloading, { percent }));
    case 'paused':
      return withSettings(t(messageKeys.sharedVoiceInputPackPaused, { percent }));
    case 'unsupported': {
      const detail = snapshot.unsupported?.detail ?? '';
      return {
        text: snapshot.unsupported?.reason === 'prerequisite'
          ? t(messageKeys.sharedVoiceInputPackNeedsLibrary, { library: detail })
          : t(messageKeys.sharedVoiceInputPackNeedsGlibc, { version: detail }),
        openSettings: false,
      };
    }
    case 'installed':
    case 'update_available':
      return { text: t(messageKeys.sharedVoiceInputPackReady), openSettings: false };
  }
}

const NETWORK_FAILURE_CODES = new Set([
  'network',
  'unexpected_response',
  'unexpected_range',
  'incomplete',
  'insecure_redirect',
  'bad_redirect',
  'too_many_redirects',
]);

/**
 * The Settings toast for a failed operation (FR-C2). `checking` says the
 * failure came from Check files, whose file errors mean a damaged install
 * rather than a rejected download.
 */
export function resolveFeaturePackFailureMessage(
  failure: Pick<FeaturePackFailure, 'stage' | 'code'>,
  t: Translate,
  options: { checking?: boolean } = {},
): string {
  if (failure.code === 'insufficient_space') {
    return t(messageKeys.settingsDesktopOptionalDownloadsFailureSpace);
  }
  if (failure.code === 'unsupported') {
    return t(messageKeys.settingsDesktopOptionalDownloadsFailureUnsupported);
  }
  if (failure.code === 'io_error') {
    return t(messageKeys.settingsDesktopOptionalDownloadsFailureDisk);
  }
  if (options.checking) {
    return t(messageKeys.settingsDesktopOptionalDownloadsFailureFiles);
  }
  if (NETWORK_FAILURE_CODES.has(failure.code)) {
    return t(messageKeys.settingsDesktopOptionalDownloadsFailureNetwork);
  }
  if (
    failure.code === 'oversize'
    || failure.stage === 'hash'
    || failure.stage === 'extract'
    || failure.stage === 'manifest'
  ) {
    return t(messageKeys.settingsDesktopOptionalDownloadsFailureVerify);
  }
  return t(messageKeys.settingsDesktopOptionalDownloadsFailureGeneric);
}
