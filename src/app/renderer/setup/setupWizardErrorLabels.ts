import {
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../shared/i18n/index.js';

type SetupWizardTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const LOCAL_FALLBACK_MESSAGES = new Set([
  'Invalid desktop platform shell payload.',
]);

export function formatSetupWizardCompletionError(
  error: unknown,
  fallback: string,
  _t: SetupWizardTranslator,
): string {
  if (!(error instanceof Error)) {
    return fallback;
  }
  return LOCAL_FALLBACK_MESSAGES.has(error.message) ? fallback : error.message;
}
