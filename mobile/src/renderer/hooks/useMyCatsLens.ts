import { useMemo } from 'react';

import type { MobileApiError } from '../../api/client';
import {
  type MobileSidebarCat,
  selectMobileMyCatsLens,
} from '../../../../src/mobile/index.js';
import { useMobileAppShell } from './useMobileAppShell';

export type MyCatsLensState =
  | { kind: 'loading' }
  | { kind: 'unconfigured' }
  | { kind: 'error'; error: MobileApiError }
  | { kind: 'data'; cats: MobileSidebarCat[] };

export interface MyCatsLensHook {
  state: MyCatsLensState;
  refetch: () => void;
}

export function useMyCatsLens(
  product: 'chat' | 'code' | 'work',
): MyCatsLensHook {
  const { state: shellState, refetch } = useMobileAppShell();
  const cats = useMemo(
    () =>
      shellState.kind === 'data'
        ? selectMobileMyCatsLens(shellState.payload, product)
        : null,
    [shellState, product],
  );

  let state: MyCatsLensState;
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
      state = { kind: 'data', cats: cats! };
      break;
  }

  return { state, refetch };
}
