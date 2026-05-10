import { useMemo } from 'react';

import type { MobileApiError } from '../../api/client';
import {
  type MobileCatsDirectoryData,
  selectMobileCatsDirectory,
} from '../../../../src/mobile/index.js';
import { useMobileAppShell } from './useMobileAppShell';

export type CatsDirectoryTabState =
  | { kind: 'loading' }
  | { kind: 'unconfigured' }
  | { kind: 'unauthenticated' }
  | { kind: 'error'; error: MobileApiError }
  | { kind: 'data'; data: MobileCatsDirectoryData };

export interface CatsDirectoryTabHook {
  state: CatsDirectoryTabState;
  refetch: () => void;
}

/**
 * Composes `useMobileAppShell` + `selectMobileCatsDirectory`. The
 * mobile Cats tab derives its directory content from the same payload
 * the product sidebars consume — there is no separate `/api/cats`
 * endpoint today (per SPEC-095 the mobile cats projection is a
 * *subset* of the platform projection, not a separate persistence
 * schema).
 */
export function useCatsDirectoryTab(): CatsDirectoryTabHook {
  const { state: shellState, refetch } = useMobileAppShell();
  const data = useMemo(
    () =>
      shellState.kind === 'data'
        ? selectMobileCatsDirectory(shellState.payload)
        : null,
    [shellState],
  );

  let state: CatsDirectoryTabState;
  switch (shellState.kind) {
    case 'loading':
      state = { kind: 'loading' };
      break;
    case 'unconfigured':
      state = { kind: 'unconfigured' };
      break;
    case 'unauthenticated':
      state = { kind: 'unauthenticated' };
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
