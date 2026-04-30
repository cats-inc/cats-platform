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

export function parseMessageLocale(locale: string | undefined | null): MessageLocale | null {
  if (!locale) {
    return null;
  }

  const normalized = locale.replace(/_/gu, '-').toLowerCase();
  if (normalized === 'en' || normalized.startsWith('en-')) {
    return 'en';
  }
  if (
    normalized === 'zh-tw'
    || normalized === 'zh-hant'
    || normalized.startsWith('zh-tw-')
    || normalized.startsWith('zh-hant-')
  ) {
    return 'zh-TW';
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
