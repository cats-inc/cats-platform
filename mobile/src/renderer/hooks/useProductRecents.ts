import { useMemo } from 'react';

import type { MobileApiError } from '../../api/client';
import {
  type MobileSidebarRecent,
  selectMobileProductRecents,
} from '../../../../src/mobile/index.js';
import { useMobileAppShell } from './useMobileAppShell';

export type ProductRecentsState =
  | { kind: 'loading' }
  | { kind: 'unconfigured' }
  | { kind: 'error'; error: MobileApiError }
  | { kind: 'data'; recents: MobileSidebarRecent[] };

export interface ProductRecentsHook {
  state: ProductRecentsState;
  refetch: () => void;
}

export function useProductRecents(
  product: 'chat' | 'code' | 'work',
): ProductRecentsHook {
  const { state: shellState, refetch } = useMobileAppShell();
  const recents = useMemo(
    () =>
      shellState.kind === 'data'
        ? selectMobileProductRecents(shellState.payload, product)
        : null,
    [shellState, product],
  );

  let state: ProductRecentsState;
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
      state = { kind: 'data', recents: recents! };
      break;
  }

  return { state, refetch };
}
