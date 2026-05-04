import {
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../../shared/i18n/index.js';

type SettingsCatsRegistryTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const EXACT_SETTINGS_CATS_ERROR_KEYS = new Map<string, MessageKey>([
  ['Cat name is required', messageKeys.sharedSettingsCatsErrorNameRequired],
  ['Cat provider is required', messageKeys.sharedSettingsCatsErrorProviderRequired],
  ['Cat name cannot be empty', messageKeys.sharedSettingsCatsErrorNameEmpty],
  ['Cat is already archived', messageKeys.sharedSettingsCatsErrorAlreadyArchived],
  ['Cat is already active', messageKeys.sharedSettingsCatsErrorAlreadyActive],
  [
    'Cat cannot be archived and recovered at the same time',
    messageKeys.sharedSettingsCatsErrorArchiveRecoverConflict,
  ],
  [
    'Cat must be available in at least one product',
    messageKeys.sharedSettingsCatsErrorNoProducts,
  ],
  [
    'Bot token is already used by another binding',
    messageKeys.sharedSettingsCatsErrorBotTokenDuplicate,
  ],
]);

const LOCAL_FALLBACK_PATTERNS = [
  /^cats chat cat creation returned \d+$/u,
  /^cat profile update returned \d+$/u,
  /^cats cat deletion returned \d+$/u,
  /^bot binding create returned \d+$/u,
  /^bot binding delete returned \d+$/u,
  /^update bot binding returned \d+$/u,
];

export function localizeSettingsCatsRegistryErrorMessage(
  message: string,
  t: SettingsCatsRegistryTranslator,
): string | null {
  const exactKey = EXACT_SETTINGS_CATS_ERROR_KEYS.get(message);
  if (exactKey) {
    return t(exactKey);
  }

  const duplicateNameMatch = message.match(/^A cat named "(.+)" already exists$/u);
  if (duplicateNameMatch) {
    return t(messageKeys.sharedSettingsCatsErrorNameDuplicate, {
      name: duplicateNameMatch[1],
    });
  }

  const limitMatch = message.match(/^Cat limit reached \(max (\d+)\)$/u);
  if (limitMatch) {
    return t(messageKeys.sharedSettingsCatsErrorLimitReached, {
      maxCats: limitMatch[1],
    });
  }

  if (message.startsWith('Cat not found:')) {
    return t(messageKeys.sharedSettingsCatsErrorNotFound);
  }
  if (message.startsWith('Cat is not active:')) {
    return t(messageKeys.sharedSettingsCatsErrorNotActive);
  }
  if (message.startsWith('Cat is not available in Cats Chat:')) {
    return t(messageKeys.sharedSettingsCatsErrorNotAvailableInChat);
  }
  if (message.startsWith('Bot binding not found:')) {
    return t(messageKeys.sharedSettingsCatsErrorBotBindingNotFound);
  }

  return null;
}

export function formatSettingsCatsRegistryMutationError(
  error: unknown,
  fallback: string,
  t: SettingsCatsRegistryTranslator,
): string {
  if (!(error instanceof Error)) {
    return fallback;
  }
  const localizedMessage = localizeSettingsCatsRegistryErrorMessage(error.message, t);
  if (localizedMessage) {
    return localizedMessage;
  }
  return LOCAL_FALLBACK_PATTERNS.some((pattern) => pattern.test(error.message))
    ? fallback
    : error.message;
}
