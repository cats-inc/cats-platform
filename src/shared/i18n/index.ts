import {
  messageKeys,
  type MessageCatalogId,
  type MessageKey,
} from './messageKeys.js';
import { enCatalog } from './catalogs/en.js';
import { zhTWCatalog } from './catalogs/zh-TW.js';

export type MessageLocale = 'en' | 'zh-TW';

export interface MessageInterpolationValues {
  [key: string]: unknown;
}

export type MessageCatalog = Record<MessageCatalogId, string>;

const catalogs: Record<MessageLocale, MessageCatalog> = {
  en: enCatalog,
  'zh-TW': zhTWCatalog,
};

const ZH_TW_LOCALE_HINTS = new Set<string>([
  'zh',
  'zh-tw',
  'zh-hant',
  'zh-hk',
  'zh-mo',
  'chinese',
  'traditional',
  'traditional chinese',
  'mandarin',
  '中文',
  '繁體中文',
  '繁体中文',
  '繁體',
  '繁体',
  '國語',
  '国语',
  '華語',
  '华语',
]);

const ZH_SIMPLIFIED_LOCALE_HINTS = new Set<string>([
  'zh-cn',
  'zh-hans',
  'zh-sg',
  'zh-my',
  'simplified',
  'simplified chinese',
  '簡體中文',
  '简体中文',
  '簡體',
  '简体',
]);

export function parseMessageLocale(locale: string | undefined | null): MessageLocale | null {
  if (!locale) {
    return null;
  }

  for (const normalized of parseLocalePreferenceTokens(locale)) {
    const parsed = parseSingleMessageLocale(normalized);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function parseLocalePreferenceTokens(locale: string): string[] {
  return locale
    .split(',')
    .map((entry, index) => {
      const [rawToken, ...rawParameters] = entry.trim().split(';');
      const token = normalizeLocaleToken(rawToken);
      const quality = readAcceptLanguageQuality(rawParameters);
      return { token, quality, index };
    })
    .filter((candidate) => candidate.token.length > 0 && candidate.quality > 0)
    .sort((left, right) =>
      right.quality - left.quality || left.index - right.index)
    .map((candidate) => candidate.token);
}

function normalizeLocaleToken(locale: string | undefined): string {
  return (locale ?? '')
    .trim()
    .replace(/_/gu, '-')
    .toLowerCase();
}

function readAcceptLanguageQuality(parameters: string[]): number {
  const qualityParameter = parameters.find((parameter) =>
    parameter.trim().toLowerCase().startsWith('q='));
  if (!qualityParameter) {
    return 1;
  }

  const rawQuality = Number.parseFloat(qualityParameter.split('=')[1]?.trim() ?? '');
  return Number.isFinite(rawQuality) ? Math.min(Math.max(rawQuality, 0), 1) : 0;
}

function parseSingleMessageLocale(normalized: string): MessageLocale | null {
  if (normalized === 'en' || normalized.startsWith('en-')) {
    return 'en';
  }
  if (
    ZH_TW_LOCALE_HINTS.has(normalized)
    || normalized.startsWith('zh-tw-')
    || normalized.startsWith('zh-hant-')
    || normalized.startsWith('zh-hk-')
    || normalized.startsWith('zh-mo-')
  ) {
    return 'zh-TW';
  }
  if (
    ZH_SIMPLIFIED_LOCALE_HINTS.has(normalized)
    || normalized.startsWith('zh-cn-')
    || normalized.startsWith('zh-hans-')
    || normalized.startsWith('zh-sg-')
    || normalized.startsWith('zh-my-')
  ) {
    return null;
  }

  return null;
}

export function normalizeMessageLocale(locale: string | undefined | null): MessageLocale {
  return parseMessageLocale(locale) ?? 'en';
}

function interpolateMessage(
  value: string,
  values?: MessageInterpolationValues,
): string {
  if (!values) {
    return value;
  }
  return value.replace(/\{([^{}]+)\}/g, (match, key: string) => {
    const replacement = values[key];
    return replacement === undefined ? match : String(replacement);
  });
}

export function createTranslator(locale: MessageLocale) {
  return function t(
    key: MessageKey,
    values?: MessageInterpolationValues,
  ): string {
    const catalogKey = key in messageKeys
      ? messageKeys[key as keyof typeof messageKeys]
      : key as MessageCatalogId;
    return interpolateMessage(catalogs[locale][catalogKey] ?? catalogs.en[catalogKey], values);
  };
}

export const t = createTranslator('en');

export { messageKeys };
export const uiMessageKeys = messageKeys;
export type { MessageKey };
export type { MessageCatalogId };
