import { createContext, type ReactNode, useContext, useMemo } from 'react';

import {
  createTranslator,
  type MessageInterpolationValues,
  type MessageKey,
  type MessageLocale,
} from '../../../shared/i18n/index.js';
import type { PlatformUiLanguagePreference } from '../../../shared/platform-contract.js';

interface I18nContextValue {
  locale: MessageLocale;
  languagePreference: PlatformUiLanguagePreference;
  setLanguagePreference: (preference: PlatformUiLanguagePreference) => void;
  t: (key: MessageKey, values?: MessageInterpolationValues) => string;
}

const defaultLocale: MessageLocale = 'en';
const defaultLanguagePreference: PlatformUiLanguagePreference = 'auto';
const noopSetLanguagePreference = () => {};

export const I18nContext = createContext<I18nContextValue>({
  locale: defaultLocale,
  languagePreference: defaultLanguagePreference,
  setLanguagePreference: noopSetLanguagePreference,
  t: createTranslator(defaultLocale),
});

export function I18nProvider({
  children,
  languagePreference = defaultLanguagePreference,
  locale,
  setLanguagePreference = noopSetLanguagePreference,
}: {
  children: ReactNode;
  languagePreference?: PlatformUiLanguagePreference;
  locale: MessageLocale;
  setLanguagePreference?: (preference: PlatformUiLanguagePreference) => void;
}) {
  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      languagePreference,
      setLanguagePreference,
      t: createTranslator(locale),
    }),
    [languagePreference, locale, setLanguagePreference],
  );

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18nValue() {
  return useContext(I18nContext);
}
