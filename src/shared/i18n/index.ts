import { messageKeys, type MessageKey } from './messageKeys.js';
import { enCatalog } from './catalogs/en.js';
import { zhTWCatalog } from './catalogs/zh-TW.js';

export type MessageLocale = 'en' | 'zh-TW';

export interface MessageInterpolationValues {
  [key: string]: unknown;
}

type MessageCatalogId = (typeof messageKeys)[MessageKey];

export type MessageCatalog = Record<MessageCatalogId, string>;

const catalogs: Record<MessageLocale, MessageCatalog> = {
  en: enCatalog,
  'zh-TW': zhTWCatalog,
};

export function normalizeMessageLocale(locale: string | undefined | null): MessageLocale {
  return locale === 'zh-TW' ? 'zh-TW' : 'en';
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
    const catalogKey = messageKeys[key];
    return interpolateMessage(catalogs[locale][catalogKey] ?? catalogs.en[catalogKey], values);
  };
}

export const t = createTranslator('en');

export const uiMessageKeys = messageKeys;
export type { MessageKey };
