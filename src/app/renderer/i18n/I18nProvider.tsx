import { createContext, type ReactNode, useContext, useMemo } from 'react';

import {
  createTranslator,
  type MessageInterpolationValues,
  type MessageKey,
  type MessageLocale,
} from '../../../shared/i18n/index.js';

interface I18nContextValue {
  locale: MessageLocale;
  t: (key: MessageKey, values?: MessageInterpolationValues) => string;
}

const defaultLocale: MessageLocale = 'en';

export const I18nContext = createContext<I18nContextValue>({
  locale: defaultLocale,
  t: createTranslator(defaultLocale),
});

export function I18nProvider({
  children,
  locale,
}: {
  children: ReactNode;
  locale: MessageLocale;
}) {
  const value = useMemo<I18nContextValue>(
    () => ({ locale, t: createTranslator(locale) }),
    [locale],
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
