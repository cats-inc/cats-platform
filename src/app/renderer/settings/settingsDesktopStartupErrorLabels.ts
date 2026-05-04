import {
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../shared/i18n/index.js';

type SettingsDesktopStartupTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const LOCAL_FALLBACK_MESSAGES = new Set([
  'Desktop host is not initialized.',
  'Invalid desktop startup preferences payload.',
]);

export function formatSettingsDesktopStartupMutationError(
  error: unknown,
  fallback: string,
  _t: SettingsDesktopStartupTranslator,
): string {
  if (!(error instanceof Error)) {
    return fallback;
  }
  return LOCAL_FALLBACK_MESSAGES.has(error.message) ? fallback : error.message;
}
