import { useEffect, useReducer } from 'react';

import {
  resolveDefaultMobileLocale,
  subscribeMobileLocale,
  type MobileLocale,
} from '../../../../src/mobile/index.js';

/**
 * Returns the active mobile display locale and re-renders the
 * caller whenever `setMobileLocaleOverride` changes it (Settings →
 * Language picker). Components that read
 * `resolveDefaultMobileLocale()` directly do not re-render on
 * change; they cache the locale captured at render time and need
 * an app reopen to pick up the new value. Use this hook on
 * surfaces where instant feedback matters — currently the bottom-
 * tab rail in `(tabs)/_layout.tsx`.
 *
 * The hook composes `subscribeMobileLocale()` with a no-op
 * `useReducer` so the React tree gets a forced render on every
 * notification. Resolution itself is still synchronous and goes
 * through `resolveDefaultMobileLocale()`.
 */
export function useMobileLocale(): MobileLocale {
  const [, force] = useReducer((tick: number) => tick + 1, 0);
  useEffect(() => subscribeMobileLocale(force), []);
  return resolveDefaultMobileLocale();
}
