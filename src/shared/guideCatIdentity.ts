export const GUIDE_CAT_SYSTEM_NAME = 'Catlas';

interface LocalizedGuideCatName {
  prefixes: string[];
  name: string;
}

const LOCALIZED_GUIDE_CAT_NAMES: readonly LocalizedGuideCatName[] = [];

type LocaleSource = string | readonly string[] | null | undefined;

interface NavigatorLike {
  languages?: readonly string[];
  language?: string;
}

function normalizeLocaleTag(value: string): string {
  return value.trim().toLowerCase();
}

function collectLocaleCandidates(source: LocaleSource): string[] {
  if (Array.isArray(source)) {
    return source
      .map((entry) => normalizeLocaleTag(entry))
      .filter((entry) => entry.length > 0);
  }

  if (typeof source !== 'string') {
    return [];
  }

  return source
    .split(',')
    .map((entry) => normalizeLocaleTag(entry.split(';', 1)[0] ?? ''))
    .filter((entry) => entry.length > 0);
}

export function readGuideCatLocaleSourceFromNavigator(): readonly string[] | string | null {
  const globalNavigator = (
    typeof globalThis === 'object'
    && globalThis !== null
    && 'navigator' in globalThis
  )
    ? (globalThis as { navigator?: NavigatorLike }).navigator
    : undefined;

  if (!globalNavigator) {
    return null;
  }

  if (Array.isArray(globalNavigator.languages) && globalNavigator.languages.length > 0) {
    return globalNavigator.languages;
  }

  return typeof globalNavigator.language === 'string' ? globalNavigator.language : null;
}

export function resolveGuideCatSystemName(localeSource?: LocaleSource): string {
  const candidates = collectLocaleCandidates(localeSource);

  for (const candidate of candidates) {
    const localized = LOCALIZED_GUIDE_CAT_NAMES.find((entry) =>
      entry.prefixes.some((prefix) => candidate === prefix || candidate.startsWith(`${prefix}-`))
    );
    if (localized) {
      return localized.name;
    }
  }

  return GUIDE_CAT_SYSTEM_NAME;
}

export function resolveClientGuideCatName(): string {
  return resolveGuideCatSystemName(readGuideCatLocaleSourceFromNavigator());
}

export function isGuideCatEnabledStatus(status?: string | null): boolean {
  return status === undefined || status === null || status === 'active';
}
