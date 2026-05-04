import {
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../../shared/i18n/index.js';

type SettingsCatsMemoryTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const EXACT_MEMORY_ERROR_KEYS = new Map<string, MessageKey>([
  ['Memory content is required.', messageKeys.sharedSettingsCatsMemoryContentRequired],
  [
    'Memory content must be a non-empty string.',
    messageKeys.sharedSettingsCatsMemoryContentRequired,
  ],
  ['Invalid memory category.', messageKeys.sharedSettingsCatsMemoryInvalidCategory],
]);

const LOCAL_FALLBACK_PATTERNS = [
  /^cat memory create returned \d+$/u,
  /^cat memory delete returned \d+$/u,
];

export function localizeSettingsCatsMemoryErrorMessage(
  message: string,
  t: SettingsCatsMemoryTranslator,
): string | null {
  const exactKey = EXACT_MEMORY_ERROR_KEYS.get(message);
  if (exactKey) {
    return t(exactKey);
  }
  if (message.startsWith('Cat memory not found:')) {
    return t(messageKeys.sharedSettingsCatsMemoryNotFound);
  }
  if (message.startsWith('Cat not found:')) {
    return t(messageKeys.sharedSettingsCatsErrorNotFound);
  }
  return null;
}

export function formatSettingsCatsMemoryMutationError(
  error: unknown,
  fallback: string,
  t: SettingsCatsMemoryTranslator,
): string {
  if (!(error instanceof Error)) {
    return fallback;
  }
  const localizedMessage = localizeSettingsCatsMemoryErrorMessage(error.message, t);
  if (localizedMessage) {
    return localizedMessage;
  }
  return LOCAL_FALLBACK_PATTERNS.some((pattern) => pattern.test(error.message))
    ? fallback
    : error.message;
}
