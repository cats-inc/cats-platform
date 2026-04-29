import { useMemo } from 'react';

import type { MobileApiError } from '../../api/client';
import {
  type MobileSidebarCat,
  type MobileSidebarRecent,
  selectMobileMyCatsLens,
  selectMobileProductRecents,
} from '../../../../src/mobile/index.js';
import { useMobileAppShell } from './useMobileAppShell';

/**
 * Combined hook for the trimmed product sidebar — yields both the
 * MY-lens cats and the product Recents off a single
 * `useMobileAppShell` fetch. Each Chat / Code / Work tab renders its
 * sidebar inline (cats + recents under section headers, like the
 * web sidebar) so it needs both projections at once.
 */

export type ProductSidebarState =
  | { kind: 'loading' }
  | { kind: 'unconfigured' }
  | { kind: 'error'; error: MobileApiError }
  | {
      kind: 'data';
      cats: MobileSidebarCat[];
      recents: MobileSidebarRecent[];
    };

export interface ProductSidebarHook {
  state: ProductSidebarState;
  refetch: () => void;
}

export function useProductSidebarData(
  product: 'chat' | 'code' | 'work',
): ProductSidebarHook {
  const { state: shellState, refetch } = useMobileAppShell();
  const projected = useMemo(() => {
    if (shellState.kind !== 'data') {
      return null;
    }
    return {
      cats: selectMobileMyCatsLens(shellState.payload, product),
      recents: selectMobileProductRecents(shellState.payload, product),
    };
  }, [shellState, product]);

  let state: ProductSidebarState;
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
      state = {
        kind: 'data',
        cats: projected!.cats,
        recents: projected!.recents,
      };
      break;
  }

  return { state, refetch };
}
