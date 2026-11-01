import type {
  AssistantResponseLanguage,
  AssistantResponseLanguageCode,
  AssistantResponseLanguagePreference,
  PlatformUiLanguage,
} from './platform-contract.js';

export const ASSISTANT_RESPONSE_LANGUAGE_CODES = [
  'en',
  'zh-TW',
  'zh-CN',
  'ja',
  'ko',
  'fr',
  'de',
  'es',
  'pt-BR',
  'it',
  'nl',
  'pl',
  'tr',
  'id',
  'vi',
  'th',
  'hi',
  'ar',
] as const satisfies ReadonlyArray<AssistantResponseLanguageCode>;

const ASSISTANT_RESPONSE_LANGUAGE_PROMPT_NAMES: Record<AssistantResponseLanguageCode, string> = {
  en: 'English',
  'zh-TW': 'Traditional Chinese',
  'zh-CN': 'Simplified Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  'pt-BR': 'Brazilian Portuguese',
  it: 'Italian',
  nl: 'Dutch',
  pl: 'Polish',
  tr: 'Turkish',
  id: 'Indonesian',
  vi: 'Vietnamese',
  th: 'Thai',
  hi: 'Hindi',
  ar: 'Arabic',
};

export function isAssistantResponseLanguage(value: unknown): value is AssistantResponseLanguage {
  return value === 'unspecified'
    || ASSISTANT_RESPONSE_LANGUAGE_CODES.includes(value as AssistantResponseLanguageCode);
}

export function parseAssistantResponseLanguage(
  value: unknown,
): AssistantResponseLanguage | undefined {
  return isAssistantResponseLanguage(value) ? value : undefined;
}

export function isAssistantResponseLanguagePreference(
  value: unknown,
): value is AssistantResponseLanguagePreference {
  return value === 'display' || isAssistantResponseLanguage(value);
}

export function parseAssistantResponseLanguagePreference(
  value: unknown,
): AssistantResponseLanguagePreference | undefined {
  return isAssistantResponseLanguagePreference(value) ? value : undefined;
}

/**
 * The language a new chat is stamped with. `display` takes the display
 * language the renderer resolved, so an auto-detected locale counts; a missing
 * preference means no instruction.
 */
export function resolveAssistantResponseLanguage(
  preference: AssistantResponseLanguagePreference | undefined,
  displayLanguage: PlatformUiLanguage,
): AssistantResponseLanguage {
  if (preference === 'display') {
    return displayLanguage;
  }
  return preference ?? 'unspecified';
}

export function resolveAssistantResponseLanguagePromptName(
  language: AssistantResponseLanguage,
): string | null {
  return language === 'unspecified'
    ? null
    : ASSISTANT_RESPONSE_LANGUAGE_PROMPT_NAMES[language];
}

export function buildAssistantResponseLanguageInstruction(
  language: AssistantResponseLanguage,
): string | null {
  const promptName = resolveAssistantResponseLanguagePromptName(language);
  if (!promptName) {
    return null;
  }

  return [
    `Reply to the user in ${promptName} unless the user explicitly asks for another language.`,
    'Keep code, paths, commands, identifiers, logs, and quoted source text unchanged unless translation is explicitly requested.',
  ].join(' ');
}
