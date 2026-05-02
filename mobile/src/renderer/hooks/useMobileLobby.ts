import { useMemo } from 'react';

import type { MobileApiError } from '../../api/client';
import {
  resolveDefaultMobileLocale,
  type MobileLobbyData,
  selectMobileLobby,
} from '../../../../src/mobile/index.js';
import { useMobileAppShell } from './useMobileAppShell';

export type MobileLobbyState =
  | { kind: 'loading' }
  | { kind: 'unconfigured' }
  | { kind: 'error'; error: MobileApiError }
  | { kind: 'data'; data: MobileLobbyData };

export interface MobileLobbyHook {
  state: MobileLobbyState;
  refetch: () => void;
}

/**
 * Composes `useMobileAppShell` + `selectMobileLobby`. Mobile derives
 * Lobby content from the same payload the sidebars consume — there
 * is no separate `/api/lobby` endpoint today (per SPEC-095 the
 * mobile lobby is a *subset* of the platform projection, not a
 * separate persistence schema).
 */
export function useMobileLobby(): MobileLobbyHook {
  const { state: shellState, refetch } = useMobileAppShell();
  const locale = resolveDefaultMobileLocale();
  const data = useMemo(
    () =>
      shellState.kind === 'data'
        ? selectMobileLobby(shellState.payload, { locale })
        : null,
    [locale, shellState],
  );

  let state: MobileLobbyState;
  switch (shellState.kind) {
    case 'loading':
      state = { kind: 'loading' };
      break;
    case 'unconfigured':
      state = { kind: 'unconfigured' };
      break;
    case 'error':
      state = { kind: 'error', error: shellState.error };
      break;
    case 'data':
      state = { kind: 'data', data: data! };
      break;
  }

  return { state, refetch };
}
