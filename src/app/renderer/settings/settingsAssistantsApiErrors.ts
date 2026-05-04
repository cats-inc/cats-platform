import {
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../shared/i18n/index.js';

type SettingsAssistantsTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const SETTINGS_ASSISTANTS_API_ERROR_KEYS = new Map<string, MessageKey>([
  ['Invalid request body', messageKeys.settingsAssistantsApiInvalidRequestBody],
  ['Assistant name is required', messageKeys.settingsAssistantsApiAssistantNameRequired],
  ['Assistant provider is required', messageKeys.settingsAssistantsApiAssistantProviderRequired],
  ['Assistant model is required', messageKeys.settingsAssistantsApiAssistantModelRequired],
  ['Assistant not found', messageKeys.settingsAssistantsApiAssistantNotFound],
  [
    'Unexpected name field. Guide Cat name is system-managed.',
    messageKeys.settingsAssistantsApiGuideCatNameManaged,
  ],
  [
    'status must be active or dismissed',
    messageKeys.settingsAssistantsApiGuideCatStatusInvalid,
  ],
  ['No Guide Cat exists', messageKeys.settingsAssistantsApiGuideCatNotFound],
]);

export function localizeSettingsAssistantsApiErrorMessage(
  message: string,
  t: SettingsAssistantsTranslator,
): string | null {
  const key = SETTINGS_ASSISTANTS_API_ERROR_KEYS.get(message);
  return key ? t(key) : null;
}

export async function readSettingsAssistantsApiErrorMessage(
  response: Response,
  t: SettingsAssistantsTranslator,
  fallback: string,
): Promise<string> {
  try {
    const payload = await response.json() as {
      error?: string | {
        code?: unknown;
        message?: unknown;
      };
    };
    if (typeof payload.error === 'string') {
      const localizedMessage = localizeSettingsAssistantsApiErrorMessage(payload.error, t);
      return localizedMessage ?? (payload.error || fallback);
    }
    if (payload.error && typeof payload.error === 'object') {
      const code = typeof payload.error.code === 'string' ? payload.error.code : '';
      const message = typeof payload.error.message === 'string' ? payload.error.message : '';
      const localizedMessage = message
        ? localizeSettingsAssistantsApiErrorMessage(message, t)
        : null;
      if (localizedMessage) {
        return localizedMessage;
      }
      return code ? fallback : message || fallback;
    }
  } catch { /* ignore */ }

  return fallback;
}
