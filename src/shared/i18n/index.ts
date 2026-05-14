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

const ZH_TW_LOCALE_HINT_VALUES = [
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
] as const;

const ZH_SIMPLIFIED_LOCALE_HINT_VALUES = [
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
] as const;

const ZH_TW_LOCALE_PREFIX_VALUES = [
  'zh-tw-',
  'zh-hant-',
  'zh-hk-',
  'zh-mo-',
] as const;

const ZH_SIMPLIFIED_LOCALE_PREFIX_VALUES = [
  'zh-cn-',
  'zh-hans-',
  'zh-sg-',
  'zh-my-',
] as const;

const ZH_TW_LOCALE_HINTS = new Set<string>(ZH_TW_LOCALE_HINT_VALUES);
const ZH_SIMPLIFIED_LOCALE_HINTS = new Set<string>(ZH_SIMPLIFIED_LOCALE_HINT_VALUES);

export function assertMessageLocaleHintInvariants(): void {
  const conflicts: string[] = [];

  for (const hint of ZH_TW_LOCALE_HINT_VALUES) {
    if (ZH_SIMPLIFIED_LOCALE_HINTS.has(hint)) {
      conflicts.push(`exact hint '${hint}' is claimed by both Traditional and Simplified`);
    }
    for (const prefix of ZH_SIMPLIFIED_LOCALE_PREFIX_VALUES) {
      if (hint.startsWith(prefix)) {
        conflicts.push(`Traditional hint '${hint}' is shadowed by Simplified prefix '${prefix}'`);
      }
    }
  }

  for (const hint of ZH_SIMPLIFIED_LOCALE_HINT_VALUES) {
    for (const prefix of ZH_TW_LOCALE_PREFIX_VALUES) {
      if (hint.startsWith(prefix)) {
        conflicts.push(`Simplified hint '${hint}' is shadowed by Traditional prefix '${prefix}'`);
      }
    }
  }

  for (const tradPrefix of ZH_TW_LOCALE_PREFIX_VALUES) {
    for (const simpPrefix of ZH_SIMPLIFIED_LOCALE_PREFIX_VALUES) {
      if (tradPrefix.startsWith(simpPrefix) || simpPrefix.startsWith(tradPrefix)) {
        conflicts.push(
          `prefix conflict: Traditional '${tradPrefix}' overlaps Simplified '${simpPrefix}'`,
        );
      }
    }
  }

  if (conflicts.length > 0) {
    throw new Error(`Message locale hints overlap:\n  - ${conflicts.join('\n  - ')}`);
  }
}

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
    /^q\s*=/iu.test(parameter.trim()));
  if (!qualityParameter) {
    return 1;
  }

  const qualityMatch = /^q\s*=\s*(?<quality>.*)$/iu.exec(qualityParameter.trim());
  if (!qualityMatch?.groups) {
    return 1;
  }

  // RFC 7231 qvalue is `0(.0..0)? | 1(.0..0)?`; we reject anything outside a
  // plain unsigned decimal (no sign, no exponent, no trailing garbage) so
  // sloppy parseFloat coercions like `q=0.5abc` → 0.5 cannot slip through.
  // Malformed q-values are ignored as if the parameter was absent, keeping
  // the locale usable.
  const rawQualityText = qualityMatch.groups.quality.trim();
  if (!/^\d+(?:\.\d+)?$/u.test(rawQualityText)) {
    return 1;
  }
  const rawQuality = Number.parseFloat(rawQualityText);
  return Math.min(Math.max(rawQuality, 0), 1);
}

function parseSingleMessageLocale(normalized: string): MessageLocale | null {
  if (normalized === 'en' || normalized.startsWith('en-')) {
    return 'en';
  }
  if (matchesLocaleHint(normalized, ZH_TW_LOCALE_HINTS, ZH_TW_LOCALE_PREFIX_VALUES)) {
    return 'zh-TW';
  }
  if (
    matchesLocaleHint(normalized, ZH_SIMPLIFIED_LOCALE_HINTS, ZH_SIMPLIFIED_LOCALE_PREFIX_VALUES)
  ) {
    // Recognized, but unsupported until a Simplified Chinese catalog exists.
    return null;
  }

  return null;
}

function matchesLocaleHint(
  normalized: string,
  exactHints: ReadonlySet<string>,
  prefixes: readonly string[],
): boolean {
  if (exactHints.has(normalized)) {
    return true;
  }
  return prefixes.some((prefix) => normalized.startsWith(prefix));
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
