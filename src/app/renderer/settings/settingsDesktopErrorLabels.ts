import {
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../shared/i18n/index.js';

type SettingsDesktopTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

/**
 * Host messages that describe an internal condition rather than something the
 * user can act on. They are replaced by the caller's localized fallback instead
 * of being shown verbatim.
 */
const LOCAL_FALLBACK_MESSAGES = new Set([
  'Desktop host is not initialized.',
  'Invalid desktop startup preferences payload.',
]);

export function formatSettingsDesktopMutationError(
  error: unknown,
  fallback: string,
  _t: SettingsDesktopTranslator,
): string {
  if (!(error instanceof Error)) {
    return fallback;
  }
  return LOCAL_FALLBACK_MESSAGES.has(error.message) ? fallback : error.message;
}
